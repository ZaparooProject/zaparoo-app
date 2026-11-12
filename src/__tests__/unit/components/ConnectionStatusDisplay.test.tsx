import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "../../../test-utils";
import { ConnectionStatusDisplay } from "@/components/ConnectionStatusDisplay";
import {
  ConnectionContext,
  ConnectionContextValue,
} from "@/hooks/useConnection";
import { useStatusStore } from "@/lib/store";
import { seedActiveDevice } from "@/test-utils/deviceRegistry";
import { deviceRegistry } from "@/lib/devices/deviceRegistry";
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
});
