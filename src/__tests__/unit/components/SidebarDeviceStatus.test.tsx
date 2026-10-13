import { describe, it, expect, beforeEach } from "vitest";
import { ReactNode } from "react";
import { render, screen, within } from "../../../test-utils";
import { SidebarDeviceStatus } from "@/components/SidebarDeviceStatus";
import {
  ConnectionContext,
  type ConnectionContextValue,
} from "@/hooks/useConnection";
import { useStatusStore } from "@/lib/store";
import {
  seedActiveDevice,
  seedDeviceRegistry,
} from "@/test-utils/deviceRegistry";

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

describe("SidebarDeviceStatus", () => {
  beforeEach(() => {
    useStatusStore.setState({
      encryptionState: "plaintext",
      pairingRequired: false,
      networkAvailable: true,
      connectionIssueStartedAt: null,
      connectionError: "",
    });
  });

  it("should show the device name, connected state and address", async () => {
    await seedActiveDevice({ address: "192.168.1.100", name: "Living room" });

    render(wrap(<SidebarDeviceStatus />, { isConnected: true }));

    const status = within(
      screen.getByRole("region", { name: "nav.currentDevice" }),
    );
    expect(await status.findByText("Living room")).toBeVisible();
    expect(status.getByText("scan.connectedHeading")).toBeVisible();
    expect(status.getByText("192.168.1.100")).toBeVisible();
  });

  it("should fall back to a generic name for an unnamed device", async () => {
    await seedActiveDevice({ address: "192.168.1.100" });

    render(wrap(<SidebarDeviceStatus />, { isConnected: true }));

    const status = within(
      screen.getByRole("region", { name: "nav.currentDevice" }),
    );
    expect(await status.findByText("192.168.1.100")).toBeVisible();
    expect(status.getByText("nav.currentDevice")).toBeVisible();
  });

  it("should report no device and not connected when nothing is selected", async () => {
    await seedDeviceRegistry([]);

    render(wrap(<SidebarDeviceStatus />));

    const status = within(
      screen.getByRole("region", { name: "nav.currentDevice" }),
    );
    expect(await status.findByText("settings.notConnected")).toBeVisible();
    expect(status.getByText("scan.deviceNone")).toBeVisible();
  });
});
