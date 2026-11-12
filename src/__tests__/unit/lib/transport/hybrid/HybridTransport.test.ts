import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ConnectionType } from "@capacitor/network";
import {
  HybridTransport,
  type HybridTransportConfig,
} from "@/lib/transport/hybrid/HybridTransport";
import type {
  Transport,
  TransportEventHandlers,
  TransportState,
} from "@/lib/transport/types";

const network = vi.hoisted(() => ({
  getStatus: vi.fn(async () => ({
    connected: true,
    connectionType: "wifi" as string,
  })),
}));

vi.mock("@capacitor/network", () => ({ Network: network }));

class FakeChild implements Transport {
  readonly deviceId = "record-1";
  _state: TransportState = "disconnected";
  handlers: TransportEventHandlers = {};
  sent: string[] = [];
  destroyed = false;
  readonly pairing = vi.fn();
  connect = vi.fn(() => {
    this.setState("connecting");
  });
  disconnect = vi.fn();
  destroy = vi.fn(() => {
    this.destroyed = true;
    this._state = "disconnected";
  });
  immediateReconnect = vi.fn();
  clearEncryptionBlock = vi.fn();
  pauseHeartbeat = vi.fn();
  resumeHeartbeat = vi.fn();

  constructor(
    readonly kind: "ws" | "ble",
    readonly urls: readonly string[] = [],
  ) {}

  get state(): TransportState {
    return this._state;
  }

  get isConnected(): boolean {
    return this._state === "connected";
  }

  get hasEverConnected(): boolean {
    return false;
  }

  setEventHandlers(handlers: TransportEventHandlers): void {
    this.handlers = handlers;
  }

  send(data: string): void {
    if (!this.isConnected) throw new Error("not connected");
    this.sent.push(data);
  }

  pairingCall() {
    return this.pairing;
  }

  setState(state: TransportState): void {
    this._state = state;
    this.handlers.onStateChange?.(state);
  }

  open(address: string): void {
    this.setState("connected");
    this.handlers.onOpen?.(address);
  }

  lose(): void {
    this.setState("reconnecting");
  }

  reply(data: unknown): void {
    this.handlers.onMessage?.(
      new MessageEvent("message", { data: JSON.stringify(data) }),
    );
  }

  lastRequest(): { id: string | number; method: string } {
    return JSON.parse(this.sent.at(-1)!);
  }
}

const URL_A = "ws://10.0.0.5:7497/api/v0.1";

function setup(config: Partial<HybridTransportConfig> = {}) {
  const children: FakeChild[] = [];
  const transport = new HybridTransport({
    deviceId: "record-1",
    wsUrls: [URL_A],
    bluetooth: { coreDeviceId: "core-1", peripheralId: "AA" },
    bluetoothEnabled: true,
    createWebSocket: (urls) => {
      const child = new FakeChild("ws", urls);
      children.push(child);
      return child;
    },
    createBluetooth: () => {
      const child = new FakeChild("ble");
      children.push(child);
      return child;
    },
    ...config,
  });
  const handlers = {
    onOpen: vi.fn(),
    onClose: vi.fn(),
    onMessage: vi.fn(),
    onStateChange: vi.fn(),
    onLinkChange: vi.fn(),
    onEndpoints: vi.fn(),
    onHeartbeat: vi.fn(),
    onEncryptionRequired: vi.fn(),
    onCredentialsRevoked: vi.fn(),
    onBluetoothIdentity: vi.fn(),
    onError: vi.fn(),
  } satisfies TransportEventHandlers;
  transport.setEventHandlers(handlers);
  const ws = () => children.filter((c) => c.kind === "ws");
  const ble = () => children.filter((c) => c.kind === "ble");
  return { transport, handlers, children, ws, ble };
}

const endpointsReply = (id: string | number, result: unknown) => ({
  jsonrpc: "2.0",
  id,
  result,
});

/**
 * Connects over Bluetooth, letting the Wi-Fi grace period pass first when an
 * address is known. `ws()` then lists only the Wi-Fi children made after that.
 */
async function onBluetooth(config: Partial<HybridTransportConfig> = {}) {
  const made = setup({ wsUrls: [], ...config });
  made.transport.connect();
  if ((config.wsUrls ?? []).length > 0) {
    await vi.advanceTimersByTimeAsync(6000);
  }
  const bleChild = made.ble()[0]!;
  bleChild.open("bluetooth:AA");
  const base = made.children.length;
  const ws = () =>
    made.children.slice(base).filter((child) => child.kind === "ws");
  return { ...made, ws, bleChild };
}

describe("HybridTransport", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("connecting", () => {
    it("uses Wi-Fi when it opens within the grace period", async () => {
      const { transport, handlers, ws, ble } = setup();
      transport.connect();
      expect(transport.state).toBe("connecting");

      ws()[0]!.open(URL_A);
      await vi.advanceTimersByTimeAsync(10000);

      expect(transport.state).toBe("connected");
      expect(transport.link).toBe("wifi");
      expect(handlers.onOpen).toHaveBeenCalledWith(URL_A);
      expect(handlers.onLinkChange).toHaveBeenCalledWith("wifi");
      expect(ble()).toHaveLength(0);
      expect(ws()[0]!.lastRequest().method).toBe("device.endpoints");
    });

    it("tries Bluetooth when Wi-Fi is slow and keeps whichever opens first", async () => {
      const { transport, handlers, ws, ble } = setup();
      transport.connect();

      await vi.advanceTimersByTimeAsync(6000);
      expect(ble()).toHaveLength(1);
      expect(ble()[0]!.connect).toHaveBeenCalled();

      ble()[0]!.open("bluetooth:AA");

      expect(transport.link).toBe("bluetooth");
      expect(handlers.onLinkChange).toHaveBeenCalledWith("bluetooth");
      expect(ws()[0]!.destroyed).toBe(true);
    });

    it.each<ConnectionType>(["cellular", "none"])(
      "tries Bluetooth at once when the phone is on %s",
      async (connectionType: ConnectionType) => {
        network.getStatus.mockResolvedValueOnce({
          connected: connectionType !== "none",
          connectionType,
        });
        const { transport, ws, ble } = setup();
        transport.connect();

        await vi.advanceTimersByTimeAsync(0);

        expect(ws()).toHaveLength(1);
        expect(ble()).toHaveLength(1);
        expect(ble()[0]!.connect).toHaveBeenCalledTimes(1);
        await vi.advanceTimersByTimeAsync(6000);
        expect(ble()).toHaveLength(1);
        expect(ble()[0]!.connect).toHaveBeenCalledTimes(1);
      },
    );

    it("waits for Wi-Fi when the phone is on Wi-Fi", async () => {
      const { transport, ble } = setup();
      transport.connect();

      await vi.advanceTimersByTimeAsync(5999);
      expect(ble()).toHaveLength(0);
      await vi.advanceTimersByTimeAsync(1);
      expect(ble()).toHaveLength(1);
    });

    it("drops the slower link when both open", async () => {
      const { transport, ws, ble } = setup();
      transport.connect();
      await vi.advanceTimersByTimeAsync(6000);

      ws()[0]!.open(URL_A);
      ble()[0]!.open("bluetooth:AA");

      expect(transport.link).toBe("wifi");
      expect(ble()[0]!.destroyed).toBe(true);
    });

    it("goes straight to Bluetooth with no Wi-Fi address", () => {
      const { transport, ws, ble } = setup({ wsUrls: [] });
      transport.connect();

      expect(ws()).toHaveLength(0);
      expect(ble()[0]!.connect).toHaveBeenCalled();
      expect(transport.state).toBe("connecting");
    });

    it("never tries Bluetooth without an identity", async () => {
      const { transport, ble } = setup({ bluetooth: undefined });
      transport.connect();
      await vi.advanceTimersByTimeAsync(60000);

      expect(ble()).toHaveLength(0);
    });

    it("does nothing with no address and no Bluetooth", () => {
      const { transport, children } = setup({
        wsUrls: [],
        bluetoothEnabled: false,
      });
      transport.connect();

      expect(children).toHaveLength(0);
      expect(transport.state).toBe("disconnected");
    });
  });

  describe("device.endpoints", () => {
    it("keeps the endpoints reply from CoreAPI and reports it", () => {
      const { transport, handlers, ws } = setup();
      transport.connect();
      const child = ws()[0]!;
      child.open(URL_A);
      const { id } = child.lastRequest();

      child.reply(
        endpointsReply(id, {
          deviceId: "core-1",
          scheme: "ws",
          addresses: ["10.0.0.5"],
          port: 7497,
          ble: true,
        }),
      );

      expect(handlers.onMessage).not.toHaveBeenCalled();
      expect(handlers.onEndpoints).toHaveBeenCalledWith(
        expect.objectContaining({
          deviceId: "core-1",
          addresses: ["10.0.0.5"],
        }),
      );
    });

    it("ignores an older Core that does not know the method", () => {
      const { transport, handlers, ws } = setup();
      transport.connect();
      const child = ws()[0]!;
      child.open(URL_A);
      const { id } = child.lastRequest();

      child.reply({
        jsonrpc: "2.0",
        id,
        error: { code: -32601, message: "no" },
      });

      expect(handlers.onEndpoints).not.toHaveBeenCalled();
      expect(handlers.onMessage).not.toHaveBeenCalled();
    });

    it("passes every other message through", () => {
      const { transport, handlers, ws } = setup();
      transport.connect();
      ws()[0]!.open(URL_A);

      ws()[0]!.reply({ jsonrpc: "2.0", method: "media.started", params: {} });

      expect(handlers.onMessage).toHaveBeenCalledTimes(1);
    });

    it("probes the reported addresses at once while on Bluetooth", async () => {
      const { bleChild, ws } = await onBluetooth();
      const { id } = bleChild.lastRequest();

      bleChild.reply(
        endpointsReply(id, {
          deviceId: "core-1",
          addresses: ["192.168.1.9"],
          port: 7497,
          ble: true,
        }),
      );

      expect(ws()).toHaveLength(1);
      expect(ws()[0]!.urls).toEqual(["ws://192.168.1.9:7497/api/v0.1"]);
      expect(ws()[0]!.connect).toHaveBeenCalled();
    });

    it("learns the Bluetooth identity from a Wi-Fi Core that advertises it", async () => {
      const { transport, ws, ble } = setup({ bluetooth: undefined });
      transport.connect();
      const child = ws()[0]!;
      child.open(URL_A);
      child.reply(
        endpointsReply(child.lastRequest().id, {
          deviceId: "core-1",
          addresses: ["10.0.0.5"],
          port: 7497,
          ble: true,
        }),
      );

      child.lose();
      await vi.advanceTimersByTimeAsync(6000);

      expect(ble()).toHaveLength(1);
    });
  });

  describe("switching to Wi-Fi", () => {
    function probeOpens(ws: () => FakeChild[]) {
      const probe = ws().at(-1)!;
      probe.open(URL_A);
      expect(probe.sent).toEqual(["ping"]);
      return probe;
    }

    it("probes Wi-Fi every interval while on Bluetooth", async () => {
      const { ws } = await onBluetooth({ wsUrls: [URL_A] });
      expect(ws()).toHaveLength(0);

      await vi.advanceTimersByTimeAsync(60000);

      expect(ws()).toHaveLength(1);
    });

    it("switches once the probe's handshake verifies", async () => {
      const { transport, handlers, ws, bleChild } = await onBluetooth({
        wsUrls: [URL_A],
      });
      await vi.advanceTimersByTimeAsync(60000);
      const probe = probeOpens(ws);
      handlers.onLinkChange.mockClear();

      probe.handlers.onEncryptedHandshakeOk?.();

      expect(transport.link).toBe("wifi");
      expect(bleChild.destroyed).toBe(true);
      expect(handlers.onLinkChange).toHaveBeenLastCalledWith("wifi");
      expect(handlers.onOpen).toHaveBeenLastCalledWith(URL_A);

      transport.send("after");
      expect(probe.sent.at(-1)).toBe("after");
    });

    it("holds new sends until replies owed on Bluetooth arrive", async () => {
      const { transport, handlers, ws, bleChild } = await onBluetooth({
        wsUrls: [URL_A],
      });
      transport.send('{"jsonrpc":"2.0","id":7,"method":"media.search"}');
      await vi.advanceTimersByTimeAsync(60000);
      const probe = probeOpens(ws);

      probe.handlers.onEncryptedHandshakeOk?.();
      transport.send('{"jsonrpc":"2.0","id":8,"method":"version"}');

      expect(transport.isConnected).toBe(true);
      expect(transport.state).toBe("connected");
      expect(bleChild.destroyed).toBe(false);
      expect(probe.sent).toEqual(["ping"]);

      bleChild.reply({ jsonrpc: "2.0", id: 7, result: {} });

      expect(handlers.onMessage).toHaveBeenCalledTimes(1);
      expect(bleChild.destroyed).toBe(true);
      expect(transport.link).toBe("wifi");
      expect(probe.sent.at(-1)).toBe(
        '{"jsonrpc":"2.0","id":8,"method":"version"}',
      );
    });

    it("stops waiting for owed replies after the cap", async () => {
      const { transport, ws, bleChild } = await onBluetooth({
        wsUrls: [URL_A],
      });
      transport.send('{"jsonrpc":"2.0","id":7,"method":"media.search"}');
      await vi.advanceTimersByTimeAsync(60000);
      probeOpens(ws).handlers.onEncryptedHandshakeOk?.();

      await vi.advanceTimersByTimeAsync(10000);

      expect(bleChild.destroyed).toBe(true);
      expect(transport.link).toBe("wifi");
    });

    it("stays on Bluetooth when Wi-Fi drops while owed replies drain", async () => {
      const { transport, handlers, ws, bleChild } = await onBluetooth({
        wsUrls: [URL_A],
      });
      transport.send('{"jsonrpc":"2.0","id":7,"method":"media.search"}');
      await vi.advanceTimersByTimeAsync(60000);
      const probe = probeOpens(ws);
      probe.handlers.onEncryptedHandshakeOk?.();
      const held = '{"jsonrpc":"2.0","id":8,"method":"version"}';
      transport.send(held);
      handlers.onLinkChange.mockClear();

      probe.lose();
      bleChild.reply({ jsonrpc: "2.0", id: 7, result: {} });

      expect(bleChild.destroyed).toBe(false);
      expect(probe.destroyed).toBe(true);
      expect(bleChild.sent.at(-1)).toBe(held);
      expect(transport.link).toBe("bluetooth");
      expect(transport.state).toBe("connected");
      expect(handlers.onLinkChange).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(60000);
      expect(ws()).toHaveLength(2);
    });

    it("stays on Bluetooth while Wi-Fi is much slower", async () => {
      const { transport, ws, bleChild } = await onBluetooth({
        wsUrls: [URL_A],
      });
      bleChild.handlers.onHeartbeat?.(20);
      await vi.advanceTimersByTimeAsync(60000);
      const probe = probeOpens(ws);

      await vi.advanceTimersByTimeAsync(200);
      probe.handlers.onEncryptedHandshakeOk?.();

      expect(transport.link).toBe("bluetooth");
      expect(probe.destroyed).toBe(true);
      await vi.advanceTimersByTimeAsync(60000);
      expect(ws()).toHaveLength(2);
    });

    it("drops a probe that fails and tries again later", async () => {
      const { transport, ws } = await onBluetooth({ wsUrls: [URL_A] });
      await vi.advanceTimersByTimeAsync(60000);
      const probe = ws()[0]!;

      await vi.advanceTimersByTimeAsync(6000);

      expect(probe.destroyed).toBe(true);
      expect(transport.link).toBe("bluetooth");
      await vi.advanceTimersByTimeAsync(60000);
      expect(ws()).toHaveLength(2);
    });

    it("drops a probe Core refuses", async () => {
      const { transport, ws } = await onBluetooth({ wsUrls: [URL_A] });
      await vi.advanceTimersByTimeAsync(60000);
      const probe = probeOpens(ws);

      probe.handlers.onCredentialsRevoked?.();

      expect(probe.destroyed).toBe(true);
      expect(transport.link).toBe("bluetooth");
    });

    it("probes at once on a network change", async () => {
      const { transport, ws, bleChild } = await onBluetooth({
        wsUrls: [URL_A],
      });

      transport.immediateReconnect();

      expect(bleChild.immediateReconnect).toHaveBeenCalled();
      expect(ws()).toHaveLength(1);
    });

    it("backs probing off when Wi-Fi drops soon after switching", async () => {
      const { ws, ble } = await onBluetooth({ wsUrls: [URL_A] });
      await vi.advanceTimersByTimeAsync(60000);
      const probe = probeOpens(ws);
      probe.handlers.onEncryptedHandshakeOk?.();

      probe.lose();
      await vi.advanceTimersByTimeAsync(6000);
      const ble2 = ble().at(-1)!;
      expect(ble2.destroyed).toBe(false);
      ble2.open("bluetooth:AA");
      const probes = ws().length;

      await vi.advanceTimersByTimeAsync(60000);
      expect(ws()).toHaveLength(probes);
      await vi.advanceTimersByTimeAsync(60000);
      expect(ws()).toHaveLength(probes + 1);
    });

    it("does not probe while paused", async () => {
      const { transport, ws } = await onBluetooth({ wsUrls: [URL_A] });
      transport.pauseHeartbeat();

      await vi.advanceTimersByTimeAsync(120000);
      expect(ws()).toHaveLength(0);

      transport.resumeHeartbeat();
      await vi.advanceTimersByTimeAsync(60000);
      expect(ws()).toHaveLength(1);
    });
  });

  describe("losing a link", () => {
    it("tries Bluetooth on resume when Wi-Fi dropped while paused", async () => {
      const { transport, ws, ble } = setup();
      transport.connect();
      ws()[0]!.open(URL_A);
      transport.pauseHeartbeat();

      ws()[0]!.lose();
      await vi.advanceTimersByTimeAsync(60000);
      expect(ble()).toHaveLength(0);

      transport.immediateReconnect();
      await vi.advanceTimersByTimeAsync(6000);
      expect(ble()).toHaveLength(1);
    });

    it("tries Bluetooth when heartbeats resume on a dead Wi-Fi link", async () => {
      const { transport, ws, ble } = setup();
      transport.connect();
      ws()[0]!.open(URL_A);
      transport.pauseHeartbeat();
      ws()[0]!.lose();

      transport.resumeHeartbeat();
      await vi.advanceTimersByTimeAsync(6000);
      expect(ble()).toHaveLength(1);
    });

    it("stays on Wi-Fi when it is still up on resume", async () => {
      const { transport, ws, ble } = setup();
      transport.connect();
      ws()[0]!.open(URL_A);
      transport.pauseHeartbeat();

      transport.resumeHeartbeat();
      await vi.advanceTimersByTimeAsync(60000);
      expect(ble()).toHaveLength(0);
    });

    it("reports no link and tries Bluetooth after Wi-Fi drops", async () => {
      const { transport, handlers, ws, ble } = setup();
      transport.connect();
      ws()[0]!.open(URL_A);

      ws()[0]!.lose();

      expect(handlers.onLinkChange).toHaveBeenLastCalledWith(null);
      expect(transport.link).toBeNull();
      expect(transport.state).toBe("reconnecting");
      await vi.advanceTimersByTimeAsync(6000);
      expect(ble()).toHaveLength(1);
    });

    it("probes Wi-Fi when Bluetooth drops", async () => {
      const { handlers, ws, bleChild } = await onBluetooth({ wsUrls: [URL_A] });

      bleChild.lose();

      expect(handlers.onLinkChange).toHaveBeenLastCalledWith(null);
      expect(ws()).toHaveLength(1);
    });

    it("forwards the heartbeat of the active link only", async () => {
      const { transport, handlers, ws, ble } = setup();
      transport.connect();
      await vi.advanceTimersByTimeAsync(6000);
      ws()[0]!.open(URL_A);

      ws()[0]!.handlers.onHeartbeat?.(15);

      expect(handlers.onHeartbeat).toHaveBeenCalledWith(15);
      expect(ble()[0]!.destroyed).toBe(true);
    });
  });

  describe("blocking and pairing", () => {
    it("blocks on missing credentials and keeps Bluetooth for pairing", async () => {
      const { transport, handlers, bleChild } = await onBluetooth();
      bleChild.setState("disconnected");

      bleChild.handlers.onEncryptionRequired?.();

      expect(handlers.onEncryptionRequired).toHaveBeenCalled();
      expect(transport.state).toBe("disconnected");
      expect(bleChild.destroyed).toBe(false);
      expect(transport.pairsOverBluetooth).toBe(true);
      expect(transport.pairingCall()).toBe(bleChild.pairing);

      transport.connect();
      expect(bleChild.connect).toHaveBeenCalledTimes(1);
    });

    it("stops Wi-Fi when Bluetooth hits a credentials problem", async () => {
      const { transport, handlers, ws, ble } = setup();
      transport.connect();
      await vi.advanceTimersByTimeAsync(6000);

      ble()[0]!.handlers.onCredentialsRevoked?.();

      expect(handlers.onCredentialsRevoked).toHaveBeenCalled();
      expect(ws()[0]!.destroyed).toBe(true);
      expect(transport.state).toBe("disconnected");
    });

    it("connects again after the block is cleared", () => {
      const { transport, ble } = setup({ wsUrls: [] });
      transport.connect();
      ble()[0]!.handlers.onEncryptionRequired?.();
      transport.disconnect();

      transport.clearEncryptionBlock();
      transport.connect();

      expect(ble()).toHaveLength(2);
    });

    it("pairs over HTTP while Wi-Fi is the link", () => {
      const { transport, ws } = setup();
      transport.connect();
      ws()[0]!.open(URL_A);

      expect(transport.pairsOverBluetooth).toBe(false);
      expect(transport.pairingCall()).toBeNull();
    });

    it("pairs over Bluetooth when no Wi-Fi address is known", () => {
      const { transport, ble } = setup({ wsUrls: [] });

      expect(transport.pairsOverBluetooth).toBe(true);
      expect(transport.pairingCall()).toBe(ble()[0]!.pairing);
    });

    it("never pairs over Bluetooth without Bluetooth support", () => {
      const { transport } = setup({ wsUrls: [], bluetoothEnabled: false });

      expect(transport.pairsOverBluetooth).toBe(false);
      expect(transport.pairingCall()).toBeNull();
    });
  });

  it("reports the identity Bluetooth learns", async () => {
    const { handlers, bleChild } = await onBluetooth();
    const identity = { coreDeviceId: "core-1", peripheralId: "BB" };

    bleChild.handlers.onBluetoothIdentity?.(identity);

    expect(handlers.onBluetoothIdentity).toHaveBeenCalledWith(identity);
  });

  it("refuses to send with no link", () => {
    const { transport } = setup();
    expect(() => transport.send("x")).toThrow("not connected");
  });

  it("stops every child on destroy", async () => {
    const { transport, children } = setup();
    transport.connect();
    await vi.advanceTimersByTimeAsync(6000);

    transport.destroy();

    expect(children.every((child) => child.destroyed)).toBe(true);
    expect(transport.state).toBe("disconnected");
  });
});
