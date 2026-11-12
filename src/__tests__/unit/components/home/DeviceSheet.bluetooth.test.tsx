import { beforeEach, describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { render, screen, waitFor, within } from "@/test-utils";
import { DeviceSheet } from "@/components/home/DeviceSheet";
import {
  ConnectionContext,
  type ConnectionContextValue,
} from "@/hooks/useConnection";
import { deviceRegistry } from "@/lib/devices/deviceRegistry";
import { ConnectionState, useStatusStore } from "@/lib/store";
import type { NearbyBluetoothDevice } from "@/lib/transport/ble/scanner";

const mocks = vi.hoisted(() => ({
  selectRecord: vi.fn().mockResolvedValue(undefined),
  selectScanDevice: vi.fn().mockResolvedValue(undefined),
  selectBluetoothDevice: vi.fn().mockResolvedValue(undefined),
  identify: vi.fn(),
  rescan: vi.fn().mockResolvedValue(undefined),
  openSettings: vi.fn(),
  bluetooth: {
    supported: true,
    devices: [] as NearbyBluetoothDevice[],
    readiness: "ready" as string | null,
    isScanning: false,
    canOpenSettings: false,
  },
}));

vi.mock("@tanstack/react-router", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tanstack/react-router")>()),
  useRouter: () => ({ navigate: vi.fn().mockResolvedValue(undefined) }),
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
    devices: [],
    isScanning: false,
    error: null,
    startScan: vi.fn().mockResolvedValue(undefined),
    stopScan: vi.fn(),
  }),
}));

vi.mock("@/hooks/useSelectDevice", () => ({
  useSelectDevice: () => ({
    selectRecord: mocks.selectRecord,
    selectScanDevice: mocks.selectScanDevice,
    selectBluetoothDevice: mocks.selectBluetoothDevice,
  }),
}));

vi.mock("@/hooks/useBluetoothScan", () => ({
  useBluetoothScan: () => ({
    ...mocks.bluetooth,
    rescan: mocks.rescan,
    openSettings: mocks.openSettings,
  }),
}));

vi.mock("@/lib/transport/ble/identify", () => ({
  identifyBluetoothDevice: mocks.identify,
}));

const connection: ConnectionContextValue = {
  activeConnection: null,
  isConnected: true,
  hasData: true,
  showConnecting: false,
  showReconnecting: false,
  openPairingModal: vi.fn(),
};

function renderSheet(close: () => void = vi.fn()) {
  return render(
    <ConnectionContext.Provider value={connection}>
      <DeviceSheet isOpen={true} close={close} />
    </ConnectionContext.Provider>,
  );
}

function nearbySection() {
  return screen.getByRole("region", { name: "settings.bluetoothScan.title" });
}

describe("DeviceSheet nearby Bluetooth devices", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.bluetooth = {
      supported: true,
      devices: [],
      readiness: "ready",
      isScanning: false,
      canOpenSettings: false,
    };
    deviceRegistry.installForTests({
      schemaVersion: 2,
      activeRecordId: "active",
      records: {
        active: {
          recordId: "active",
          discoveryId: "active-id",
          endpoints: [
            {
              endpointId: "ws://active.local:7497",
              scheme: "ws",
              host: "active.local",
              port: 7497,
              source: "manual",
            },
          ],
          preferredEndpointId: "ws://active.local:7497",
          name: "active Core",
        },
        known: {
          recordId: "known",
          discoveryId: "known-id",
          endpoints: [],
          preferredEndpointId: "",
          name: "Known Bluetooth Core",
          ble: { deviceId: "known-id", peripheralId: "KNOWN" },
          lastConnectedAt: 1,
        },
      },
    });
    useStatusStore.setState({
      connected: true,
      connectionState: ConnectionState.CONNECTED,
      connectionError: "",
      coreVersionPending: false,
      coreVersion: "2.17.0",
      encryptionState: "plaintext",
      pairingRequired: false,
    });
  });

  it("is hidden when Bluetooth is not supported", () => {
    mocks.bluetooth.supported = false;
    renderSheet();

    expect(
      screen.queryByRole("region", { name: "settings.bluetoothScan.title" }),
    ).not.toBeInTheDocument();
  });

  it("lists every device strongest first and marks the saved one", () => {
    mocks.bluetooth.devices = [
      { peripheralId: "FAR", name: "Far Core", rssi: -90 },
      { peripheralId: "KNOWN", name: "Known Bluetooth Core", rssi: -40 },
      { peripheralId: "NEAR", name: "Near Core", rssi: -50 },
      { peripheralId: "NONAME", name: "" },
    ];
    renderSheet();

    const rows = within(nearbySection()).getAllByRole("button", {
      name: /settings\.bluetoothScan\.(savedViaBluetooth|viaBluetooth)/,
    });
    expect(rows.map((row) => row.textContent)).toEqual([
      expect.stringContaining("settings.bluetoothScan.savedViaBluetooth"),
      expect.stringContaining("Near Core"),
      expect.stringContaining("Far Core"),
      expect.stringContaining("settings.bluetoothScan.unnamed"),
    ]);
    const recent = screen.getByRole("region", {
      name: "scan.deviceSheetRecent",
    });
    expect(within(recent).getByText("Known Bluetooth Core")).toBeVisible();
    expect(
      within(recent).getByText("settings.bluetoothScan.viaBluetooth"),
    ).toBeVisible();
  });

  it("keeps listing a saved device that has never connected", () => {
    const { records } = deviceRegistry.getSnapshot();
    const known = records.known!;
    deviceRegistry.installForTests({
      schemaVersion: 2,
      activeRecordId: "known",
      records: {
        ...records,
        known: { ...known, lastConnectedAt: undefined },
      },
    });
    mocks.bluetooth.devices = [
      { peripheralId: "KNOWN", name: "Known Bluetooth Core", rssi: -40 },
    ];
    renderSheet();

    expect(
      within(nearbySection()).getByRole("button", {
        name: /Known Bluetooth Core/,
      }),
    ).toBeVisible();
  });

  it("lists a Core whose Bluetooth identity a Wi-Fi record learned", () => {
    const { records } = deviceRegistry.getSnapshot();
    const active = records.active!;
    deviceRegistry.installForTests({
      schemaVersion: 2,
      activeRecordId: "active",
      records: {
        active: {
          ...active,
          ble: { deviceId: "active-id", peripheralId: "WIFI" },
          lastConnectedAt: 5,
        },
      },
    });
    mocks.bluetooth.devices = [{ peripheralId: "WIFI", name: "MiSTer" }];
    renderSheet();

    const row = within(nearbySection()).getByRole("button", {
      name: /active Core/,
    });
    expect(row).toHaveTextContent("settings.bluetoothScan.savedViaBluetooth");
    expect(
      within(nearbySection()).queryByText("settings.bluetoothScan.noDevices"),
    ).not.toBeInTheDocument();
  });

  it("connects a saved device with its saved record", async () => {
    const user = userEvent.setup();
    const close = vi.fn();
    mocks.bluetooth.devices = [
      { peripheralId: "KNOWN", name: "Known Bluetooth Core" },
    ];
    renderSheet(close);

    await user.click(
      within(nearbySection()).getByRole("button", {
        name: /Known Bluetooth Core/,
      }),
    );

    expect(mocks.selectRecord).toHaveBeenCalledWith("known");
    expect(mocks.identify).not.toHaveBeenCalled();
    expect(mocks.selectBluetoothDevice).not.toHaveBeenCalled();
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("pairs a saved device again from its row", async () => {
    const user = userEvent.setup();
    const close = vi.fn();
    mocks.bluetooth.devices = [
      { peripheralId: "KNOWN", name: "Known Bluetooth Core" },
    ];
    renderSheet(close);

    await user.click(
      within(nearbySection()).getByRole("button", {
        name: "settings.bluetoothScan.pairAgain",
      }),
    );

    await waitFor(() => expect(close).toHaveBeenCalledTimes(1));
    expect(mocks.selectRecord).toHaveBeenCalledWith("known");
    expect(connection.openPairingModal).toHaveBeenCalledTimes(1);
    expect(mocks.selectRecord.mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(connection.openPairingModal).mock.invocationCallOrder[0]!,
    );
  });

  it("offers no pair-again action for an unsaved device", () => {
    mocks.bluetooth.devices = [{ peripheralId: "NEAR", name: "Near Core" }];
    renderSheet();

    expect(
      within(nearbySection()).queryByRole("button", {
        name: "settings.bluetoothScan.pairAgain",
      }),
    ).not.toBeInTheDocument();
  });

  it("identifies the device and connects to it when selected", async () => {
    const user = userEvent.setup();
    const close = vi.fn();
    mocks.bluetooth.devices = [{ peripheralId: "NEAR", name: "Near Core" }];
    mocks.identify.mockResolvedValue({ deviceId: "core-1" });
    renderSheet(close);

    await user.click(
      within(nearbySection()).getByRole("button", { name: /Near Core/ }),
    );

    expect(mocks.identify).toHaveBeenCalledWith("NEAR");
    expect(mocks.selectBluetoothDevice).toHaveBeenCalledWith({
      deviceId: "core-1",
      peripheralId: "NEAR",
      name: "Near Core",
    });
    await waitFor(() => expect(close).toHaveBeenCalledTimes(1));
  });

  it("shows an inline error when the device cannot be reached", async () => {
    const user = userEvent.setup();
    const close = vi.fn();
    mocks.bluetooth.devices = [{ peripheralId: "NEAR", name: "Near Core" }];
    mocks.identify.mockRejectedValue(new Error("connect timeout"));
    renderSheet(close);

    await user.click(
      within(nearbySection()).getByRole("button", { name: /Near Core/ }),
    );

    expect(await within(nearbySection()).findByRole("alert")).toHaveTextContent(
      "settings.bluetoothScan.connectFailed",
    );
    expect(mocks.selectBluetoothDevice).not.toHaveBeenCalled();
    expect(close).not.toHaveBeenCalled();
  });

  it.each([
    ["disabled", "settings.bluetoothScan.disabled"],
    ["denied", "settings.bluetoothScan.denied"],
    ["location_off", "settings.bluetoothScan.locationOff"],
  ])("explains the %s state inline", async (readiness, message) => {
    const user = userEvent.setup();
    mocks.bluetooth.readiness = readiness;
    mocks.bluetooth.canOpenSettings = true;
    renderSheet();

    expect(within(nearbySection()).getByText(message)).toBeVisible();
    await user.click(
      within(nearbySection()).getByRole("button", {
        name: "settings.bluetoothScan.openSettings",
      }),
    );
    expect(mocks.openSettings).toHaveBeenCalledTimes(1);
  });

  it("says nothing was found after a scan with no results", () => {
    renderSheet();

    expect(
      within(nearbySection()).getByText("settings.bluetoothScan.noDevices"),
    ).toBeVisible();
  });

  it("scans again from the refresh button", async () => {
    const user = userEvent.setup();
    renderSheet();

    await user.click(
      within(nearbySection()).getByRole("button", {
        name: "settings.bluetoothScan.refresh",
      }),
    );

    expect(mocks.rescan).toHaveBeenCalledTimes(1);
  });
});
