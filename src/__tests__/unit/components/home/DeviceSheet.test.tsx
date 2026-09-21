import { beforeEach, describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { render, screen, waitFor, within } from "@/test-utils";
import { DeviceSheet } from "@/components/home/DeviceSheet";
import {
  ConnectionContext,
  type ConnectionContextValue,
} from "@/hooks/useConnection";
import type { DiscoveredDevice } from "@/hooks/useNetworkScan";
import { deviceRegistry } from "@/lib/devices/deviceRegistry";
import { ConnectionState, useStatusStore } from "@/lib/store";

const mocks = vi.hoisted(() => ({
  startScan: vi.fn().mockResolvedValue(undefined),
  stopScan: vi.fn(),
  selectRecord: vi.fn().mockResolvedValue(undefined),
  selectScanDevice: vi.fn().mockResolvedValue(undefined),
  openPairingModal: vi.fn(),
  navigate: vi.fn().mockResolvedValue(undefined),
  devices: [] as DiscoveredDevice[],
  isScanning: false,
  error: null as string | null,
}));

vi.mock("@tanstack/react-router", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tanstack/react-router")>()),
  useRouter: () => ({ navigate: mocks.navigate }),
}));

vi.mock("@/hooks/useAppUi", () => ({
  useAppUi: () => ({
    enabled: true,
    preview: false,
    nfc: false,
    camera: false,
    accelerometer: false,
  }),
}));

vi.mock("@/hooks/useNetworkScan", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/hooks/useNetworkScan")>()),
  useNetworkScan: () => ({
    devices: mocks.devices,
    isScanning: mocks.isScanning,
    error: mocks.error,
    startScan: mocks.startScan,
    stopScan: mocks.stopScan,
  }),
}));

vi.mock("@/hooks/useSelectDevice", () => ({
  useSelectDevice: () => ({
    selectRecord: mocks.selectRecord,
    selectScanDevice: mocks.selectScanDevice,
  }),
}));

const connection: ConnectionContextValue = {
  activeConnection: null,
  isConnected: true,
  hasData: true,
  showConnecting: false,
  showReconnecting: false,
  openPairingModal: mocks.openPairingModal,
};

function renderSheet(props: { isOpen: boolean; close: () => void }) {
  return render(
    <ConnectionContext.Provider value={connection}>
      <DeviceSheet {...props} />
    </ConnectionContext.Provider>,
  );
}

function record(recordId: string, host: string, discoveryId?: string) {
  const endpointId = `ws://${host}:7497`;
  return {
    recordId,
    ...(discoveryId ? { discoveryId } : {}),
    endpoints: [
      {
        endpointId,
        scheme: "ws" as const,
        host,
        port: 7497,
        source: "manual" as const,
      },
    ],
    preferredEndpointId: endpointId,
    name: `${recordId} Core`,
  };
}

function discovered(overrides: Partial<DiscoveredDevice> = {}) {
  return {
    name: "Nearby Core",
    address: "192.168.1.50",
    addresses: ["192.168.1.50"],
    hostname: "nearby.local",
    port: 7497,
    deviceId: "nearby-id",
    ...overrides,
  } satisfies DiscoveredDevice;
}

describe("DeviceSheet", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.devices = [];
    mocks.isScanning = false;
    mocks.error = null;
    deviceRegistry.installForTests({
      schemaVersion: 2,
      activeRecordId: "active",
      records: {
        active: record("active", "active.local", "active-id"),
        saved: record("saved", "saved.local", "saved-id"),
      },
    });
    useStatusStore.setState({
      connected: true,
      connectionState: ConnectionState.CONNECTED,
      connectionError: "",
      coreVersionPending: false,
      coreVersion: "2.17.0",
      encryptionState: "plaintext",
    });
  });

  it("starts discovery and merges matching results into the switch list", async () => {
    mocks.devices = [
      discovered({
        name: "Saved discovery result",
        address: "192.168.1.40",
        addresses: ["192.168.1.40"],
        hostname: "saved.local",
        deviceId: "saved-id",
      }),
      discovered(),
    ];

    renderSheet({ isOpen: true, close: () => {} });

    await waitFor(() => expect(mocks.startScan).toHaveBeenCalledTimes(1));
    const switchList = screen.getByRole("region", {
      name: "scan.deviceSheetRecent",
    });
    expect(within(switchList).getByText("saved Core")).toBeVisible();
    expect(
      within(switchList).queryByText("Saved discovery result"),
    ).not.toBeInTheDocument();
    expect(within(switchList).getByText("Nearby Core")).toBeVisible();
    expect(
      within(switchList).queryByText("active Core"),
    ).not.toBeInTheDocument();
  });

  it("adds and connects a newly discovered device when selected", async () => {
    const user = userEvent.setup();
    const close = vi.fn();
    mocks.devices = [discovered()];

    renderSheet({ isOpen: true, close });

    await user.click(screen.getByRole("button", { name: /Nearby Core/ }));

    expect(mocks.selectScanDevice).toHaveBeenCalledWith({
      discoveryId: "nearby-id",
      hostname: "nearby.local",
      addresses: ["192.168.1.50"],
      port: 7497,
      name: "Nearby Core",
      platform: undefined,
      version: undefined,
    });
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("pairs from the connected-device action and can search again", async () => {
    const user = userEvent.setup();
    const close = vi.fn();

    renderSheet({ isOpen: true, close });
    await waitFor(() => expect(mocks.startScan).toHaveBeenCalledTimes(1));

    const pair = screen.getByRole("button", { name: "pairing.openPairing" });
    expect(pair).toHaveAttribute("data-variant", "secondary");
    const switchList = screen.getByRole("region", {
      name: "scan.deviceSheetRecent",
    });
    expect(
      pair.compareDocumentPosition(switchList) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();

    await user.click(
      screen.getByRole("button", { name: "settings.networkScan.refresh" }),
    );
    expect(mocks.startScan).toHaveBeenCalledTimes(2);

    await user.click(pair);
    expect(mocks.openPairingModal).toHaveBeenCalledTimes(1);
    expect(close).toHaveBeenCalledTimes(1);
  });
});
