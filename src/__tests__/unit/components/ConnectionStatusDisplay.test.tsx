import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "../../../test-utils";
import { ConnectionStatusDisplay } from "@/components/ConnectionStatusDisplay";
import {
  ConnectionContext,
  ConnectionContextValue,
} from "@/hooks/useConnection";
import { useStatusStore } from "@/lib/store";
import { seedActiveDevice } from "@/test-utils/deviceRegistry";
import {
  deviceRegistry,
  type DeviceRecord,
} from "@/lib/devices/deviceRegistry";
import type { DeviceConnection } from "@/lib/transport/types";
import { ReactNode } from "react";

function wrap(
  children: ReactNode,
  value: Partial<ConnectionContextValue> = {},
) {
  const full: ConnectionContextValue = {
    activeConnection: null,
    isConnected: false,
    hasData: false,
    showConnecting: false,
    showReconnecting: false,
    openPairingModal: () => {},
    ...value,
  };
  return (
    <ConnectionContext.Provider value={full}>
      {children}
    </ConnectionContext.Provider>
  );
}

/** A device saved over Bluetooth, optionally with addresses Core reported. */
function installBluetoothDevice(overrides: Partial<DeviceRecord> = {}) {
  deviceRegistry.installForTests({
    schemaVersion: 2,
    activeRecordId: "ble",
    records: {
      ble: {
        recordId: "ble",
        endpoints: [],
        preferredEndpointId: "",
        ble: { deviceId: "core-1", peripheralId: "AA:BB" },
        ...overrides,
      },
    },
  });
}

const reportedEndpoints = {
  addresses: ["10.0.0.206", "192.168.1.9"],
  port: 7497,
  at: 1,
};

describe("ConnectionStatusDisplay encryption gate", () => {
  beforeEach(async () => {
    useStatusStore.setState({
      encryptionState: "unknown",
      pairingRequired: false,
      networkAvailable: true,
      connectionIssueStartedAt: null,
    });
    // Without a saved device the component reports "disconnected" regardless of
    // the connection context, so every state below needs one selected.
    await seedActiveDevice({ address: "192.168.1.100" });
  });

  it("should show Connecting when isConnected=true but encryptionState is unknown", () => {
    render(wrap(<ConnectionStatusDisplay />, { isConnected: true }));

    expect(screen.getByText("connection.connectingToCore")).toBeInTheDocument();
    expect(screen.queryByText("scan.connectedHeading")).not.toBeInTheDocument();
  });

  it("should show Reconnecting when isConnected=true, showReconnecting=true and encryptionState is unknown", () => {
    render(
      wrap(<ConnectionStatusDisplay />, {
        isConnected: true,
        showReconnecting: true,
      }),
    );

    expect(
      screen.getByText("connection.reconnectingToCore"),
    ).toBeInTheDocument();
    expect(screen.queryByText("scan.connectedHeading")).not.toBeInTheDocument();
  });

  it("should show an initial transport error before handshake confirmation", () => {
    useStatusStore.setState({ connectionIssueStartedAt: Date.now() });

    render(
      wrap(<ConnectionStatusDisplay connectionError="Connection refused" />, {
        isConnected: true,
        showConnecting: true,
      }),
    );

    expect(screen.getByText("scan.connectionError")).toBeInTheDocument();
    expect(screen.getByText("Connection refused")).toBeInTheDocument();
    expect(
      screen.queryByText("connection.connectingToCore"),
    ).not.toBeInTheDocument();
  });

  it("should show Connected when isConnected=true and encryptionState=plaintext", () => {
    useStatusStore.setState({ encryptionState: "plaintext" });

    render(wrap(<ConnectionStatusDisplay />, { isConnected: true }));

    expect(screen.getByText("scan.connectedHeading")).toBeInTheDocument();
    expect(screen.getByLabelText("connection.unencrypted")).toBeInTheDocument();
  });

  it("should show Connected with lock icon when encryptionState=encrypted", () => {
    useStatusStore.setState({ encryptionState: "encrypted" });

    render(wrap(<ConnectionStatusDisplay />, { isConnected: true }));

    expect(screen.getByText("scan.connectedHeading")).toBeInTheDocument();
    expect(screen.getByLabelText("connection.encrypted")).toBeInTheDocument();
  });

  it("should show prolonged Core unavailability", () => {
    useStatusStore.setState({
      connectionIssueStartedAt: Date.now() - 10_000,
    });

    render(
      wrap(<ConnectionStatusDisplay />, {
        isConnected: true,
        showReconnecting: true,
      }),
    );

    expect(screen.getByText("connection.coreUnavailable")).toBeInTheDocument();
  });

  it("should prioritize explicit network unavailability", () => {
    useStatusStore.setState({
      encryptionState: "plaintext",
      networkAvailable: false,
      connectionIssueStartedAt: Date.now() - 10_000,
    });

    render(
      wrap(<ConnectionStatusDisplay />, {
        isConnected: true,
        showReconnecting: true,
      }),
    );

    expect(
      screen.getByText("connection.networkUnavailable"),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("connection.coreUnavailable"),
    ).not.toBeInTheDocument();
  });

  describe("without a network", () => {
    const dropped = { isConnected: false, showReconnecting: true };

    beforeEach(() => {
      useStatusStore.setState({
        encryptionState: "plaintext",
        networkAvailable: false,
        connectionIssueStartedAt: Date.now() - 2_000,
      });
    });

    it("should show a Bluetooth-only device as reconnecting", () => {
      installBluetoothDevice();

      render(wrap(<ConnectionStatusDisplay />, dropped));

      expect(
        screen.getByText("connection.reconnectingToCore"),
      ).toBeInTheDocument();
      expect(
        screen.queryByText("connection.networkUnavailable"),
      ).not.toBeInTheDocument();
    });

    it("should keep the network message for a Bluetooth device Core reported an address for", () => {
      installBluetoothDevice({ reportedEndpoints });

      render(wrap(<ConnectionStatusDisplay />, dropped));

      expect(
        screen.getByText("connection.networkUnavailable"),
      ).toBeInTheDocument();
    });

    it("should keep the network message for a device with a saved address that can also use Bluetooth", async () => {
      const saved = await seedActiveDevice({ address: "192.168.1.100" });
      deviceRegistry.installForTests({
        schemaVersion: 2,
        activeRecordId: saved.recordId,
        records: {
          [saved.recordId]: {
            ...saved,
            ble: { deviceId: "core-1", peripheralId: "AA:BB" },
          },
        },
      });

      render(wrap(<ConnectionStatusDisplay />, dropped));

      expect(
        screen.getByText("connection.networkUnavailable"),
      ).toBeInTheDocument();
    });
  });

  it("should show Pairing required when not connected and pairingRequired=true", () => {
    useStatusStore.setState({
      pairingRequired: true,
      connectionIssueStartedAt: Date.now() - 10_000,
    });

    render(
      wrap(<ConnectionStatusDisplay />, {
        isConnected: false,
        showReconnecting: true,
      }),
    );

    expect(screen.getByText("connection.pairingRequired")).toBeInTheDocument();
  });
});

describe("ConnectionStatusDisplay link", () => {
  function connectionOn(link: "wifi" | "bluetooth"): DeviceConnection {
    return {
      deviceId: "record-1",
      address: "192.168.1.100",
      type: "hybrid",
      link,
      state: "connected",
      hasData: true,
      lastDataTimestamp: null,
      hasConnectedBefore: true,
    };
  }

  beforeEach(async () => {
    useStatusStore.setState({
      encryptionState: "encrypted",
      pairingRequired: false,
      networkAvailable: true,
      connectionIssueStartedAt: null,
    });
    await seedActiveDevice({ address: "192.168.1.100" });
  });

  it("should name Wi-Fi when connected over Wi-Fi", () => {
    render(
      wrap(<ConnectionStatusDisplay />, {
        isConnected: true,
        activeConnection: connectionOn("wifi"),
      }),
    );

    expect(
      screen.getByRole("img", { name: "connection.linkWifi" }),
    ).toBeInTheDocument();
  });

  it("should name Bluetooth and stay connected without a network", () => {
    useStatusStore.setState({
      networkAvailable: false,
      connectionIssueStartedAt: Date.now() - 10_000,
    });

    render(
      wrap(<ConnectionStatusDisplay />, {
        isConnected: true,
        activeConnection: connectionOn("bluetooth"),
      }),
    );

    expect(screen.getByText("scan.connectedHeading")).toBeInTheDocument();
    expect(
      screen.getByRole("img", { name: "connection.linkBluetooth" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("connection.networkUnavailable"),
    ).not.toBeInTheDocument();
  });

  it("should not name a link while not connected", () => {
    render(
      wrap(<ConnectionStatusDisplay />, {
        isConnected: false,
        activeConnection: connectionOn("bluetooth"),
      }),
    );

    expect(
      screen.queryByRole("img", { name: "connection.linkBluetooth" }),
    ).not.toBeInTheDocument();
  });

  it("should describe a Bluetooth-only device instead of an address", () => {
    deviceRegistry.installForTests({
      schemaVersion: 2,
      activeRecordId: "ble",
      records: {
        ble: {
          recordId: "ble",
          endpoints: [],
          preferredEndpointId: "",
          ble: { deviceId: "core-1", peripheralId: "AA:BB" },
        },
      },
    });

    render(wrap(<ConnectionStatusDisplay />));

    expect(
      screen.getByText("settings.bluetoothScan.viaBluetooth"),
    ).toBeInTheDocument();
  });

  describe("a device saved over Bluetooth that Core reported addresses for", () => {
    beforeEach(() => installBluetoothDevice({ reportedEndpoints }));

    it("should show the network address in use while connected over Wi-Fi", () => {
      render(
        wrap(<ConnectionStatusDisplay />, {
          isConnected: true,
          activeConnection: {
            ...connectionOn("wifi"),
            address: "ws://192.168.1.9:7497/api/v0.1",
          },
        }),
      );

      expect(screen.getByText("192.168.1.9")).toBeInTheDocument();
      expect(
        screen.queryByText("settings.bluetoothScan.viaBluetooth"),
      ).not.toBeInTheDocument();
    });

    it("should show the first reported address when the one in use is not known", () => {
      render(
        wrap(<ConnectionStatusDisplay />, {
          isConnected: true,
          activeConnection: { ...connectionOn("wifi"), address: "" },
        }),
      );

      expect(screen.getByText("10.0.0.206")).toBeInTheDocument();
    });

    it("should stay described as Bluetooth while connected over Bluetooth", () => {
      render(
        wrap(<ConnectionStatusDisplay />, {
          isConnected: true,
          activeConnection: {
            ...connectionOn("bluetooth"),
            address: "bluetooth:AA:BB",
          },
        }),
      );

      expect(
        screen.getByText("settings.bluetoothScan.viaBluetooth"),
      ).toBeInTheDocument();
      expect(screen.queryByText("10.0.0.206")).not.toBeInTheDocument();
    });

    it("should stay described as Bluetooth while not connected", () => {
      render(
        wrap(<ConnectionStatusDisplay />, {
          isConnected: false,
          activeConnection: {
            ...connectionOn("wifi"),
            state: "reconnecting",
            address: "ws://192.168.1.9:7497/api/v0.1",
          },
        }),
      );

      expect(
        screen.getByText("settings.bluetoothScan.viaBluetooth"),
      ).toBeInTheDocument();
      expect(screen.queryByText("192.168.1.9")).not.toBeInTheDocument();
    });
  });

  it("should keep showing a device's own saved address on Wi-Fi", async () => {
    const saved = await seedActiveDevice({ address: "192.168.1.100" });
    deviceRegistry.installForTests({
      schemaVersion: 2,
      activeRecordId: saved.recordId,
      records: {
        [saved.recordId]: {
          ...saved,
          ble: { deviceId: "core-1", peripheralId: "AA:BB" },
          reportedEndpoints,
        },
      },
    });

    render(
      wrap(<ConnectionStatusDisplay />, {
        isConnected: true,
        activeConnection: {
          ...connectionOn("wifi"),
          address: "ws://192.168.1.9:7497/api/v0.1",
        },
      }),
    );

    expect(screen.getByText("192.168.1.100")).toBeInTheDocument();
    expect(screen.queryByText("192.168.1.9")).not.toBeInTheDocument();
  });
});
