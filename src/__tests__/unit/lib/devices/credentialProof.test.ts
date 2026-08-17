import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  credentialKeyForRecord,
  credentialStore,
  type StoredCredentials,
} from "@/lib/crypto/credentials";
import { EncryptedSession } from "@/lib/crypto/session";
import {
  proveSavedRecordCredentials,
  reconcileCredentialProvenAliases,
  type CredentialProofProbe,
} from "@/lib/devices/credentialProof";
import { deviceRegistry } from "@/lib/devices/deviceRegistry";
import {
  mockDeviceRecord,
  seedDeviceRegistry,
} from "@/test-utils/deviceRegistry";

const credentials: StoredCredentials = {
  authToken: "token-abc",
  pairingKey: "a".repeat(64),
  clientId: "client-uuid-1234",
  pairedAt: 1700000000000,
};

class ProbeWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSED = 3;
  static failUrls = new Set<string>();

  readonly url: string;
  readyState = ProbeWebSocket.CONNECTING;
  onopen: (() => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: (() => void) | null = null;

  constructor(url: string) {
    this.url = url;
    queueMicrotask(() => {
      if (ProbeWebSocket.failUrls.has(url)) {
        this.readyState = ProbeWebSocket.CLOSED;
        this.onerror?.();
        return;
      }
      this.readyState = ProbeWebSocket.OPEN;
      this.onopen?.();
    });
  }

  send(): void {
    queueMicrotask(() => {
      this.onmessage?.(
        new MessageEvent("message", {
          data: JSON.stringify({ e: "encrypted-response" }),
        }),
      );
    });
  }

  close(): void {
    this.readyState = ProbeWebSocket.CLOSED;
  }
}

describe("credential-proven device aliases", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    ProbeWebSocket.failUrls.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("should prove credentials only after decrypting a server response", async () => {
    vi.stubGlobal("WebSocket", ProbeWebSocket);
    const decrypt = vi.fn().mockResolvedValue('{"jsonrpc":"2.0"}');
    vi.spyOn(EncryptedSession, "create").mockResolvedValue({
      encryptAndFrame: vi.fn().mockResolvedValue("encrypted-request"),
      decrypt,
    } as unknown as EncryptedSession);

    await expect(
      proveSavedRecordCredentials(
        ["ws://steamdeck.local:7497/api/v0.1"],
        credentials,
      ),
    ).resolves.toBe(true);
    expect(decrypt).toHaveBeenCalledWith("encrypted-response");
  });

  it("should try the next saved route after a connection failure", async () => {
    vi.stubGlobal("WebSocket", ProbeWebSocket);
    ProbeWebSocket.failUrls.add("ws://10.0.0.205:7497/api/v0.1");
    vi.spyOn(EncryptedSession, "create").mockResolvedValue({
      encryptAndFrame: vi.fn().mockResolvedValue("encrypted-request"),
      decrypt: vi.fn().mockResolvedValue("response"),
    } as unknown as EncryptedSession);

    await expect(
      proveSavedRecordCredentials(
        ["ws://10.0.0.205:7497/api/v0.1", "ws://10.0.0.206:7497/api/v0.1"],
        credentials,
      ),
    ).resolves.toBe(true);
  });

  it("should reject malformed credentials without opening a socket", async () => {
    const socket = vi.fn();
    vi.stubGlobal("WebSocket", socket);

    await expect(
      proveSavedRecordCredentials(["ws://steamdeck.local:7497/api/v0.1"], {
        ...credentials,
        pairingKey: "not-hex",
      }),
    ).resolves.toBe(false);
    expect(socket).not.toHaveBeenCalled();
  });

  it("should merge a saved alias only after encrypted proof succeeds", async () => {
    const target = mockDeviceRecord({
      address: "steamdeck.local",
      name: "Steamdeck",
      discoveryId: "core-a",
    });
    const alias = mockDeviceRecord({
      address: "10.0.0.206",
      name: "Steamdeck",
      discoveryId: "core-a",
    });
    await seedDeviceRegistry([target, alias], target.recordId);
    await credentialStore.set(
      credentialKeyForRecord(target.recordId),
      credentials,
    );
    const probe = vi.fn<CredentialProofProbe>().mockResolvedValue(true);

    const mergedIds = await reconcileCredentialProvenAliases(
      target.recordId,
      credentials,
      probe,
    );

    expect(probe).toHaveBeenCalledWith(
      ["ws://10.0.0.206:7497/api/v0.1"],
      credentials,
    );
    expect(mergedIds).toEqual([alias.recordId]);
    expect(
      deviceRegistry.getSnapshot().records[alias.recordId],
    ).toBeUndefined();
    expect(
      deviceRegistry.getSnapshot().records[target.recordId]?.endpoints,
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ host: "steamdeck.local" }),
        expect.objectContaining({ host: "10.0.0.206" }),
      ]),
    );
  });

  it("should retain both records when encrypted proof fails", async () => {
    const target = mockDeviceRecord({
      address: "steamdeck.local",
      name: "Steamdeck",
      discoveryId: "core-a",
    });
    const alias = mockDeviceRecord({
      address: "10.0.0.206",
      name: "Steamdeck",
      discoveryId: "core-a",
    });
    await seedDeviceRegistry([target, alias], target.recordId);
    const probe = vi.fn<CredentialProofProbe>().mockResolvedValue(false);

    await reconcileCredentialProvenAliases(target.recordId, credentials, probe);

    expect(Object.keys(deviceRegistry.getSnapshot().records)).toEqual([
      target.recordId,
      alias.recordId,
    ]);
  });

  it("should stop when the credential-owning record is not active", async () => {
    const target = mockDeviceRecord({
      address: "steamdeck.local",
      name: "Steamdeck",
    });
    const active = mockDeviceRecord({
      address: "10.0.0.50",
      name: "Other",
    });
    await seedDeviceRegistry([target, active], active.recordId);
    const probe = vi.fn<CredentialProofProbe>().mockResolvedValue(true);

    await expect(
      reconcileCredentialProvenAliases(target.recordId, credentials, probe),
    ).resolves.toEqual([]);
    expect(probe).not.toHaveBeenCalled();
  });

  it("should not probe records with conflicting discovery IDs", async () => {
    const target = mockDeviceRecord({
      address: "steamdeck.local",
      name: "Steamdeck",
      discoveryId: "core-a",
    });
    const other = mockDeviceRecord({
      address: "10.0.0.206",
      name: "Steamdeck",
      discoveryId: "core-b",
    });
    await seedDeviceRegistry([target, other], target.recordId);
    const probe = vi.fn<CredentialProofProbe>().mockResolvedValue(true);

    await reconcileCredentialProvenAliases(target.recordId, credentials, probe);

    expect(probe).not.toHaveBeenCalled();
    expect(deviceRegistry.getSnapshot().records[other.recordId]).toBeDefined();
  });

  it("should not expose credentials based only on matching names", async () => {
    const target = mockDeviceRecord({
      address: "steamdeck.local",
      name: "Steamdeck",
    });
    const other = mockDeviceRecord({
      address: "10.0.0.80",
      name: "Steamdeck",
    });
    await seedDeviceRegistry([target, other], target.recordId);
    const probe = vi.fn<CredentialProofProbe>().mockResolvedValue(true);

    await reconcileCredentialProvenAliases(target.recordId, credentials, probe);

    expect(probe).not.toHaveBeenCalled();
  });

  it("should limit concurrent credential probes", async () => {
    const target = mockDeviceRecord({
      address: "steamdeck.local",
      discoveryId: "core-a",
    });
    const candidates = Array.from({ length: 7 }, (_, index) =>
      mockDeviceRecord({
        address: `10.0.0.${index + 1}`,
        discoveryId: "core-a",
      }),
    );
    await seedDeviceRegistry([target, ...candidates], target.recordId);
    let activeProbes = 0;
    let maxActiveProbes = 0;
    const probe = vi.fn<CredentialProofProbe>().mockImplementation(async () => {
      activeProbes += 1;
      maxActiveProbes = Math.max(maxActiveProbes, activeProbes);
      await Promise.resolve();
      activeProbes -= 1;
      return false;
    });

    await reconcileCredentialProvenAliases(target.recordId, credentials, probe);

    expect(probe).toHaveBeenCalledTimes(7);
    expect(maxActiveProbes).toBe(3);
  });
});
