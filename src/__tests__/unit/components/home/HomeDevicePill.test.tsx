import { describe, it, expect, beforeEach } from "vitest";
import { ReactNode } from "react";
import { render, screen } from "../../../../test-utils";
import { HomeDevicePill } from "@/components/home/HomeDevicePill";
import {
  ConnectionContext,
  type ConnectionContextValue,
} from "@/hooks/useConnection";
import { deviceRegistry } from "@/lib/devices/deviceRegistry";
import { useStatusStore } from "@/lib/store";
import type { DeviceConnection } from "@/lib/transport/types";
import { seedActiveDevice } from "@/test-utils/deviceRegistry";

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

const pill = () => <HomeDevicePill onOpen={() => {}} sheetOpen={false} />;

describe("HomeDevicePill", () => {
  beforeEach(() => {
    useStatusStore.setState({
      encryptionState: "encrypted",
      pairingRequired: false,
      networkAvailable: true,
      connectionIssueStartedAt: null,
      connectionError: "",
    });
  });

  it("should keep the device name and mark the Wi-Fi link beside it", async () => {
    await seedActiveDevice({ address: "192.168.1.100", name: "MiSTer" });

    render(
      wrap(pill(), {
        isConnected: true,
        activeConnection: connectionOn("wifi"),
      }),
    );

    expect(await screen.findByText("MiSTer")).toBeVisible();
    expect(
      screen.getByRole("img", { name: "connection.linkWifi", hidden: true }),
    ).toBeInTheDocument();
  });

  it("should name a Bluetooth-only device by its advertised name", async () => {
    deviceRegistry.installForTests({
      schemaVersion: 2,
      activeRecordId: "ble",
      records: {
        ble: {
          recordId: "ble",
          endpoints: [],
          preferredEndpointId: "",
          ble: { deviceId: "core-1", peripheralId: "AA:BB", name: "MiSTuh" },
        },
      },
    });

    render(
      wrap(pill(), {
        isConnected: true,
        activeConnection: connectionOn("bluetooth"),
      }),
    );

    expect(await screen.findByText("MiSTuh")).toBeVisible();
    expect(
      screen.queryByText("settings.bluetoothScan.viaBluetooth"),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("img", {
        name: "connection.linkBluetooth",
        hidden: true,
      }),
    ).toBeInTheDocument();
  });

  it("should show no link while not connected", async () => {
    await seedActiveDevice({ address: "192.168.1.100", name: "MiSTer" });

    render(wrap(pill(), { activeConnection: connectionOn("wifi") }));

    expect(await screen.findByText("MiSTer")).toBeVisible();
    expect(
      screen.queryByRole("img", { name: "connection.linkWifi", hidden: true }),
    ).not.toBeInTheDocument();
  });
});
