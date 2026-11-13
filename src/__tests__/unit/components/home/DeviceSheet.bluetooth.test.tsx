import { beforeEach, describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { act, render, screen, waitFor, within } from "@/test-utils";
import { DeviceSheet } from "@/components/home/DeviceSheet";
import { IDENTIFY_SLOW_AFTER_MS } from "@/components/home/useDeviceConnectionFlow";
import type { IdentifyOptions } from "@/lib/transport/ble/identify";
import { BleLinkAbortedError } from "@/lib/transport/ble/link";
import {
  ConnectionContext,
  type ConnectionContextValue,
} from "@/hooks/useConnection";
import type { DiscoveredDevice } from "@/hooks/useNetworkScan";
import {
  deviceRegistry,
  type DeviceRecord,
} from "@/lib/devices/deviceRegistry";
import { ConnectionState, useStatusStore } from "@/lib/store";
import type { NearbyBluetoothDevice } from "@/lib/transport/ble/scanner";

const mocks = vi.hoisted(() => ({
  selectRecord: vi.fn().mockResolvedValue(true),
  selectScanDevice: vi.fn().mockResolvedValue(true),
  selectBluetoothDevice: vi.fn().mockResolvedValue(true),
  identify: vi.fn(),
  rescan: vi.fn().mockResolvedValue(undefined),
  openSettings: vi.fn(),
  startScan: vi.fn().mockResolvedValue(undefined),
  stopScan: vi.fn(),
  network: {
    devices: [] as DiscoveredDevice[],
    isScanning: false,
  },
  bluetooth: {
    supported: true,
    devices: [] as NearbyBluetoothDevice[],
    readiness: "ready" as string | null,
    isScanning: false,
    scanFailed: false,
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
    ...mocks.network,
    error: null,
    startScan: mocks.startScan,
    stopScan: mocks.stopScan,
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

function deviceList() {
  return screen.getByRole("region", { name: "scan.deviceSheetRecent" });
}

/** The device rows in display order, each as its visible text. */
function rowTexts() {
  return within(deviceList())
    .getAllByRole("button")
    .map((button) => button.textContent ?? "")
    .filter(
      (text) =>
        text !== "" &&
        text !== "settings.deviceSetup.addDeviceManually" &&
        text !== "settings.bluetoothScan.openSettings",
    );
}

function networkRecord(
  recordId: string,
  overrides: Partial<DeviceRecord> = {},
): DeviceRecord {
  const host = `${recordId}.local`;
  const endpointId = `ws://${host}:7497`;
  return {
    recordId,
    discoveryId: `${recordId}-id`,
    endpoints: [
      { endpointId, scheme: "ws", host, port: 7497, source: "manual" },
    ],
    preferredEndpointId: endpointId,
    name: `${recordId} Core`,
    ...overrides,
  };
}

function discovered(overrides: Partial<DiscoveredDevice> = {}) {
  return {
    name: "Network Core",
    address: "192.168.1.50",
    addresses: ["192.168.1.50"],
    hostname: "network.local",
    port: 7497,
    deviceId: "network-id",
    ...overrides,
  } satisfies DiscoveredDevice;
}

function installRecords(
  records: Record<string, DeviceRecord>,
  activeRecordId = "active",
) {
  deviceRegistry.installForTests({ schemaVersion: 2, activeRecordId, records });
}

describe("DeviceSheet nearby Bluetooth devices", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.network = { devices: [], isScanning: false };
    mocks.bluetooth = {
      supported: true,
      devices: [],
      readiness: "ready",
      isScanning: false,
      scanFailed: false,
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

  it("has no separate Bluetooth section", () => {
    mocks.bluetooth.devices = [{ peripheralId: "NEAR", name: "Near Core" }];
    renderSheet();

    expect(screen.getAllByRole("region")).toEqual([deviceList()]);
    expect(
      within(deviceList()).getByRole("button", { name: "Near Core" }),
    ).toBeVisible();
    expect(
      screen.queryByText("settings.bluetoothScan.title"),
    ).not.toBeInTheDocument();
  });

  it.each([
    { supported: false, readiness: "disabled" },
    { supported: true, readiness: "unsupported" },
  ])(
    "says nothing about Bluetooth when supported=$supported and readiness=$readiness",
    ({ supported, readiness }) => {
      mocks.bluetooth.supported = supported;
      mocks.bluetooth.readiness = readiness;
      mocks.bluetooth.canOpenSettings = true;
      renderSheet();

      expect(
        screen.queryByText(/^settings\.bluetoothScan\./),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("button", {
          name: "settings.bluetoothScan.openSettings",
        }),
      ).not.toBeInTheDocument();
    },
  );

  it("lists network and Bluetooth finds, then saved devices by last use", () => {
    const { records } = deviceRegistry.getSnapshot();
    installRecords({
      ...records,
      old: networkRecord("old", { lastConnectedAt: 9 }),
      seen: networkRecord("seen", { lastConnectedAt: 5 }),
      older: networkRecord("older", { lastConnectedAt: 3 }),
      recent: networkRecord("recent", {
        lastConnectedAt: 7,
        ble: { deviceId: "recent-id", peripheralId: "RECENT" },
      }),
    });
    mocks.network.devices = [
      discovered({ name: "Beta Net", hostname: "beta.local", deviceId: "b" }),
      discovered({
        name: "Seen on the network",
        hostname: "seen.local",
        deviceId: "seen-id",
      }),
      discovered({ name: "Alpha Net", hostname: "alpha.local", deviceId: "a" }),
    ];
    mocks.bluetooth.devices = [
      { peripheralId: "FAR", name: "Far Core", rssi: -90 },
      { peripheralId: "KNOWN", name: "Known Bluetooth Core", rssi: -40 },
      { peripheralId: "NONAME", name: "" },
      { peripheralId: "NEAR", name: "Near Core", rssi: -50 },
      { peripheralId: "RECENT", name: "Recent over Bluetooth", rssi: -95 },
    ];
    renderSheet();

    // New finds first; saved devices stay in last-used order whether or not
    // a scan can see them.
    expect(rowTexts()).toEqual([
      "Alpha Net",
      "Beta Net",
      "Near Core",
      "Far Core",
      "settings.bluetoothScan.unnamed",
      "old Core",
      "recent Core",
      "seen Core",
      "older Core",
      "Known Bluetooth Core",
    ]);
    // New finds get their own heading, and it carries the one refresh button.
    const headings = within(deviceList())
      .getAllByRole("heading")
      .map((heading) => heading.textContent);
    expect(headings).toEqual(["settings.newDevices", "scan.deviceSheetRecent"]);
    expect(
      within(deviceList()).getAllByRole("button", {
        name: "settings.networkScan.refresh",
      }),
    ).toHaveLength(1);
  });

  it("keeps listing a saved device that has never connected", () => {
    const { records } = deviceRegistry.getSnapshot();
    installRecords({
      ...records,
      known: { ...records.known!, lastConnectedAt: undefined },
    });
    mocks.bluetooth.devices = [
      { peripheralId: "KNOWN", name: "Known Bluetooth Core", rssi: -40 },
    ];
    renderSheet();

    expect(rowTexts()).toEqual(["Known Bluetooth Core"]);
  });

  it("lists a Core whose Bluetooth identity a Wi-Fi record learned once, as its saved row", () => {
    const { records } = deviceRegistry.getSnapshot();
    installRecords({
      active: records.active!,
      wifi: networkRecord("wifi", {
        ble: { deviceId: "wifi-id", peripheralId: "WIFI" },
        lastConnectedAt: 5,
      }),
    });
    mocks.bluetooth.devices = [{ peripheralId: "WIFI", name: "MiSTer" }];
    renderSheet();

    expect(rowTexts()).toEqual(["wifi Core"]);
    expect(
      within(deviceList()).getAllByRole("button", {
        name: "settings.pairDevice",
      }),
    ).toHaveLength(1);
    expect(
      within(deviceList()).queryByText("settings.networkScan.noOtherDevices"),
    ).not.toBeInTheDocument();
  });

  it("leaves the connected device out even when a scan can see it", () => {
    const { records } = deviceRegistry.getSnapshot();
    installRecords({
      active: {
        ...records.active!,
        ble: { deviceId: "active-id", peripheralId: "ACTIVE" },
        lastConnectedAt: 5,
      },
    });
    mocks.bluetooth.devices = [{ peripheralId: "ACTIVE", name: "MiSTer" }];
    renderSheet();

    expect(rowTexts()).toEqual([]);
    expect(
      within(deviceList()).queryByRole("button", {
        name: "settings.pairDevice",
      }),
    ).not.toBeInTheDocument();
    expect(
      within(deviceList()).getByText("settings.networkScan.noOtherDevices"),
    ).toBeVisible();
  });

  it("shows the platform, and what tells same-named devices apart", () => {
    const { records } = deviceRegistry.getSnapshot();
    installRecords({
      active: records.active!,
      twin: networkRecord("twin", {
        name: "Twin Core",
        platform: "mister",
        lastConnectedAt: 2,
      }),
      solo: networkRecord("solo", { platform: "batocera", lastConnectedAt: 1 }),
    });
    mocks.network.devices = [
      discovered({
        name: "Twin Core",
        hostname: "other-twin.local",
        deviceId: "other-twin-id",
        platform: "linux",
      }),
    ];
    mocks.bluetooth.devices = [{ peripheralId: "TWIN", name: "Twin Core" }];
    renderSheet();

    expect(rowTexts()).toEqual([
      "Twin Corelinux · other-twin.local",
      "Twin Coresettings.bluetoothScan.viaBluetooth",
      "Twin Coremister · twin.local",
      "solo Corebatocera",
    ]);
  });

  it("connects a saved device with its saved record", async () => {
    const user = userEvent.setup();
    const close = vi.fn();
    mocks.bluetooth.devices = [
      { peripheralId: "KNOWN", name: "Known Bluetooth Core" },
    ];
    renderSheet(close);

    await user.click(
      within(deviceList()).getByRole("button", {
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
      within(deviceList()).getByRole("button", {
        name: "settings.pairDevice",
      }),
    );

    await waitFor(() => expect(close).toHaveBeenCalledTimes(1));
    expect(mocks.selectRecord).toHaveBeenCalledWith("known");
    expect(connection.openPairingModal).toHaveBeenCalledTimes(1);
    expect(mocks.selectRecord.mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(connection.openPairingModal).mock.invocationCallOrder[0]!,
    );
  });

  it("pairs a saved device the network scan can see", async () => {
    const user = userEvent.setup();
    const { records } = deviceRegistry.getSnapshot();
    installRecords({ ...records, seen: networkRecord("seen") });
    mocks.network.devices = [
      discovered({ hostname: "seen.local", deviceId: "seen-id" }),
    ];
    renderSheet();

    await user.click(
      within(deviceList()).getByRole("button", {
        name: "settings.pairDevice",
      }),
    );

    await waitFor(() =>
      expect(connection.openPairingModal).toHaveBeenCalledTimes(1),
    );
    expect(mocks.selectRecord).toHaveBeenCalledWith("seen");
  });

  it("offers no pair action for an unsaved device or a saved one out of reach", () => {
    mocks.network.devices = [discovered()];
    mocks.bluetooth.devices = [{ peripheralId: "NEAR", name: "Near Core" }];
    renderSheet();

    expect(rowTexts()).toEqual([
      "Network Core",
      "Near Core",
      "Known Bluetooth Core",
    ]);
    expect(
      within(deviceList()).queryByRole("button", {
        name: "settings.pairDevice",
      }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", {
        name: "settings.bluetoothScan.pairAgain",
      }),
    ).not.toBeInTheDocument();
  });

  it("identifies the device and connects to it when selected", async () => {
    const user = userEvent.setup();
    const close = vi.fn();
    mocks.bluetooth.devices = [{ peripheralId: "NEAR", name: "Near Core" }];
    let identified!: (info: { deviceId: string }) => void;
    mocks.identify.mockReturnValue(
      new Promise((resolve) => {
        identified = resolve;
      }),
    );
    renderSheet(close);

    await user.click(
      within(deviceList()).getByRole("button", { name: /Near Core/ }),
    );

    expect(mocks.identify).toHaveBeenCalledWith(
      "NEAR",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    // The list gives way to the one device being reached.
    expect(screen.queryByText("Known Bluetooth Core")).not.toBeInTheDocument();
    expect(screen.getByText("Near Core")).toBeInTheDocument();
    expect(
      screen.getByText("settings.bluetoothScan.connecting"),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("settings.bluetoothScan.stillWorking"),
    ).not.toBeInTheDocument();
    expect(mocks.selectBluetoothDevice).not.toHaveBeenCalled();
    expect(close).not.toHaveBeenCalled();

    const { onStep } = mocks.identify.mock.calls[0]![1] as IdentifyOptions;
    for (const [step, message] of [
      ["pairing", "settings.bluetoothScan.stepPairing"],
      ["securing", "settings.bluetoothScan.stepSecuring"],
      ["reading", "settings.bluetoothScan.stepReading"],
    ] as const) {
      act(() => onStep?.(step));
      expect(screen.getByText(message)).toBeInTheDocument();
    }

    identified({ deviceId: "core-1" });

    await waitFor(() => expect(close).toHaveBeenCalledTimes(1));
    expect(mocks.selectBluetoothDevice).toHaveBeenCalledWith({
      deviceId: "core-1",
      peripheralId: "NEAR",
      name: "Near Core",
    });
  });

  it("says a slow connection is still working", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      mocks.bluetooth.devices = [{ peripheralId: "NEAR", name: "Near Core" }];
      mocks.identify.mockReturnValue(new Promise(() => undefined));
      renderSheet();

      await user.click(
        within(deviceList()).getByRole("button", { name: /Near Core/ }),
      );
      // The click itself let a little time pass already.
      act(() => {
        vi.advanceTimersByTime(IDENTIFY_SLOW_AFTER_MS / 2);
      });
      expect(
        screen.queryByText("settings.bluetoothScan.stillWorking"),
      ).not.toBeInTheDocument();

      act(() => {
        vi.advanceTimersByTime(IDENTIFY_SLOW_AFTER_MS / 2);
      });
      expect(
        screen.getByText("settings.bluetoothScan.stillWorking"),
      ).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("stops scanning while a device is being reached", async () => {
    const user = userEvent.setup();
    mocks.bluetooth.devices = [{ peripheralId: "NEAR", name: "Near Core" }];
    mocks.identify.mockReturnValue(new Promise(() => undefined));
    renderSheet();
    mocks.stopScan.mockClear();

    await user.click(
      within(deviceList()).getByRole("button", { name: /Near Core/ }),
    );

    expect(mocks.stopScan).toHaveBeenCalled();
  });

  it("cancels reaching a device and returns to the list", async () => {
    const user = userEvent.setup();
    const close = vi.fn();
    mocks.bluetooth.devices = [{ peripheralId: "NEAR", name: "Near Core" }];
    let fail!: (error: unknown) => void;
    mocks.identify.mockReturnValue(
      new Promise((_resolve, reject) => {
        fail = reject;
      }),
    );
    renderSheet(close);

    await user.click(
      within(deviceList()).getByRole("button", { name: /Near Core/ }),
    );
    const { signal } = mocks.identify.mock.calls[0]![1] as IdentifyOptions;
    expect(signal?.aborted).toBe(false);

    await user.click(screen.getByRole("button", { name: "nav.cancel" }));

    expect(signal?.aborted).toBe(true);
    expect(rowTexts()).toEqual(["Near Core", "Known Bluetooth Core"]);

    await act(async () => fail(new BleLinkAbortedError()));

    expect(within(deviceList()).queryByRole("alert")).not.toBeInTheDocument();
    expect(mocks.selectBluetoothDevice).not.toHaveBeenCalled();
    expect(close).not.toHaveBeenCalled();
  });

  it("says nothing when a cancelled attempt fails for another reason", async () => {
    const user = userEvent.setup();
    mocks.bluetooth.devices = [{ peripheralId: "NEAR", name: "Near Core" }];
    let fail!: (error: unknown) => void;
    mocks.identify.mockReturnValue(
      new Promise((_resolve, reject) => {
        fail = reject;
      }),
    );
    renderSheet();

    await user.click(
      within(deviceList()).getByRole("button", { name: /Near Core/ }),
    );
    await user.click(screen.getByRole("button", { name: "nav.cancel" }));
    await act(async () => fail(new Error("link dropped")));

    expect(within(deviceList()).queryByRole("alert")).not.toBeInTheDocument();
    expect(rowTexts()).toEqual(["Near Core", "Known Bluetooth Core"]);
  });

  it("takes Cancel away once the device is being saved", async () => {
    const user = userEvent.setup();
    const close = vi.fn();
    mocks.bluetooth.devices = [{ peripheralId: "NEAR", name: "Near Core" }];
    mocks.identify.mockResolvedValue({ deviceId: "core-1" });
    let saved!: (ok: boolean) => void;
    mocks.selectBluetoothDevice.mockReturnValueOnce(
      new Promise<boolean>((resolve) => {
        saved = resolve;
      }),
    );
    renderSheet(close);

    await user.click(
      within(deviceList()).getByRole("button", { name: /Near Core/ }),
    );

    await waitFor(() =>
      expect(mocks.selectBluetoothDevice).toHaveBeenCalledTimes(1),
    );
    expect(
      screen.queryByRole("button", { name: "nav.cancel" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Near Core")).toBeInTheDocument();
    expect(close).not.toHaveBeenCalled();

    saved(true);

    await waitFor(() => expect(close).toHaveBeenCalledTimes(1));
  });

  it("returns to the list with an error when the device cannot be saved, and closes once it can", async () => {
    const user = userEvent.setup();
    const close = vi.fn();
    mocks.bluetooth.devices = [{ peripheralId: "NEAR", name: "Near Core" }];
    mocks.identify.mockResolvedValue({ deviceId: "core-1" });
    mocks.selectBluetoothDevice.mockResolvedValueOnce(false);
    renderSheet(close);

    await user.click(
      within(deviceList()).getByRole("button", { name: /Near Core/ }),
    );

    // The progress view is gone: the list is back, with the one error.
    expect(await within(deviceList()).findByRole("alert")).toHaveTextContent(
      "settings.deviceSaveFailed",
    );
    expect(within(deviceList()).getAllByRole("alert")).toHaveLength(1);
    expect(rowTexts()).toEqual(["Near Core", "Known Bluetooth Core"]);
    expect(close).not.toHaveBeenCalled();

    await user.click(
      within(deviceList()).getByRole("button", { name: /Near Core/ }),
    );

    await waitFor(() => expect(close).toHaveBeenCalledTimes(1));
    expect(mocks.selectBluetoothDevice).toHaveBeenCalledTimes(2);
    expect(
      screen.queryByText("settings.deviceSaveFailed"),
    ).not.toBeInTheDocument();
  });

  it("shows an inline error when the device cannot be reached", async () => {
    const user = userEvent.setup();
    const close = vi.fn();
    mocks.bluetooth.devices = [{ peripheralId: "NEAR", name: "Near Core" }];
    mocks.identify.mockRejectedValue(new Error("connect timeout"));
    renderSheet(close);

    await user.click(
      within(deviceList()).getByRole("button", { name: /Near Core/ }),
    );

    expect(await within(deviceList()).findByRole("alert")).toHaveTextContent(
      "settings.bluetoothScan.connectFailed",
    );
    expect(rowTexts()).toEqual(["Near Core", "Known Bluetooth Core"]);
    expect(mocks.selectBluetoothDevice).not.toHaveBeenCalled();
    expect(close).not.toHaveBeenCalled();
  });

  it.each([
    ["disabled", "settings.bluetoothScan.disabled"],
    ["denied", "settings.bluetoothScan.denied"],
    ["location_off", "settings.bluetoothScan.locationOff"],
  ])("explains the %s state below manual entry", async (readiness, message) => {
    const user = userEvent.setup();
    mocks.bluetooth.readiness = readiness;
    mocks.bluetooth.canOpenSettings = true;
    renderSheet();

    const notice = within(deviceList()).getByText(message);
    expect(notice).toBeVisible();
    expect(
      within(deviceList())
        .getByRole("button", {
          name: "settings.deviceSetup.addDeviceManually",
        })
        .compareDocumentPosition(notice) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    await user.click(
      within(deviceList()).getByRole("button", {
        name: "settings.bluetoothScan.openSettings",
      }),
    );
    expect(mocks.openSettings).toHaveBeenCalledTimes(1);
  });

  it("explains a Bluetooth problem without a settings button when settings cannot be opened", () => {
    mocks.bluetooth.readiness = "disabled";
    renderSheet();

    expect(
      within(deviceList()).getByText("settings.bluetoothScan.disabled"),
    ).toBeVisible();
    expect(
      screen.queryByRole("button", {
        name: "settings.bluetoothScan.openSettings",
      }),
    ).not.toBeInTheDocument();
  });

  it("names a saved Bluetooth device by the name it advertised", () => {
    const { records } = deviceRegistry.getSnapshot();
    installRecords({
      active: records.active!,
      known: {
        recordId: "known",
        discoveryId: "known-id",
        endpoints: [],
        preferredEndpointId: "",
        ble: {
          deviceId: "known-id",
          peripheralId: "KNOWN",
          name: "Advertised Core",
        },
      },
    });
    renderSheet();

    expect(rowTexts()).toEqual(["Advertised Core"]);
  });

  it("says the Bluetooth scan failed instead of that nothing was found", () => {
    const { records } = deviceRegistry.getSnapshot();
    installRecords({ active: records.active! });
    mocks.bluetooth.scanFailed = true;
    renderSheet();

    expect(within(deviceList()).getByRole("alert")).toHaveTextContent(
      "settings.bluetoothScan.scanFailed",
    );
    expect(
      within(deviceList()).queryByText("settings.networkScan.noOtherDevices"),
    ).not.toBeInTheDocument();
  });

  it("says nothing was found after both scans end with no results", () => {
    const { records } = deviceRegistry.getSnapshot();
    installRecords({ active: records.active! });
    renderSheet();

    expect(
      within(deviceList()).getByText("settings.networkScan.noOtherDevices"),
    ).toBeVisible();
  });

  it.each([
    { network: true, bluetooth: false },
    { network: false, bluetooth: true },
  ])(
    "is busy, not empty, while scanning network=$network bluetooth=$bluetooth",
    ({ network, bluetooth }) => {
      const { records } = deviceRegistry.getSnapshot();
      installRecords({ active: records.active! });
      mocks.network.isScanning = network;
      mocks.bluetooth.isScanning = bluetooth;
      renderSheet();

      const refresh = within(deviceList()).getByRole("button", {
        name: "settings.networkScan.refresh",
      });
      expect(refresh).toHaveAttribute("aria-busy", "true");
      expect(refresh).toBeDisabled();
      expect(
        within(deviceList()).queryByText("settings.networkScan.noOtherDevices"),
      ).not.toBeInTheDocument();
      expect(
        within(deviceList()).getByText("settings.networkScan.searching"),
      ).toBeInTheDocument();
    },
  );

  it("restarts both scans from the one refresh button", async () => {
    const user = userEvent.setup();
    renderSheet();
    await waitFor(() => expect(mocks.startScan).toHaveBeenCalledTimes(1));

    const refresh = within(deviceList()).getAllByRole("button", {
      name: /refresh/,
    });
    expect(refresh).toHaveLength(1);
    expect(refresh[0]).toHaveAttribute("aria-busy", "false");
    await user.click(refresh[0]!);

    expect(mocks.rescan).toHaveBeenCalledTimes(1);
    expect(mocks.startScan).toHaveBeenCalledTimes(2);
  });
});
