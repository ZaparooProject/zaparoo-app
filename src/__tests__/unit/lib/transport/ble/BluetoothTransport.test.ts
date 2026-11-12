// @vitest-environment node
// Node environment for the createCipheriv/createDecipheriv Core oracle.

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildNonce, deriveSessionKeyBytes } from "@/lib/crypto/session";
import type { TransportEventHandlers } from "@/lib/transport/types";

interface FakeLink {
  peripheralId: string;
  info: { deviceId: string; maxMessage: number };
  closed: boolean;
  sent: Uint8Array[];
  handlers: {
    onMessage: (m: Uint8Array) => void;
    onClose: (r: string) => void;
  };
  send: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
  rebind: ReturnType<typeof vi.fn>;
  readInfo: ReturnType<typeof vi.fn>;
}

const fake = vi.hoisted(() => {
  const makeLink = (
    peripheralId: string,
    deviceId: string,
    handlers: FakeLink["handlers"],
  ): FakeLink => {
    const link: FakeLink = {
      peripheralId,
      info: { deviceId, maxMessage: 1024 * 1024 },
      closed: false,
      sent: [],
      handlers,
      send: vi.fn(async (message: Uint8Array) => {
        if (link.closed) throw new Error("closed");
        link.sent.push(message);
      }),
      close: vi.fn(async () => {
        link.closed = true;
      }),
      rebind: vi.fn((next: FakeLink["handlers"]) => {
        if (link.closed) return false;
        link.handlers = next;
        return true;
      }),
      readInfo: vi.fn(async () => link.info),
    };
    return link;
  };
  return {
    makeLink,
    links: [] as FakeLink[],
    /** Core device id per peripheral; a missing peripheral fails to open. */
    cores: new Map<string, string>(),
    readiness: "ready" as string,
    scanFinds: [] as string[],
    /** The link identifyBluetoothDevice left open, if any. */
    identified: null as FakeLink | null,
  };
});

vi.mock("@/lib/transport/ble/link", () => {
  class BleLinkDroppedError extends Error {}
  return {
    BleLinkDroppedError,
    BleLink: {
      open: vi.fn(
        async (peripheralId: string, handlers: FakeLink["handlers"]) => {
          const deviceId = fake.cores.get(peripheralId);
          if (!deviceId) throw new Error("connect failed");
          const link = fake.makeLink(peripheralId, deviceId, handlers);
          fake.links.push(link);
          return link;
        },
      ),
    },
  };
});

vi.mock("@/lib/transport/ble/identify", () => ({
  takeIdentifiedLink: vi.fn((peripheralId: string) => {
    const link = fake.identified;
    if (!link || link.peripheralId !== peripheralId) return null;
    fake.identified = null;
    return link;
  }),
}));

vi.mock("@/lib/transport/ble/bluetooth", () => ({
  getBluetoothReadiness: vi.fn(async () => fake.readiness),
}));

vi.mock("@/lib/transport/ble/scanner", () => ({
  findBluetoothDevice: vi.fn(
    async (
      match: (device: {
        peripheralId: string;
        name: string;
      }) => Promise<boolean>,
    ) => {
      for (const peripheralId of fake.scanFinds) {
        const device = { peripheralId, name: "" };
        if (await match(device)) return device;
      }
      return null;
    },
  ),
}));

const {
  BluetoothTransport,
  KNOWN_PERIPHERAL_CONNECT_TIMEOUT_MS,
  PAIRING_KEEPALIVE_MS,
} = await import("@/lib/transport/ble/BluetoothTransport");
const { BleLink, BleLinkDroppedError } =
  await import("@/lib/transport/ble/link");

const pairingKey = randomBytes(32);
const authToken = "550e8400-e29b-41d4-a716-446655440000";
const credentials = {
  authToken,
  pairingKey: pairingKey.toString("hex"),
  clientId: "client-1",
  pairedAt: 1,
};

/** Core's side of one encrypted session, keyed from the first frame. */
class CoreSession {
  private readonly salt: Uint8Array;
  private sendCounter = 0n;
  private recvCounter = 0n;

  constructor(firstFrame: Uint8Array) {
    expect(firstFrame[0]).toBe(1);
    this.salt = firstFrame.subarray(1, 17);
    const tokenLength = firstFrame[17]!;
    expect(
      new TextDecoder().decode(firstFrame.subarray(18, 18 + tokenLength)),
    ).toBe(authToken);
  }

  static ciphertextOf(firstFrame: Uint8Array): Uint8Array {
    return firstFrame.subarray(18 + firstFrame[17]!);
  }

  decrypt(data: Uint8Array): string {
    const raw = deriveSessionKeyBytes(pairingKey, this.salt);
    const decipher = createDecipheriv(
      "aes-256-gcm",
      raw.c2sKey,
      buildNonce(raw.c2sBase, this.recvCounter++),
      { authTagLength: 16 },
    );
    decipher.setAAD(Buffer.from(`${authToken}:ble`));
    decipher.setAuthTag(Buffer.from(data.subarray(data.length - 16)));
    return Buffer.concat([
      decipher.update(Buffer.from(data.subarray(0, data.length - 16))),
      decipher.final(),
    ]).toString("utf8");
  }

  encrypt(plaintext: string): Uint8Array {
    const raw = deriveSessionKeyBytes(pairingKey, this.salt);
    const cipher = createCipheriv(
      "aes-256-gcm",
      raw.s2cKey,
      buildNonce(raw.s2cBase, this.sendCounter++),
      { authTagLength: 16 },
    );
    cipher.setAAD(Buffer.from(`${authToken}:ble`));
    const ct = cipher.update(Buffer.from(plaintext, "utf8"));
    cipher.final();
    return new Uint8Array([...ct, ...cipher.getAuthTag()]);
  }
}

const control = (value: unknown) =>
  new TextEncoder().encode(
    JSON.stringify({ jsonrpc: "2.0", ...(value as object) }),
  );

function handlerSpies() {
  return {
    onOpen: vi.fn(),
    onClose: vi.fn(),
    onError: vi.fn(),
    onMessage: vi.fn(),
    onStateChange: vi.fn(),
    onEncryptedHandshakeOk: vi.fn(),
    onEncryptedHandshakeRejected: vi.fn(),
    onEncryptionRequired: vi.fn(),
    onCredentialsRevoked: vi.fn(),
    onUnsupportedVersion: vi.fn(),
    onHeartbeat: vi.fn(),
    onBluetoothIdentity: vi.fn(),
  } satisfies TransportEventHandlers;
}

function create(
  options: {
    identity?: { coreDeviceId?: string; peripheralId?: string };
    creds?: typeof credentials | null;
  } = {},
) {
  const transport = new BluetoothTransport({
    deviceId: "record-1",
    identity: options.identity ?? {
      coreDeviceId: "core-1",
      peripheralId: "AA",
    },
    encryption: {
      getCredentials: async () =>
        options.creds === undefined ? credentials : options.creds,
    },
    pairingTimeout: 1000,
  });
  const handlers = handlerSpies();
  transport.setEventHandlers(handlers);
  return { transport, handlers };
}

async function connected(options?: Parameters<typeof create>[0]) {
  const made = create(options);
  made.transport.connect();
  await vi.waitFor(() => expect(made.handlers.onOpen).toHaveBeenCalled());
  return { ...made, link: fake.links.at(-1)! };
}

describe("BluetoothTransport", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    fake.links.length = 0;
    fake.cores = new Map([["AA", "core-1"]]);
    fake.readiness = "ready";
    fake.scanFinds = [];
    fake.identified = null;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("opens an encrypted session and exchanges messages", async () => {
    const { transport, handlers, link } = await connected();

    expect(handlers.onOpen).toHaveBeenCalledWith("bluetooth:AA");
    expect(transport.state).toBe("connected");
    expect(transport.link).toBe("bluetooth");
    expect(transport.pairsOverBluetooth).toBe(true);

    transport.send('{"jsonrpc":"2.0","id":1,"method":"version"}');
    await vi.waitFor(() => expect(link.sent).toHaveLength(1));
    const core = new CoreSession(link.sent[0]!);
    expect(core.decrypt(CoreSession.ciphertextOf(link.sent[0]!))).toBe(
      '{"jsonrpc":"2.0","id":1,"method":"version"}',
    );

    link.handlers.onMessage(core.encrypt('{"jsonrpc":"2.0","id":1}'));
    await vi.waitFor(() => expect(handlers.onMessage).toHaveBeenCalled());
    expect(handlers.onEncryptedHandshakeOk).toHaveBeenCalledTimes(1);
    expect(handlers.onMessage.mock.calls[0]![0].data).toBe(
      '{"jsonrpc":"2.0","id":1}',
    );

    transport.send("second");
    await vi.waitFor(() => expect(link.sent).toHaveLength(2));
    expect(core.decrypt(link.sent[1]!)).toBe("second");
    transport.destroy();
  });

  it("measures the heartbeat round trip", async () => {
    const { transport, handlers, link } = await connected();
    transport.send("hello");
    await vi.waitFor(() => expect(link.sent).toHaveLength(1));
    const core = new CoreSession(link.sent[0]!);
    core.decrypt(CoreSession.ciphertextOf(link.sent[0]!));

    await vi.advanceTimersByTimeAsync(30000);
    await vi.waitFor(() => expect(link.sent).toHaveLength(2));
    expect(core.decrypt(link.sent[1]!)).toBe("ping");
    await vi.advanceTimersByTimeAsync(40);
    link.handlers.onMessage(core.encrypt("pong"));

    await vi.waitFor(() => expect(handlers.onHeartbeat).toHaveBeenCalled());
    expect(handlers.onHeartbeat.mock.calls[0]![0]).toBeGreaterThanOrEqual(40);
    expect(handlers.onMessage).not.toHaveBeenCalled();
    transport.destroy();
  });

  it("refuses to send before the link is ready", () => {
    const { transport } = create();
    expect(() => transport.send("x")).toThrow("not ready");
  });

  it("reconnects after Core closes the session", async () => {
    const { transport, handlers, link } = await connected();

    link.handlers.onMessage(
      control({
        id: null,
        error: { code: -32004, message: "closed", data: { reason: "idle" } },
      }),
    );

    expect(handlers.onClose).toHaveBeenCalled();
    expect(link.close).toHaveBeenCalled();
    expect(transport.state).toBe("reconnecting");
    await vi.advanceTimersByTimeAsync(2000);
    await vi.waitFor(() => expect(fake.links).toHaveLength(2));
    transport.destroy();
  });

  it("blocks when Core revokes the credentials", async () => {
    const { transport, handlers, link } = await connected();

    link.handlers.onMessage(
      control({
        id: null,
        error: { code: -32002, message: "encryption required" },
      }),
    );

    expect(handlers.onCredentialsRevoked).toHaveBeenCalled();
    expect(transport.state).toBe("disconnected");
    transport.connect();
    await vi.advanceTimersByTimeAsync(60000);
    expect(fake.links).toHaveLength(1);
    transport.destroy();
  });

  it("blocks on an unsupported encryption version", async () => {
    const { transport, handlers, link } = await connected();

    link.handlers.onMessage(
      control({ id: null, error: { code: -32001, message: "unsupported" } }),
    );

    expect(handlers.onUnsupportedVersion).toHaveBeenCalled();
    transport.destroy();
  });

  it("blocks with a malformed pairing key", async () => {
    const { transport, handlers } = create({
      creds: { ...credentials, pairingKey: "xyz" },
    });
    transport.connect();

    await vi.waitFor(() =>
      expect(handlers.onCredentialsRevoked).toHaveBeenCalled(),
    );
    expect(fake.links[0]!.close).toHaveBeenCalled();
    transport.destroy();
  });

  it("gives up after Core rejects the handshake three times", async () => {
    const { transport, handlers } = await connected();

    for (let attempt = 1; attempt <= 3; attempt++) {
      await vi.waitFor(() => expect(fake.links).toHaveLength(attempt));
      await vi.waitFor(() =>
        expect(handlers.onOpen).toHaveBeenCalledTimes(attempt),
      );
      const link = fake.links[attempt - 1]!;
      transport.send("hello");
      await vi.waitFor(() => expect(link.sent).toHaveLength(1));
      link.handlers.onClose("peripheral disconnected");
      await vi.advanceTimersByTimeAsync(2000);
    }

    expect(handlers.onEncryptedHandshakeRejected).toHaveBeenCalledTimes(1);
    expect(transport.state).toBe("disconnected");
    transport.destroy();
  });

  it("keeps reconnecting when the link drops before the handshake is sent", async () => {
    const { transport, handlers } = await connected();

    for (let attempt = 1; attempt <= 4; attempt++) {
      await vi.waitFor(() =>
        expect(handlers.onOpen).toHaveBeenCalledTimes(attempt),
      );
      fake.links[attempt - 1]!.handlers.onClose("peripheral disconnected");
      expect(transport.state).toBe("reconnecting");
      await vi.advanceTimersByTimeAsync(2000);
    }

    await vi.waitFor(() => expect(handlers.onOpen).toHaveBeenCalledTimes(5));
    expect(handlers.onEncryptedHandshakeRejected).not.toHaveBeenCalled();
    expect(transport.state).toBe("connected");
    transport.destroy();
  });

  it("keeps the session after dropping a first message that is too large", async () => {
    const { transport, link } = await connected();
    link.info.maxMessage = 200;

    transport.send("x".repeat(300));
    transport.send("hello");

    await vi.waitFor(() => expect(link.sent).toHaveLength(1));
    const core = new CoreSession(link.sent[0]!);
    expect(core.decrypt(CoreSession.ciphertextOf(link.sent[0]!))).toBe("hello");
    transport.destroy();
  });

  it("keeps the session after dropping a later message that is too large", async () => {
    const { transport, link } = await connected();
    link.info.maxMessage = 200;

    transport.send("one");
    transport.send("x".repeat(300));
    transport.send("two");

    await vi.waitFor(() => expect(link.sent).toHaveLength(2));
    const core = new CoreSession(link.sent[0]!);
    expect(core.decrypt(CoreSession.ciphertextOf(link.sent[0]!))).toBe("one");
    expect(core.decrypt(link.sent[1]!)).toBe("two");
    transport.destroy();
  });

  it("sends a message that exactly fills Core's limit", async () => {
    const { transport, link } = await connected();
    // Version, salt, token length and token, then the text and its tag.
    const firstFrame = 1 + 16 + 1 + authToken.length + "hello".length + 16;
    link.info.maxMessage = firstFrame;

    transport.send("hello");
    transport.send("x".repeat(firstFrame - 16));
    transport.send("x".repeat(firstFrame - 15));

    await vi.waitFor(() => expect(link.sent).toHaveLength(2));
    expect(link.sent.map((frame) => frame.length)).toEqual([
      firstFrame,
      firstFrame,
    ]);
    transport.destroy();
  });

  it("keeps the link open for pairing when there are no credentials", async () => {
    const { transport, handlers } = create({ creds: null });
    transport.connect();
    await vi.waitFor(() =>
      expect(handlers.onEncryptionRequired).toHaveBeenCalled(),
    );
    const link = fake.links[0]!;

    expect(link.close).not.toHaveBeenCalled();
    expect(transport.isConnected).toBe(false);
    expect(transport.state).toBe("disconnected");

    const call = transport.pairingCall();
    const result = call("pair.start", { name: "Phone" });
    await vi.waitFor(() => expect(link.sent).toHaveLength(1));
    const request = JSON.parse(new TextDecoder().decode(link.sent[0]!));
    expect(request).toMatchObject({
      jsonrpc: "2.0",
      method: "pair.start",
      params: { name: "Phone" },
    });

    link.handlers.onMessage(control({ id: request.id, result: { ok: true } }));
    await expect(result).resolves.toEqual({ ok: true });
    expect(fake.links).toHaveLength(1);
    transport.destroy();
  });

  it("rejects a pairing request with Core's error", async () => {
    const { transport, handlers } = create({ creds: null });
    transport.connect();
    await vi.waitFor(() =>
      expect(handlers.onEncryptionRequired).toHaveBeenCalled(),
    );
    const link = fake.links[0]!;

    const result = transport.pairingCall()("pair.finish", {});
    await vi.waitFor(() => expect(link.sent).toHaveLength(1));
    const { id } = JSON.parse(new TextDecoder().decode(link.sent[0]!));
    link.handlers.onMessage(
      control({ id, error: { code: -32010, message: "wrong PIN" } }),
    );

    await expect(result).rejects.toMatchObject({ code: -32010 });
    transport.destroy();
  });

  it("times out a pairing request Core never answers", async () => {
    const { transport, handlers } = create({ creds: null });
    transport.connect();
    await vi.waitFor(() =>
      expect(handlers.onEncryptionRequired).toHaveBeenCalled(),
    );

    const result = transport.pairingCall()("pair.start", {});
    const outcome = result.then(
      () => null,
      (error: unknown) => error,
    );
    await vi.waitFor(() => expect(fake.links[0]!.sent).toHaveLength(1));
    await vi.advanceTimersByTimeAsync(1000);
    expect(await outcome).toBeInstanceOf(Error);
    expect(String(await outcome)).toContain("timed out");
    transport.destroy();
  });

  it("times out a pairing request whose write never completes", async () => {
    const { transport, handlers } = create({ creds: null });
    transport.connect();
    await vi.waitFor(() =>
      expect(handlers.onEncryptionRequired).toHaveBeenCalled(),
    );
    const link = fake.links[0]!;
    let failWrite: (error: Error) => void = () => undefined;
    link.send.mockImplementationOnce(
      () =>
        new Promise<void>((_, reject) => {
          failWrite = reject;
        }),
    );
    // Vitest fails the run on any unhandled rejection, which is how the
    // timeout used to reach error reporting as an uncaught error.
    const outcome = transport
      .pairingCall()("pair.start", {})
      .then(
        () => null,
        (error: unknown) => error,
      );
    await vi.advanceTimersByTimeAsync(1000);
    expect(String(await outcome)).toContain("timed out");

    failWrite(new Error("write timed out"));
    await vi.advanceTimersByTimeAsync(0);
    transport.destroy();
  });

  it("opens a fresh pairing link when the encrypted one is up", async () => {
    const { transport, link } = await connected();

    const result = transport.pairingCall()("pair.start", {});
    await vi.waitFor(() => expect(fake.links).toHaveLength(2));
    expect(link.close).toHaveBeenCalled();
    const pairing = fake.links[1]!;
    await vi.waitFor(() => expect(pairing.sent).toHaveLength(1));
    const { id } = JSON.parse(new TextDecoder().decode(pairing.sent[0]!));
    pairing.handlers.onMessage(control({ id, result: {} }));

    await expect(result).resolves.toEqual({});
    transport.destroy();
  });

  it("reports the link gone once pairing replaces the encrypted one", async () => {
    const { transport, handlers } = await connected();

    const result = transport.pairingCall()("pair.start", {});

    expect(transport.state).toBe("disconnected");
    expect(transport.link).toBeNull();
    expect(handlers.onStateChange).toHaveBeenLastCalledWith("disconnected");
    await vi.waitFor(() => expect(fake.links).toHaveLength(2));
    const pairing = fake.links[1]!;
    await vi.waitFor(() => expect(pairing.sent).toHaveLength(1));
    const { id } = JSON.parse(new TextDecoder().decode(pairing.sent[0]!));
    pairing.handlers.onMessage(control({ id, result: {} }));
    await expect(result).resolves.toEqual({});
    expect(transport.state).toBe("disconnected");
    transport.destroy();
  });

  it("finds a Core by scanning when its peripheral handle changed", async () => {
    fake.cores = new Map([
      ["AA", "core-2"],
      ["CC", "core-3"],
      ["BB", "core-1"],
    ]);
    fake.scanFinds = ["AA", "CC", "BB"];

    const { handlers, transport } = await connected();

    expect(handlers.onOpen).toHaveBeenCalledWith("bluetooth:BB");
    expect(handlers.onBluetoothIdentity).toHaveBeenCalledWith({
      coreDeviceId: "core-1",
      peripheralId: "BB",
    });
    expect(transport.bluetoothIdentity).toEqual({
      coreDeviceId: "core-1",
      peripheralId: "BB",
    });
    const byPeripheral = new Map(fake.links.map((l) => [l.peripheralId, l]));
    expect(byPeripheral.get("AA")!.closed).toBe(true);
    expect(byPeripheral.get("CC")!.closed).toBe(true);
    expect(byPeripheral.get("BB")!.closed).toBe(false);
    transport.destroy();
  });

  it("connects to the known peripheral when the scan sees it after a failed connect", async () => {
    const { BleLink } = await import("@/lib/transport/ble/link");
    vi.mocked(BleLink.open).mockClear();
    vi.mocked(BleLink.open).mockRejectedValueOnce(
      new Error("Operation timed out"),
    );
    fake.scanFinds = ["AA"];

    const { handlers, transport } = await connected();

    expect(handlers.onOpen).toHaveBeenCalledWith("bluetooth:AA");
    expect(BleLink.open).toHaveBeenCalledTimes(2);
    transport.destroy();
  });

  it("scans while the connect to the known peripheral hangs", async () => {
    const { BleLink } = await import("@/lib/transport/ble/link");
    const { findBluetoothDevice } = await import("@/lib/transport/ble/scanner");
    vi.mocked(BleLink.open).mockClear();
    vi.mocked(findBluetoothDevice).mockClear();
    let failDirect: (error: Error) => void = () => undefined;
    vi.mocked(BleLink.open).mockImplementationOnce(
      () =>
        new Promise((_, reject) => {
          failDirect = reject;
        }),
    );
    fake.scanFinds = ["AA"];
    const { transport, handlers } = create();
    transport.connect();

    await vi.waitFor(() => expect(findBluetoothDevice).toHaveBeenCalled());
    expect(BleLink.open).toHaveBeenCalledTimes(1);
    expect(vi.mocked(BleLink.open).mock.calls[0]![2]).toEqual({
      connectTimeoutMs: KNOWN_PERIPHERAL_CONNECT_TIMEOUT_MS,
    });

    failDirect(new Error("Operation timed out"));

    await vi.waitFor(() =>
      expect(handlers.onOpen).toHaveBeenCalledWith("bluetooth:AA"),
    );
    expect(BleLink.open).toHaveBeenCalledTimes(2);
    transport.destroy();
  });

  it("stops scanning once the known peripheral opens", async () => {
    const { findBluetoothDevice } = await import("@/lib/transport/ble/scanner");
    let signal: AbortSignal | undefined;
    vi.mocked(findBluetoothDevice).mockImplementationOnce(
      (_match, _timeout, scanSignal) =>
        new Promise((resolve) => {
          signal = scanSignal;
          scanSignal?.addEventListener("abort", () => resolve(null));
        }),
    );

    const { handlers, transport } = await connected();

    expect(signal?.aborted).toBe(true);
    expect(handlers.onOpen).toHaveBeenCalledWith("bluetooth:AA");
    expect(fake.links).toHaveLength(1);
    transport.destroy();
  });

  it("does not reopen a known peripheral that turned out to be another Core", async () => {
    const { BleLink } = await import("@/lib/transport/ble/link");
    vi.mocked(BleLink.open).mockClear();
    fake.cores = new Map([
      ["AA", "core-2"],
      ["BB", "core-1"],
    ]);
    fake.scanFinds = ["AA", "BB"];

    const { handlers, transport } = await connected();

    expect(handlers.onOpen).toHaveBeenCalledWith("bluetooth:BB");
    expect(
      vi.mocked(BleLink.open).mock.calls.map(([peripheral]) => peripheral),
    ).toEqual(["AA", "BB"]);
    transport.destroy();
  });

  it("learns the Core id from a known peripheral", async () => {
    const { handlers, transport } = await connected({
      identity: { peripheralId: "AA" },
    });

    expect(handlers.onBluetoothIdentity).toHaveBeenCalledWith({
      coreDeviceId: "core-1",
      peripheralId: "AA",
    });
    transport.destroy();
  });

  it("reports an error and retries when Bluetooth is off", async () => {
    fake.readiness = "disabled";
    const { transport, handlers } = create();
    transport.connect();

    await vi.waitFor(() => expect(handlers.onError).toHaveBeenCalled());
    expect(handlers.onError.mock.calls[0]![0].message).toContain("disabled");
    expect(transport.state).toBe("connecting");

    fake.readiness = "ready";
    await vi.advanceTimersByTimeAsync(2000);
    await vi.waitFor(() => expect(handlers.onOpen).toHaveBeenCalled());
    transport.destroy();
  });

  it("fails to connect with nothing to find the Core by", async () => {
    const { transport, handlers } = create({ identity: {} });
    transport.connect();

    await vi.waitFor(() => expect(handlers.onError).toHaveBeenCalled());
    expect(handlers.onError.mock.calls[0]![0].message).toBe(
      "Bluetooth device not found",
    );
    transport.destroy();
  });

  it("reconnects at once on request", async () => {
    const { transport, handlers, link } = await connected();
    link.handlers.onClose("peripheral disconnected");
    expect(handlers.onClose).toHaveBeenCalled();

    transport.immediateReconnect();

    await vi.waitFor(() => expect(handlers.onOpen).toHaveBeenCalledTimes(2));
    transport.destroy();
  });

  it("takes over the link identify left open", async () => {
    const identified = fake.makeLink("AA", "core-1", {
      onMessage: () => undefined,
      onClose: () => undefined,
    });
    fake.identified = identified;
    vi.mocked(BleLink.open).mockClear();

    const { handlers, transport } = await connected();

    expect(handlers.onOpen).toHaveBeenCalledWith("bluetooth:AA");
    expect(BleLink.open).not.toHaveBeenCalled();
    expect(identified.rebind).toHaveBeenCalled();
    identified.handlers.onClose("peripheral disconnected");
    expect(handlers.onClose).toHaveBeenCalled();
    transport.destroy();
  });

  it("closes an identified link to another Core and connects anew", async () => {
    const identified = fake.makeLink("AA", "core-2", {
      onMessage: () => undefined,
      onClose: () => undefined,
    });
    fake.identified = identified;

    const { handlers, link, transport } = await connected();

    expect(identified.close).toHaveBeenCalled();
    expect(link).not.toBe(identified);
    expect(handlers.onOpen).toHaveBeenCalledWith("bluetooth:AA");
    transport.destroy();
  });

  it("opens a peripheral again at once when it drops while opening", async () => {
    vi.mocked(BleLink.open).mockClear();
    vi.mocked(BleLink.open).mockRejectedValueOnce(new BleLinkDroppedError());

    const { handlers, transport } = await connected();

    expect(BleLink.open).toHaveBeenCalledTimes(2);
    expect(vi.mocked(BleLink.open).mock.calls.map(([id]) => id)).toEqual([
      "AA",
      "AA",
    ]);
    expect(handlers.onError).not.toHaveBeenCalled();
    transport.destroy();
  });

  it("opens a dropped peripheral again only once", async () => {
    vi.mocked(BleLink.open).mockClear();
    vi.mocked(BleLink.open)
      .mockRejectedValueOnce(new BleLinkDroppedError())
      .mockRejectedValueOnce(new BleLinkDroppedError());
    const { handlers, transport } = create();

    transport.connect();

    await vi.waitFor(() => expect(handlers.onError).toHaveBeenCalled());
    expect(BleLink.open).toHaveBeenCalledTimes(2);
    transport.destroy();
  });

  it("keeps using the service while a pairing link waits for the PIN", async () => {
    const { transport, handlers } = create({ creds: null });
    transport.connect();
    await vi.waitFor(() =>
      expect(handlers.onEncryptionRequired).toHaveBeenCalled(),
    );
    const link = fake.links[0]!;

    await vi.advanceTimersByTimeAsync(PAIRING_KEEPALIVE_MS);
    expect(link.readInfo).toHaveBeenCalledTimes(1);

    // A pairing request in flight is use enough.
    void transport
      .pairingCall()("pair.start", {})
      .catch(() => undefined);
    await vi.advanceTimersByTimeAsync(PAIRING_KEEPALIVE_MS);
    expect(link.readInfo).toHaveBeenCalledTimes(1);

    transport.destroy();
    await vi.advanceTimersByTimeAsync(PAIRING_KEEPALIVE_MS * 2);
    expect(link.readInfo).toHaveBeenCalledTimes(1);
  });

  it("stops reading once a pairing link read fails", async () => {
    const { transport, handlers } = create({ creds: null });
    transport.connect();
    await vi.waitFor(() =>
      expect(handlers.onEncryptionRequired).toHaveBeenCalled(),
    );
    const link = fake.links[0]!;
    link.readInfo.mockRejectedValueOnce(new Error("timed out"));

    await vi.advanceTimersByTimeAsync(PAIRING_KEEPALIVE_MS * 3);

    expect(link.readInfo).toHaveBeenCalledTimes(1);
    transport.destroy();
  });

  it("closes the link on disconnect", async () => {
    const { transport, link } = await connected();

    transport.disconnect();

    expect(link.close).toHaveBeenCalled();
    expect(transport.state).toBe("disconnected");
    expect(transport.link).toBeNull();
  });
});
