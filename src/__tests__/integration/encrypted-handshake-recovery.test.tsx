/**
 * Integration Test: Encrypted handshake recovery
 *
 * Core closes the socket without an error frame when it cannot establish an
 * encrypted session, most often because it no longer knows this app's auth
 * token. Drives the real ConnectionProvider, ConnectionManager, and
 * WebSocketTransport against a scripted socket so the retry budget and the
 * pairing prompt are exercised together.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "../../test-utils";
import { ConnectionProvider } from "@/components/ConnectionProvider";
import { ConnectionStatusDisplay } from "@/components/ConnectionStatusDisplay";
import {
  credentialKeyForRecord,
  credentialStore,
  type StoredCredentials,
} from "@/lib/crypto/credentials";
import { EncryptedSession } from "@/lib/crypto/session";
import { ConnectionState, useStatusStore } from "@/lib/store";
import {
  mockDeviceRecord,
  seedDeviceRegistry,
} from "@/test-utils/deviceRegistry";

class ScriptedWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;
  static instances: ScriptedWebSocket[] = [];

  readonly url: string;
  readyState = ScriptedWebSocket.CONNECTING;
  onopen: ((event: Event) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;

  constructor(url: string) {
    this.url = url;
    ScriptedWebSocket.instances.push(this);
  }

  static latest(): ScriptedWebSocket {
    return ScriptedWebSocket.instances[ScriptedWebSocket.instances.length - 1]!;
  }

  send(): void {}

  close(): void {
    this.readyState = ScriptedWebSocket.CLOSED;
  }

  open(): void {
    this.readyState = ScriptedWebSocket.OPEN;
    this.onopen?.(new Event("open"));
  }

  closeWithoutErrorFrame(): void {
    this.readyState = ScriptedWebSocket.CLOSED;
    this.onclose?.(new CloseEvent("close", { code: 1006 }));
  }

  receiveEncrypted(plaintext: string): void {
    this.onmessage?.(
      new MessageEvent("message", {
        data: JSON.stringify({ e: btoa(plaintext) }),
      }),
    );
  }
}

const credentials: StoredCredentials = {
  authToken: "auth-token-uuid",
  pairingKey: "ab".repeat(32),
  clientId: "client-id-uuid",
  pairedAt: 1700000000000,
};

const RECONNECT_INTERVAL_MS = 2000;

async function flush(ms = 0) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

async function openThenCloseDuringHandshake() {
  ScriptedWebSocket.latest().open();
  await flush();
  act(() => {
    ScriptedWebSocket.latest().closeWithoutErrorFrame();
  });
}

describe("Encrypted handshake recovery", () => {
  const record = mockDeviceRecord({ address: "192.168.1.100" });

  beforeEach(async () => {
    vi.useFakeTimers();
    ScriptedWebSocket.instances = [];
    vi.stubGlobal("WebSocket", ScriptedWebSocket);
    vi.spyOn(EncryptedSession, "create").mockResolvedValue({
      encryptAndFrame: vi.fn(async (plaintext: string) =>
        JSON.stringify({ e: btoa(plaintext) }),
      ),
      decrypt: vi.fn(async (ciphertext: string) => atob(ciphertext)),
    } as unknown as EncryptedSession);
    useStatusStore.setState({ ...useStatusStore.getInitialState() });
    await seedDeviceRegistry([record], record.recordId);
    await credentialStore.set(
      credentialKeyForRecord(record.recordId),
      credentials,
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  function renderProvider() {
    return render(
      <ConnectionProvider>
        <ConnectionStatusDisplay />
      </ConnectionProvider>,
    );
  }

  it("should recover when Core closes a single encrypted handshake", async () => {
    renderProvider();
    await flush();

    await openThenCloseDuringHandshake();
    expect(
      screen.getByText("connection.reconnectingToCore"),
    ).toBeInTheDocument();

    await flush(RECONNECT_INTERVAL_MS);
    ScriptedWebSocket.latest().open();
    await flush();
    act(() => {
      ScriptedWebSocket.latest().receiveEncrypted("pong");
    });
    await flush();

    expect(screen.getByText("scan.connectedHeading")).toBeInTheDocument();
    expect(screen.getByLabelText("connection.encrypted")).toBeInTheDocument();
    expect(useStatusStore.getState()).toMatchObject({
      connectionState: ConnectionState.CONNECTED,
      encryptionState: "encrypted",
      pairingRequired: false,
      connectionError: "",
    });
    expect(
      screen.queryByRole("dialog", { name: "pairing.title" }),
    ).not.toBeInTheDocument();
  });

  it("should ask to pair again when Core keeps closing the encrypted handshake", async () => {
    renderProvider();
    await flush();

    await openThenCloseDuringHandshake();
    await flush(RECONNECT_INTERVAL_MS);
    await openThenCloseDuringHandshake();
    await flush(RECONNECT_INTERVAL_MS);
    await openThenCloseDuringHandshake();
    await flush();

    expect(screen.getByText("connection.pairingRequired")).toBeInTheDocument();
    expect(
      screen.getByRole("dialog", { name: "pairing.title" }),
    ).toBeInTheDocument();
    expect(useStatusStore.getState()).toMatchObject({
      pairingRequired: true,
      connectionError: "pairing.connectionError.handshakeRejected",
    });

    // The transport stays blocked until pairing succeeds, and the stored
    // pairing survives because nothing proved it was revoked.
    await flush(RECONNECT_INTERVAL_MS * 5);
    expect(ScriptedWebSocket.instances).toHaveLength(3);
    await expect(
      credentialStore.get(credentialKeyForRecord(record.recordId)),
    ).resolves.toEqual(credentials);
  });
});
