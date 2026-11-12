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
  selectRecord: vi.fn().mockResolvedValue(true),
  selectScanDevice: vi.fn().mockResolvedValue(true),
  selectDevice: vi.fn(),
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
    selectDevice: mocks.selectDevice,
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

function renderSheet(
  props: { isOpen: boolean; close: () => void },
  overrides: Partial<ConnectionContextValue> = {},
) {
  return render(
    <ConnectionContext.Provider value={{ ...connection, ...overrides }}>
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
      pairingRequired: false,
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

  it.each([
    ["saved", /saved Core/, () => mocks.selectRecord],
    ["network-found", /Nearby Core/, () => mocks.selectScanDevice],
  ] as const)(
    "stays open with an error when a %s device cannot be saved, and closes once it can",
    async (_kind, rowName, select) => {
      const user = userEvent.setup();
      const close = vi.fn();
      mocks.devices = [discovered()];
      select().mockResolvedValueOnce(false);
      renderSheet({ isOpen: true, close });
      const switchList = screen.getByRole("region", {
        name: "scan.deviceSheetRecent",
      });

      await user.click(
        within(switchList).getByRole("button", { name: rowName }),
      );

      expect(await within(switchList).findByRole("alert")).toHaveTextContent(
        "settings.deviceSaveFailed",
      );
      expect(close).not.toHaveBeenCalled();

      await user.click(
        within(switchList).getByRole("button", { name: rowName }),
      );

      await waitFor(() => expect(close).toHaveBeenCalledTimes(1));
      expect(select()).toHaveBeenCalledTimes(2);
      expect(within(switchList).queryByRole("alert")).not.toBeInTheDocument();
    },
  );

  it("clears a failed save's error when the user searches again", async () => {
    const user = userEvent.setup();
    const close = vi.fn();
    mocks.selectRecord.mockResolvedValueOnce(false);
    renderSheet({ isOpen: true, close });
    const switchList = screen.getByRole("region", {
      name: "scan.deviceSheetRecent",
    });

    await user.click(
      within(switchList).getByRole("button", { name: /saved Core/ }),
    );
    expect(await within(switchList).findByRole("alert")).toHaveTextContent(
      "settings.deviceSaveFailed",
    );

    await user.click(
      screen.getByRole("button", { name: "settings.networkScan.refresh" }),
    );

    expect(within(switchList).queryByRole("alert")).not.toBeInTheDocument();
    expect(close).not.toHaveBeenCalled();
  });

  it("keeps the pairing prompt closed when the device to pair cannot be saved", async () => {
    const user = userEvent.setup();
    const close = vi.fn();
    mocks.devices = [
      discovered({ hostname: "saved.local", deviceId: "saved-id" }),
    ];
    mocks.selectRecord.mockResolvedValueOnce(false);
    renderSheet({ isOpen: true, close });

    await user.click(
      screen.getByRole("button", { name: "settings.pairDevice" }),
    );

    expect(
      await screen.findByText("settings.deviceSaveFailed"),
    ).toHaveAttribute("role", "alert");
    expect(mocks.openPairingModal).not.toHaveBeenCalled();
    expect(close).not.toHaveBeenCalled();
  });

  it("shows a failed save in the address form, and closes once it saves", async () => {
    const user = userEvent.setup();
    const close = vi.fn();
    mocks.selectDevice
      .mockReturnValueOnce({
        ok: true,
        address: "10.0.0.5",
        saved: Promise.resolve(false),
      })
      .mockReturnValueOnce({
        ok: true,
        address: "10.0.0.5",
        saved: Promise.resolve(true),
      });
    renderSheet({ isOpen: true, close });
    await user.click(
      screen.getByRole("button", {
        name: "settings.deviceSetup.addDeviceManually",
      }),
    );
    const input = screen.getByRole("textbox", { name: "settings.device" });
    await user.clear(input);
    await user.type(input, "10.0.0.5");
    const connect = screen.getByRole("button", {
      name: "settings.deviceSetup.connect",
    });

    await user.click(connect);

    expect(
      await screen.findByText("settings.deviceSaveFailed"),
    ).toHaveAttribute("role", "alert");
    expect(input).toBeInTheDocument();
    expect(close).not.toHaveBeenCalled();

    await user.click(connect);

    await waitFor(() => expect(close).toHaveBeenCalledTimes(1));
    expect(
      screen.queryByText("settings.deviceSaveFailed"),
    ).not.toBeInTheDocument();
  });

  it("pairs from the connected-device action and can search again", async () => {
    const user = userEvent.setup();
    const close = vi.fn();

    renderSheet({ isOpen: true, close });
    await waitFor(() => expect(mocks.startScan).toHaveBeenCalledTimes(1));

    const pair = screen.getByRole("button", { name: "pairing.openPairing" });
    expect(pair).toHaveAttribute("data-variant", "ghost");
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

  it("offers pairing recovery even before the device is connected", async () => {
    const user = userEvent.setup();
    const close = vi.fn();
    useStatusStore.setState({
      pairingRequired: true,
      encryptionState: "unknown",
    });
    renderSheet({ isOpen: true, close }, { isConnected: false });
    expect(
      screen.getByRole("heading", { name: "connection.pairingRequired" }),
    ).toBeVisible();
    await user.click(
      screen.getByRole("button", { name: "pairing.openPairing" }),
    );
    expect(mocks.openPairingModal).toHaveBeenCalledOnce();
    expect(close).toHaveBeenCalledOnce();
  });

  it.each([true, false])(
    "keeps manual entry available during scanning=%s or discovery failure",
    async (isScanning) => {
      const user = userEvent.setup();
      mocks.isScanning = isScanning;
      mocks.error = isScanning ? null : "Discovery unavailable";
      renderSheet({ isOpen: true, close: vi.fn() });
      await user.click(
        screen.getByRole("button", {
          name: "settings.deviceSetup.addDeviceManually",
        }),
      );
      expect(
        screen.getByRole("textbox", { name: "settings.device" }),
      ).toHaveFocus();
      expect(mocks.stopScan).toHaveBeenCalled();
      expect(
        screen.queryByRole("region", { name: "scan.deviceSheetRecent" }),
      ).not.toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: "nav.cancel" }));
      expect(
        screen.getByRole("button", {
          name: "settings.deviceSetup.addDeviceManually",
        }),
      ).toHaveFocus();
      expect(mocks.startScan).toHaveBeenCalledTimes(2);
    },
  );

  it("leaves manual entry on Escape without closing the sheet", async () => {
    const user = userEvent.setup();
    const close = vi.fn();
    renderSheet({ isOpen: true, close });
    await user.click(
      screen.getByRole("button", {
        name: "settings.deviceSetup.addDeviceManually",
      }),
    );
    await user.keyboard("{Escape}");

    expect(
      screen.queryByRole("textbox", { name: "settings.device" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: "settings.deviceSetup.addDeviceManually",
      }),
    ).toBeInTheDocument();
    expect(close).not.toHaveBeenCalled();
  });

  it.each(["{Enter}", " "])(
    "opens manual entry with %s from its device-list row",
    async (key) => {
      const user = userEvent.setup();
      renderSheet({ isOpen: true, close: vi.fn() });
      const manual = screen.getByRole("button", {
        name: "settings.deviceSetup.addDeviceManually",
      });
      expect(
        screen.getByRole("region", { name: "scan.deviceSheetRecent" }),
      ).toContainElement(manual);
      manual.focus();
      await user.keyboard(key);
      expect(
        screen.getByRole("textbox", { name: "settings.device" }),
      ).toHaveFocus();
      await user.click(screen.getByRole("button", { name: "nav.cancel" }));
      expect(
        screen.getByRole("button", {
          name: "settings.deviceSetup.addDeviceManually",
        }),
      ).toHaveFocus();
    },
  );

  it.each(["{Enter}", " "])(
    "opens pairing with %s from the icon control",
    async (key) => {
      const user = userEvent.setup();
      const close = vi.fn();
      renderSheet({ isOpen: true, close });
      const pair = screen.getByRole("button", { name: "pairing.openPairing" });

      pair.focus();
      await user.keyboard(key);

      expect(mocks.openPairingModal).toHaveBeenCalledOnce();
      expect(close).toHaveBeenCalledOnce();
    },
  );
});
