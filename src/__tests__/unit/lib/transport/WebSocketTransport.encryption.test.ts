/**
 * WebSocket transport encryption tests.
 *
 * Covers the encrypt/decrypt flow, -32002 encryption-required signal,
 * -32001 unsupported-version signal, and credentials-revoked handling.
 * EncryptedSession is mocked so tests run without WebCrypto.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { WebSocketTransport } from "@/lib/transport/WebSocketTransport";
import { EncryptedSession } from "@/lib/crypto/session";

vi.mock("@/lib/crypto/session", () => ({
  EncryptedSession: {
    create: vi.fn(),
  },
}));

// ── MockWebSocket ────────────────────────────────────────────────────────────

class MockWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;

  readyState = MockWebSocket.CONNECTING;
  onopen: ((event: Event) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;

  url: string;
  sentMessages: string[] = [];

  static instances: MockWebSocket[] = [];

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
  }

  send(data: string): void {
    if (this.readyState !== MockWebSocket.OPEN)
      throw new Error("WebSocket is not open");
    this.sentMessages.push(data);
  }

  close(_code?: number, _reason?: string): void {
    this.readyState = MockWebSocket.CLOSED;
  }

  simulateOpen(): void {
    this.readyState = MockWebSocket.OPEN;
    this.onopen?.(new Event("open"));
  }

  simulateClose(code = 1000, reason = ""): void {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.(new CloseEvent("close", { code, reason }));
  }

  simulateMessage(data: string): void {
    this.onmessage?.(new MessageEvent("message", { data }));
  }

  static getLatest(): MockWebSocket | undefined {
    return MockWebSocket.instances[MockWebSocket.instances.length - 1];
  }

  static reset(): void {
    MockWebSocket.instances = [];
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const mockCreds = {
  authToken: "auth-token-uuid",
  pairingKey: "aa".repeat(32), // 64 hex chars
  clientId: "client-id-uuid",
  pairedAt: 1700000000000,
};

// Simple btoa/atob-based mock session: encryptAndFrame wraps in {v,e,t,s},
// decrypt unwraps by reversing atob on the `e` field.
function makeMockSession() {
  let firstFrameSent = false;
  return {
    encryptAndFrame: vi.fn(async (plaintext: string): Promise<string> => {
      const e = btoa(plaintext);
      if (!firstFrameSent) {
        firstFrameSent = true;
        return JSON.stringify({ v: 1, e, t: "auth-token-uuid", s: "c2FsdA==" });
      }
      return JSON.stringify({ e });
    }),
    decrypt: vi.fn(async (ciphertext: string): Promise<string> => {
      return atob(ciphertext);
    }),
    authToken: "auth-token-uuid",
  };
}

function makeTransport(hasCreds = true) {
  return new WebSocketTransport({
    deviceId: "test-device",
    url: "ws://localhost:7497",
    encryption: {
      getCredentials: () => Promise.resolve(hasCreds ? mockCreds : null),
    },
  });
}

function makeTransportWithCreds(creds: typeof mockCreds) {
  return new WebSocketTransport({
    deviceId: "test-device",
    url: "ws://localhost:7497",
    encryption: {
      getCredentials: () => Promise.resolve(creds),
    },
  });
}

// Flush Promise microtask chains (getCredentials → EncryptedSession.create etc.)
const flushPromises = () => new Promise<void>((r) => setTimeout(r, 0));

// ── Tests ────────────────────────────────────────────────────────────────────

describe("WebSocketTransport encryption", () => {
  beforeEach(() => {
    MockWebSocket.reset();
    vi.stubGlobal("WebSocket", MockWebSocket);
    vi.mocked(EncryptedSession.create).mockResolvedValue(
      makeMockSession() as unknown as EncryptedSession,
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  describe("encrypted handshake", () => {
    it("should reach connected state after encrypted init", async () => {
      const transport = makeTransport();
      transport.connect();

      MockWebSocket.getLatest()!.simulateOpen();
      await flushPromises();

      expect(transport.state).toBe("connected");
      expect(EncryptedSession.create).toHaveBeenCalledWith(
        "auth-token-uuid",
        expect.any(Uint8Array),
      );

      transport.destroy();
    });

    it("should send first frame with encryption header fields", async () => {
      const transport = makeTransport();
      transport.connect();

      const ws = MockWebSocket.getLatest()!;
      ws.simulateOpen();
      await flushPromises();

      transport.send('{"jsonrpc":"2.0","id":1,"method":"version"}');
      await flushPromises();

      expect(ws.sentMessages).toHaveLength(1);
      const frame = JSON.parse(ws.sentMessages[0]!) as Record<string, unknown>;
      expect(frame).toHaveProperty("v", 1);
      expect(frame).toHaveProperty("e");
      expect(frame).toHaveProperty("t");
      expect(frame).toHaveProperty("s");

      transport.destroy();
    });

    it("should decrypt incoming frames and fire onMessage + onEncryptedHandshakeOk", async () => {
      const onMessage = vi.fn();
      const onEncryptedHandshakeOk = vi.fn();
      const transport = makeTransport();
      transport.setEventHandlers({ onMessage, onEncryptedHandshakeOk });
      transport.connect();

      const ws = MockWebSocket.getLatest()!;
      ws.simulateOpen();
      await flushPromises();

      const responseBody =
        '{"jsonrpc":"2.0","id":1,"result":{"version":"1.0"}}';
      ws.simulateMessage(JSON.stringify({ e: btoa(responseBody) }));
      await flushPromises();

      expect(onEncryptedHandshakeOk).toHaveBeenCalledTimes(1);
      expect(onMessage).toHaveBeenCalledTimes(1);
      const msg = onMessage.mock.calls[0]![0] as MessageEvent;
      expect(msg.data).toBe(responseBody);

      transport.destroy();
    });

    it("should not fire onEncryptedHandshakeOk twice", async () => {
      const onEncryptedHandshakeOk = vi.fn();
      const transport = makeTransport();
      transport.setEventHandlers({ onEncryptedHandshakeOk });
      transport.connect();

      const ws = MockWebSocket.getLatest()!;
      ws.simulateOpen();
      await flushPromises();

      ws.simulateMessage(JSON.stringify({ e: btoa("first") }));
      await flushPromises();
      ws.simulateMessage(JSON.stringify({ e: btoa("second") }));
      await flushPromises();

      expect(onEncryptedHandshakeOk).toHaveBeenCalledTimes(1);

      transport.destroy();
    });
  });

  describe("encryption-blocked failures", () => {
    it("should fail without auto-reconnect when server closes during encrypted handshake", async () => {
      const onError = vi.fn();
      const transport = makeTransport();
      transport.setEventHandlers({ onError });
      transport.connect();

      MockWebSocket.getLatest()!.simulateOpen();
      await flushPromises();

      // Server closes while we're still in trying-encrypted (no decrypted frame yet)
      MockWebSocket.getLatest()!.simulateClose();

      // No new socket should be created — the binary model surfaces this as an
      // encryption failure instead of falling back to plaintext.
      expect(MockWebSocket.instances).toHaveLength(1);
      expect(onError).toHaveBeenCalledTimes(1);
      expect(transport.state).toBe("disconnected");

      transport.destroy();
    });

    it("should fire onEncryptionRequired and disconnect when no creds and server returns -32002", async () => {
      const onEncryptionRequired = vi.fn();
      const transport = makeTransport(false); // no creds → plaintext attempt
      transport.setEventHandlers({ onEncryptionRequired });
      transport.connect();

      const ws = MockWebSocket.getLatest()!;
      ws.simulateOpen();
      await flushPromises();

      ws.simulateMessage(
        JSON.stringify({ jsonrpc: "2.0", error: { code: -32002 } }),
      );

      expect(onEncryptionRequired).toHaveBeenCalledTimes(1);
      expect(transport.state).toBe("disconnected");
      // Auto-reconnect must not loop on encryption-blocked failures.
      expect(MockWebSocket.instances).toHaveLength(1);

      transport.destroy();
    });

    it("should not transition through 'reconnecting' after -32002 — goes directly to disconnected", async () => {
      const states: string[] = [];
      const onEncryptionRequired = vi.fn();
      const transport = makeTransport(false);
      transport.setEventHandlers({
        onStateChange: (s) => states.push(s),
        onEncryptionRequired,
      });
      transport.connect();

      const ws = MockWebSocket.getLatest()!;
      ws.simulateOpen();
      await flushPromises();

      // Sanity: we should have seen connecting → connected by now.
      expect(states).toContain("connecting");
      expect(states).toContain("connected");

      // Snapshot the index so we can isolate transitions AFTER -32002 arrives.
      const indexBefore32002 = states.length;

      // Server replies -32002. The transport closes the WS as part of
      // failConnectionForEncryption, which triggers onclose → handleDisconnection.
      // Without the fix, handleDisconnection would emit a transient "reconnecting"
      // before scheduleReconnect bails on encryptionBlocked. With the fix, it
      // short-circuits to "disconnected" and never lies to consumers.
      ws.simulateMessage(
        JSON.stringify({ jsonrpc: "2.0", error: { code: -32002 } }),
      );
      await flushPromises();

      const transitionsAfter = states.slice(indexBefore32002);
      expect(onEncryptionRequired).toHaveBeenCalledTimes(1);
      expect(transitionsAfter).not.toContain("reconnecting");
      expect(transport.state).toBe("disconnected");
      // Auto-reconnect must not loop on encryption-blocked failures.
      expect(MockWebSocket.instances).toHaveLength(1);

      transport.destroy();
    });

    it("should fire onCredentialsRevoked when -32002 arrives in encrypted mode", async () => {
      const onCredentialsRevoked = vi.fn();
      const transport = makeTransport(true);
      transport.setEventHandlers({ onCredentialsRevoked });
      transport.connect();

      const ws = MockWebSocket.getLatest()!;
      ws.simulateOpen();
      await flushPromises();

      // Server returns -32002 in encrypted mode (server doesn't recognise creds)
      ws.simulateMessage(
        JSON.stringify({ jsonrpc: "2.0", error: { code: -32002 } }),
      );

      expect(onCredentialsRevoked).toHaveBeenCalledTimes(1);
      expect(transport.state).toBe("disconnected");

      transport.destroy();
    });

    it("should fire onEncryptionRequired and stop reconnecting when WS closes silently in plaintext mode before any reply", async () => {
      const onEncryptionRequired = vi.fn();
      const transport = makeTransport(false); // no creds → plaintext
      transport.setEventHandlers({ onEncryptionRequired });
      transport.connect();

      const ws = MockWebSocket.getLatest()!;
      ws.simulateOpen();
      await flushPromises();

      // Server closes without sending -32002 (buggy Core / lost frame / native
      // WS race). Without the silent-close-plaintext branch, the transport
      // would loop in reconnect with no pairing UI ever surfacing.
      ws.simulateClose(1006, "");
      await flushPromises();

      expect(onEncryptionRequired).toHaveBeenCalledTimes(1);
      expect(transport.state).toBe("disconnected");
      // Auto-reconnect must not loop on this defensive encryption-blocked path.
      expect(MockWebSocket.instances).toHaveLength(1);

      transport.destroy();
    });

    it("should NOT fire onEncryptionRequired on silent close after plaintext was already verified", async () => {
      const onEncryptionRequired = vi.fn();
      const transport = makeTransport(false);
      transport.setEventHandlers({ onEncryptionRequired });
      transport.connect();

      const ws = MockWebSocket.getLatest()!;
      ws.simulateOpen();
      await flushPromises();

      // First reply succeeds → plaintextVerified flips true.
      ws.simulateMessage(
        JSON.stringify({ jsonrpc: "2.0", id: 1, result: { ok: true } }),
      );
      await flushPromises();

      // Now the server crashes / network drops.
      ws.simulateClose(1006, "");
      await flushPromises();

      expect(onEncryptionRequired).not.toHaveBeenCalled();
      // Normal post-connect close → transport schedules a reconnect.
      expect(transport.state).toBe("reconnecting");

      transport.destroy();
    });

    it("should NOT fire onEncryptionRequired when transport has no encryption config", async () => {
      const onEncryptionRequired = vi.fn();
      const transport = new WebSocketTransport({
        deviceId: "no-enc",
        url: "ws://localhost:7497",
        // encryption omitted entirely
      });
      transport.setEventHandlers({ onEncryptionRequired });
      transport.connect();

      const ws = MockWebSocket.getLatest()!;
      ws.simulateOpen();
      await flushPromises();

      ws.simulateClose(1006, "");
      await flushPromises();

      expect(onEncryptionRequired).not.toHaveBeenCalled();

      transport.destroy();
    });

    it("should fire onUnsupportedVersion and disconnect on -32001", async () => {
      const onUnsupportedVersion = vi.fn();
      const transport = makeTransport(false); // plaintext path
      transport.setEventHandlers({ onUnsupportedVersion });
      transport.connect();

      const ws = MockWebSocket.getLatest()!;
      ws.simulateOpen();
      await flushPromises();

      ws.simulateMessage(
        JSON.stringify({ jsonrpc: "2.0", error: { code: -32001 } }),
      );

      expect(onUnsupportedVersion).toHaveBeenCalledTimes(1);
      expect(transport.state).toBe("disconnected");

      transport.destroy();
    });

    it("should ignore immediateReconnect while encryption-blocked until clearEncryptionBlock is called", async () => {
      vi.useFakeTimers();
      try {
        const transport = makeTransport(false); // no creds → plaintext
        transport.connect();

        const ws = MockWebSocket.getLatest()!;
        ws.simulateOpen();
        // Flush the encryption init Promise chain (no timers needed).
        await vi.advanceTimersByTimeAsync(0);

        ws.simulateMessage(
          JSON.stringify({ jsonrpc: "2.0", error: { code: -32002 } }),
        );
        await vi.advanceTimersByTimeAsync(0);
        expect(transport.state).toBe("disconnected");
        expect(MockWebSocket.instances).toHaveLength(1);

        // Lifecycle event (App resume / visibilitychange / network change) —
        // must be a no-op while blocked. immediateReconnect's 500 ms setTimeout
        // is never scheduled, so even after advancing past it no new WS opens.
        transport.immediateReconnect();
        await vi.advanceTimersByTimeAsync(1000);
        expect(MockWebSocket.instances).toHaveLength(1);
        expect(transport.state).toBe("disconnected");

        // Consumer pairs successfully → clears block → reconnect proceeds.
        transport.clearEncryptionBlock();
        transport.immediateReconnect();
        await vi.advanceTimersByTimeAsync(1000);
        expect(MockWebSocket.instances.length).toBeGreaterThan(1);

        transport.destroy();
      } finally {
        vi.useRealTimers();
      }
    });

    it("should ignore connect() while encryption-blocked", async () => {
      const transport = makeTransport(false);
      transport.connect();

      const ws = MockWebSocket.getLatest()!;
      ws.simulateOpen();
      await flushPromises();

      ws.simulateMessage(
        JSON.stringify({ jsonrpc: "2.0", error: { code: -32002 } }),
      );
      await flushPromises();
      expect(transport.state).toBe("disconnected");
      expect(MockWebSocket.instances).toHaveLength(1);

      // A stray connect() call (e.g. from a re-entry path) must respect the
      // block — no new socket, no transition to connecting/reconnecting.
      transport.connect();
      await flushPromises();
      expect(MockWebSocket.instances).toHaveLength(1);
      expect(transport.state).toBe("disconnected");

      transport.destroy();
    });

    it("should allow the next connect to proceed after clearEncryptionBlock", async () => {
      const transport = makeTransport(false);
      transport.connect();

      const ws = MockWebSocket.getLatest()!;
      ws.simulateOpen();
      await flushPromises();

      ws.simulateMessage(
        JSON.stringify({ jsonrpc: "2.0", error: { code: -32002 } }),
      );
      await flushPromises();
      expect(MockWebSocket.instances).toHaveLength(1);

      transport.clearEncryptionBlock();
      transport.connect();
      await flushPromises();

      expect(MockWebSocket.instances).toHaveLength(2);

      transport.destroy();
    });
  });

  describe("close-during-creds-load race (Android Preferences bridge)", () => {
    it("routes close-before-creds-resolve through silent-close-plaintext", async () => {
      const onEncryptionRequired = vi.fn();
      // Creds resolve only when we explicitly call resolveCreds — simulates
      // a slow Capacitor Preferences bridge call that hasn't returned yet.
      let resolveCreds!: (v: null) => void;
      const transport = new WebSocketTransport({
        deviceId: "test-device",
        url: "ws://localhost:7497",
        encryption: {
          getCredentials: () =>
            new Promise<null>((r) => {
              resolveCreds = r;
            }),
        },
      });
      transport.setEventHandlers({ onEncryptionRequired });
      transport.connect();

      const ws = MockWebSocket.getLatest()!;
      ws.simulateOpen();
      // No flushPromises — initEncryption is parked on the creds promise.
      // encMode was set to "plaintext" synchronously in initEncryption, so
      // an onclose right now must hit the silent-close-plaintext branch.

      ws.simulateClose(1006, "");
      await flushPromises();

      expect(onEncryptionRequired).toHaveBeenCalledTimes(1);
      expect(transport.state).toBe("disconnected");
      expect(MockWebSocket.instances).toHaveLength(1);

      // Resolve creds AFTER the close — the stale init must bail out and
      // not clobber the disconnected state with a setState("connected").
      resolveCreds(null);
      await flushPromises();
      expect(transport.state).toBe("disconnected");
      expect(MockWebSocket.instances).toHaveLength(1);

      transport.destroy();
    });

    it("does not call onOpen when getCredentials resolves after the WS already closed", async () => {
      const onOpen = vi.fn();
      const states: string[] = [];
      let resolveCreds!: (v: typeof mockCreds) => void;
      const transport = new WebSocketTransport({
        deviceId: "test-device",
        url: "ws://localhost:7497",
        encryption: {
          getCredentials: () =>
            new Promise<typeof mockCreds>((r) => {
              resolveCreds = r;
            }),
        },
      });
      transport.setEventHandlers({
        onOpen,
        onStateChange: (s) => states.push(s),
      });
      transport.connect();

      const ws = MockWebSocket.getLatest()!;
      ws.simulateOpen();
      ws.simulateClose(1006, "");
      await flushPromises();

      resolveCreds(mockCreds);
      await flushPromises();

      expect(onOpen).not.toHaveBeenCalled();
      expect(states[states.length - 1]).toBe("disconnected");

      transport.destroy();
    });
  });

  describe("malformed credentials", () => {
    it.each([
      ["odd-length hex", "aaa"],
      ["non-hex characters", "z".repeat(64)],
      ["empty string", ""],
    ])(
      "should fire onCredentialsRevoked and disconnect when pairingKey is %s",
      async (_label, pairingKey) => {
        const onCredentialsRevoked = vi.fn();
        const transport = makeTransportWithCreds({
          ...mockCreds,
          pairingKey,
        });
        transport.setEventHandlers({ onCredentialsRevoked });
        transport.connect();

        MockWebSocket.getLatest()!.simulateOpen();
        await flushPromises();

        expect(onCredentialsRevoked).toHaveBeenCalledTimes(1);
        expect(transport.state).toBe("disconnected");
        // Encryption-blocked: must not auto-reconnect on a corrupt key.
        expect(MockWebSocket.instances).toHaveLength(1);
        // EncryptedSession should never be created with a malformed key.
        expect(EncryptedSession.create).not.toHaveBeenCalled();

        transport.destroy();
      },
    );
  });

  describe("plaintext mode signal", () => {
    it("should NOT fire onPlaintextMode on socket open (deferred until first non-error reply)", async () => {
      const onPlaintextMode = vi.fn();
      const transport = makeTransport(false);
      transport.setEventHandlers({ onPlaintextMode });
      transport.connect();

      MockWebSocket.getLatest()!.simulateOpen();
      await flushPromises();

      expect(onPlaintextMode).not.toHaveBeenCalled();
      expect(transport.state).toBe("connected");

      transport.destroy();
    });

    it("should fire onPlaintextMode after first non-error plaintext reply", async () => {
      const onPlaintextMode = vi.fn();
      const transport = makeTransport(false);
      transport.setEventHandlers({ onPlaintextMode });
      transport.connect();

      const ws = MockWebSocket.getLatest()!;
      ws.simulateOpen();
      await flushPromises();

      expect(onPlaintextMode).not.toHaveBeenCalled();

      ws.simulateMessage(
        JSON.stringify({ jsonrpc: "2.0", id: 1, result: { ok: true } }),
      );
      await flushPromises();

      expect(onPlaintextMode).toHaveBeenCalledTimes(1);

      transport.destroy();
    });

    it("should NOT fire onPlaintextMode if first reply is -32002 encryption required", async () => {
      const onPlaintextMode = vi.fn();
      const onEncryptionRequired = vi.fn();
      const transport = makeTransport(false);
      transport.setEventHandlers({ onPlaintextMode, onEncryptionRequired });
      transport.connect();

      const ws = MockWebSocket.getLatest()!;
      ws.simulateOpen();
      await flushPromises();

      ws.simulateMessage(
        JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          error: { code: -32002, message: "Encryption required" },
        }),
      );
      await flushPromises();

      expect(onPlaintextMode).not.toHaveBeenCalled();
      expect(onEncryptionRequired).toHaveBeenCalledTimes(1);

      transport.destroy();
    });

    it("should fire onPlaintextMode at most once per attempt", async () => {
      const onPlaintextMode = vi.fn();
      const transport = makeTransport(false);
      transport.setEventHandlers({ onPlaintextMode });
      transport.connect();

      const ws = MockWebSocket.getLatest()!;
      ws.simulateOpen();
      await flushPromises();

      ws.simulateMessage(
        JSON.stringify({ jsonrpc: "2.0", id: 1, result: { ok: true } }),
      );
      ws.simulateMessage(
        JSON.stringify({ jsonrpc: "2.0", id: 2, result: { ok: true } }),
      );
      ws.simulateMessage(
        JSON.stringify({ jsonrpc: "2.0", id: 3, result: { ok: true } }),
      );
      await flushPromises();

      expect(onPlaintextMode).toHaveBeenCalledTimes(1);

      transport.destroy();
    });

    it("should reset plaintextVerified on cleanup so reconnect re-verifies", async () => {
      const onPlaintextMode = vi.fn();
      const transport = makeTransport(false);
      transport.setEventHandlers({ onPlaintextMode });
      transport.connect();

      let ws = MockWebSocket.getLatest()!;
      ws.simulateOpen();
      await flushPromises();
      ws.simulateMessage(
        JSON.stringify({ jsonrpc: "2.0", id: 1, result: { ok: true } }),
      );
      await flushPromises();

      expect(onPlaintextMode).toHaveBeenCalledTimes(1);

      // Simulate disconnect + reconnect
      ws.simulateClose(1000, "");
      await flushPromises();
      transport.connect();
      ws = MockWebSocket.getLatest()!;
      ws.simulateOpen();
      await flushPromises();

      // Still 1 — verification reset, but no message yet
      expect(onPlaintextMode).toHaveBeenCalledTimes(1);

      ws.simulateMessage(
        JSON.stringify({ jsonrpc: "2.0", id: 2, result: { ok: true } }),
      );
      await flushPromises();

      expect(onPlaintextMode).toHaveBeenCalledTimes(2);

      transport.destroy();
    });

    it("should NOT fire onPlaintextMode when encrypted handshake succeeds", async () => {
      const onPlaintextMode = vi.fn();
      const transport = makeTransport(true);
      transport.setEventHandlers({ onPlaintextMode });
      transport.connect();

      MockWebSocket.getLatest()!.simulateOpen();
      await flushPromises();

      expect(onPlaintextMode).not.toHaveBeenCalled();
      expect(transport.state).toBe("connected");

      transport.destroy();
    });
  });
});
