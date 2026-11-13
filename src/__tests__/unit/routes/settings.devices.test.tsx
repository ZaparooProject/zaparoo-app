import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, render, screen, waitFor, within } from "@/test-utils";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Capacitor } from "@capacitor/core";
import { Preferences } from "@capacitor/preferences";
import { ZeroConf } from "capacitor-zeroconf";
import { DeviceSheetContext } from "@/hooks/useDeviceSheetController";
import {
  credentialKeyForRecord,
  credentialStore,
  type StoredCredentials,
} from "@/lib/crypto/credentials";
import { CoreAPI } from "@/lib/coreApi";
import { deviceRegistry } from "@/lib/devices/deviceRegistry";
import { ConnectionState, useStatusStore } from "@/lib/store";
import {
  mockDeviceRecord,
  seedDeviceRegistry,
  type DeviceRecordOptions,
} from "@/test-utils/deviceRegistry";

const { componentRef, mockNavigate } = vi.hoisted(() => ({
  componentRef: { current: null as any },
  mockNavigate: vi.fn(),
}));

vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual = (await importOriginal()) as any;
  return {
    ...actual,
    createFileRoute: () => (options: any) => {
      componentRef.current = options.component;
      return { options };
    },
    useRouter: () => ({ navigate: mockNavigate }),
    Link: ({
      children,
      to,
      params,
      "aria-label": ariaLabel,
      className,
    }: {
      children: React.ReactNode;
      to: string;
      params?: Record<string, string>;
      "aria-label"?: string;
      className?: string;
    }) => {
      const href = params
        ? to.replace(/\$(\w+)/g, (_m, key) => params[key] ?? "")
        : to;
      return (
        <a href={href} aria-label={ariaLabel} className={className}>
          {children}
        </a>
      );
    },
  };
});

vi.mock("@/hooks/useSmartSwipe", () => ({
  useSmartSwipe: () => ({}),
}));

vi.mock("@/hooks/usePageHeadingFocus", () => ({
  usePageHeadingFocus: vi.fn(),
}));

vi.mock("@/hooks/useConnection", () => ({
  useConnection: () => ({ isConnected: true }),
}));

import "@/routes/settings.devices";

const getDevices = () => componentRef.current;

const savedList = () =>
  screen.getByRole("region", { name: "settings.savedDevices" });

/** The saved-device rows in display order, each as its visible text. */
const savedRowTexts = () =>
  within(savedList())
    .getAllByRole("button")
    .map((row) => row.textContent)
    .filter((text) => text !== "settings.addDevice");

const credentials: StoredCredentials = {
  authToken: "token-abc",
  pairingKey: "a".repeat(64),
  clientId: "client-uuid-1234",
  pairedAt: 1700000000000,
};

async function seedRecords(
  entries: DeviceRecordOptions[],
  activeIndex: number | null = null,
) {
  const records = entries.map((entry) => mockDeviceRecord(entry));
  await seedDeviceRegistry(
    records,
    activeIndex === null ? null : (records[activeIndex]?.recordId ?? null),
  );
  return records;
}

describe("Settings Devices Route", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    CoreAPI.reset();
    useStatusStore.setState({
      connected: false,
      connectionState: ConnectionState.IDLE,
      connectionError: "",
      coreVersion: null,
      corePlatform: null,
      coreVersionPending: false,
      currentClient: null,
      encryptionState: "unknown",
      pairingRequired: false,
    });
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    queryClient.clear();
  });

  const renderRoute = () => {
    const Devices = getDevices();
    return render(
      <QueryClientProvider client={queryClient}>
        <Devices />
      </QueryClientProvider>,
    );
  };

  it("should render the empty state when no devices are saved", async () => {
    await seedDeviceRegistry([]);
    renderRoute();

    expect(
      await screen.findByText("settings.deviceHistoryEmpty"),
    ).toBeInTheDocument();
  });

  it("should not claim there are no devices while the registry is still loading", async () => {
    // An unhydrated registry holds no records for the same reason a brand new
    // install holds none. Telling the second story to the first user invites
    // them to re-pair devices they already own.
    renderRoute();

    expect(
      screen.queryByText("settings.deviceHistoryEmpty"),
    ).not.toBeInTheDocument();
    expect(
      await screen.findByText("settings.deviceHistoryLoading"),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "settings.addDevice" }),
    ).not.toBeInTheDocument();

    await act(async () => {
      await seedRecords([{ address: "192.168.1.10", name: "Alpha" }]);
    });

    expect(await within(savedList()).findByText("Alpha")).toBeInTheDocument();
    expect(
      screen.queryByText("settings.deviceHistoryLoading"),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "settings.addDevice" }),
    ).toBeVisible();
  });

  it("should let the user retry a failed registry read", async () => {
    const user = userEvent.setup();
    vi.mocked(Preferences.get).mockRejectedValueOnce(
      new Error("storage unavailable"),
    );
    await deviceRegistry.hydrate();
    renderRoute();
    await screen.findByText("settings.deviceHistoryError");
    const readsBeforeRetry = vi.mocked(Preferences.get).mock.calls.length;

    await user.click(screen.getByRole("button", { name: "scan.retry" }));

    await waitFor(() => {
      expect(vi.mocked(Preferences.get).mock.calls.length).toBeGreaterThan(
        readsBeforeRetry,
      );
    });
  });

  it("should distinguish a failed registry read from having no devices", async () => {
    // Telling a user whose registry failed to load that they have never saved a
    // device invites them to re-pair devices they already own.
    vi.mocked(Preferences.get).mockRejectedValueOnce(
      new Error("storage unavailable"),
    );
    await deviceRegistry.hydrate();
    renderRoute();

    expect(
      await screen.findByText("settings.deviceHistoryError"),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("settings.deviceHistoryEmpty"),
    ).not.toBeInTheDocument();
  });

  it("should render one row per record, most recently connected first", async () => {
    await seedRecords([
      { address: "192.168.1.10", name: "Alpha", lastConnectedAt: 20 },
      { address: "192.168.1.11", name: "Never" },
      { address: "192.168.1.12", name: "Zulu", lastConnectedAt: 30 },
      { address: "192.168.1.13", name: "Mike", lastConnectedAt: 10 },
    ]);

    renderRoute();

    await waitFor(() => {
      expect(savedRowTexts()).toEqual(["Zulu", "Alpha", "Mike", "Never"]);
    });
  });

  it("should show each row as a name and platform, without address or version", async () => {
    await seedRecords([
      {
        address: "192.168.1.10",
        name: "Living room",
        platform: "mister",
        version: "2.18.0",
        lastConnectedAt: 3,
      },
      { address: "192.168.1.11", name: "No platform", lastConnectedAt: 2 },
      { address: "nameless.local", platform: "linux", lastConnectedAt: 1 },
    ]);

    renderRoute();

    await waitFor(() => {
      expect(savedRowTexts()).toEqual([
        "Living roommister",
        "No platform",
        "nameless.locallinux",
      ]);
    });
  });

  it("should list a Bluetooth-only device by its name, or as an unnamed device", async () => {
    const [wifi] = await seedRecords([
      { address: "192.168.1.10", name: "Wi-Fi Core", lastConnectedAt: 3 },
    ]);
    await seedDeviceRegistry([
      wifi!,
      {
        recordId: "ble-only",
        endpoints: [],
        preferredEndpointId: "",
        name: "Bluetooth Core",
        ble: { deviceId: "core-1", peripheralId: "AA:BB" },
        lastConnectedAt: 2,
      },
      {
        recordId: "ble-unnamed",
        endpoints: [],
        preferredEndpointId: "",
        platform: "mister",
        ble: { deviceId: "core-2", peripheralId: "CC:DD" },
        lastConnectedAt: 1,
      },
    ]);

    renderRoute();

    await waitFor(() => {
      expect(savedRowTexts()).toEqual([
        "Wi-Fi Core",
        "Bluetooth Core",
        "settings.bluetoothScan.unnamedmister",
      ]);
    });
    expect(
      within(savedList()).queryByText("settings.bluetoothScan.viaBluetooth"),
    ).not.toBeInTheDocument();
  });

  it("should mark the currently connected device as active", async () => {
    await seedRecords(
      [
        { address: "192.168.1.10", name: "Active" },
        { address: "192.168.1.11", name: "Other" },
      ],
      0,
    );

    renderRoute();

    expect(
      await screen.findByLabelText("settings.activeDevice"),
    ).toBeInTheDocument();
  });

  it("should show the lock icon once a device is paired from this page", async () => {
    const [record] = await seedRecords(
      [{ address: "192.168.1.10", name: "Living room" }],
      0,
    );
    renderRoute();
    await screen.findByText("Living room");
    expect(
      screen.queryByLabelText("connection.encrypted"),
    ).not.toBeInTheDocument();

    // Pairing stores the credential, then the restarted connection settles.
    await credentialStore.set(
      credentialKeyForRecord(record!.recordId),
      credentials,
    );
    act(() => {
      useStatusStore.setState({ encryptionState: "encrypted" });
    });

    expect(
      await screen.findByLabelText("connection.encrypted"),
    ).toBeInTheDocument();
  });

  it("should expose the active device marker as an image", async () => {
    await seedRecords([{ address: "192.168.1.10", name: "Active" }], 0);
    renderRoute();

    expect(
      await screen.findByRole("img", { name: "settings.activeDevice" }),
    ).toBeInTheDocument();
  });

  it("should be management only, with no scan, manual entry or status on the page", async () => {
    await seedRecords([{ address: "192.168.1.10", name: "Alpha" }], 0);
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);
    try {
      renderRoute();

      expect(
        await screen.findByRole("heading", {
          level: 2,
          name: "settings.savedDevices",
        }),
      ).toBeInTheDocument();
      expect(screen.getAllByRole("heading", { level: 2 })).toHaveLength(1);
      expect(
        screen.queryByRole("heading", { level: 3 }),
      ).not.toBeInTheDocument();
      expect(screen.getAllByRole("region")).toEqual([savedList()]);
      for (const name of [
        "settings.deviceSetup.addDeviceManually",
        "settings.networkScan.refresh",
        "pairing.openPairing",
        "settings.connectDevice",
        "settings.deviceCombine.edit",
        "settings.deviceCombine.open",
      ]) {
        expect(screen.queryByRole("button", { name })).not.toBeInTheDocument();
      }
      expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
      expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(ZeroConf.watch).not.toHaveBeenCalled();
    } finally {
      vi.mocked(Capacitor.isNativePlatform).mockReturnValue(false);
    }
  });

  it("should show the lock icon only on rows whose record holds credentials", async () => {
    const [, paired] = await seedRecords([
      { address: "192.168.1.10", name: "Unpaired" },
      { address: "192.168.1.11", name: "Paired" },
    ]);
    await credentialStore.set(
      credentialKeyForRecord(paired!.recordId),
      credentials,
    );

    renderRoute();

    await waitFor(() => {
      expect(screen.getAllByLabelText("connection.encrypted")).toHaveLength(1);
    });
  });

  it("should show the lock icon for a migrated record still on its pre-V2 key", async () => {
    // The pairing only moves to the canonical key on the first encrypted
    // connect, so until then the address key is where it lives.
    await seedRecords([
      {
        address: "192.168.1.10",
        name: "Migrated",
        legacyCredentialKey: "192.168.1.10",
      },
    ]);
    await credentialStore.set("192.168.1.10", credentials);

    renderRoute();

    await waitFor(() => {
      expect(screen.getAllByLabelText("connection.encrypted")).toHaveLength(1);
    });
  });

  it("should open a device's details without changing the active device", async () => {
    const user = userEvent.setup();
    const [first, second] = await seedRecords(
      [
        { address: "192.168.1.20", name: "Pick me" },
        { address: "192.168.1.21", name: "Not me" },
      ],
      1,
    );
    expect(deviceRegistry.getSnapshot().activeRecordId).toBe(second!.recordId);

    renderRoute();
    await user.click(within(savedList()).getByText("Pick me"));

    expect(deviceRegistry.getSnapshot().activeRecordId).toBe(second!.recordId);
    expect(mockNavigate).toHaveBeenCalledWith({
      to: "/settings/devices/$recordId",
      params: { recordId: first!.recordId },
    });
  });

  it("should present management with one detail action per device", async () => {
    const user = userEvent.setup();
    const [record] = await seedRecords([
      { address: "192.168.1.30", name: "With Info" },
    ]);

    renderRoute();

    expect(
      screen.getByRole("heading", { name: "scan.deviceSheetAllDevices" }),
    ).toBeVisible();
    await user.click(await screen.findByRole("button", { name: /With Info/ }));

    expect(mockNavigate).toHaveBeenCalledWith({
      to: "/settings/devices/$recordId",
      params: { recordId: record!.recordId },
    });
  });

  it("should open its own device sheet from Add device", async () => {
    const user = userEvent.setup();
    await seedRecords([{ address: "192.168.1.10", name: "Alpha" }], 0);
    renderRoute();

    const add = await screen.findByRole("button", {
      name: "settings.addDevice",
    });
    expect(add).toHaveAttribute("aria-expanded", "false");
    expect(savedList()).toContainElement(add);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await user.click(add);

    const sheet = await screen.findByRole("dialog", {
      name: "scan.deviceSheetTitle",
    });
    expect(
      within(sheet).getByRole("button", {
        name: "settings.deviceSetup.addDeviceManually",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "settings.addDevice", hidden: true }),
    ).toHaveAttribute("aria-expanded", "true");
  });

  it("should open the shared device sheet instead of its own when one is provided", async () => {
    const user = userEvent.setup();
    await seedRecords([{ address: "192.168.1.10", name: "Alpha" }], 0);
    const setOpen = vi.fn();
    const Devices = getDevices();
    render(
      <QueryClientProvider client={queryClient}>
        <DeviceSheetContext.Provider value={{ isOpen: false, setOpen }}>
          <Devices />
        </DeviceSheetContext.Provider>
      </QueryClientProvider>,
    );

    await user.click(
      await screen.findByRole("button", { name: "settings.addDevice" }),
    );

    expect(setOpen).toHaveBeenCalledExactlyOnceWith(true);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(
      screen.queryByText("settings.deviceSetup.addDeviceManually"),
    ).not.toBeInTheDocument();
  });

  it("should show the pairing a combine moved onto the surviving record", async () => {
    const [activeTarget, pairedSource] = await seedRecords(
      [
        { address: "steamdeck.local", name: "Steamdeck" },
        { address: "10.0.0.206", name: "Steamdeck alias" },
      ],
      0,
    );
    await credentialStore.set(
      credentialKeyForRecord(pairedSource!.recordId),
      credentials,
    );
    await deviceRegistry.mergeRecords(
      activeTarget!.recordId,
      pairedSource!.recordId,
    );

    renderRoute();

    expect(
      await within(savedList()).findByLabelText("connection.encrypted"),
    ).toBeInTheDocument();
    expect(savedRowTexts()).toEqual(["Steamdeck"]);
  });

  it("should keep shared legacy pairing visible on a record a combine left alone", async () => {
    const sharedLegacyKey = "shared-device-key";
    const [activeTarget, source, sharedOwner] = await seedRecords(
      [
        { address: "steamdeck.local", name: "A target", lastConnectedAt: 3 },
        {
          address: "10.0.0.206",
          name: "B source",
          legacyCredentialKey: sharedLegacyKey,
          lastConnectedAt: 2,
        },
        {
          address: "10.0.0.207",
          name: "C shared owner",
          legacyCredentialKey: sharedLegacyKey,
          lastConnectedAt: 1,
        },
      ],
      0,
    );
    await credentialStore.set(sharedLegacyKey, credentials);
    await deviceRegistry.mergeRecords(activeTarget!.recordId, source!.recordId);

    renderRoute();

    await waitFor(() => {
      expect(
        within(savedList()).getAllByLabelText("connection.encrypted"),
      ).toHaveLength(2);
    });
    expect(savedRowTexts()).toEqual(["A target", "C shared owner"]);
    expect(Object.keys(deviceRegistry.getSnapshot().records)).toEqual([
      activeTarget!.recordId,
      sharedOwner!.recordId,
    ]);
    expect(await credentialStore.get(sharedLegacyKey)).toEqual(credentials);
    expect(
      await credentialStore.get(credentialKeyForRecord(activeTarget!.recordId)),
    ).toEqual(credentials);
  });

  it("should navigate to Settings without resetting scroll", async () => {
    const user = userEvent.setup();
    await seedDeviceRegistry([]);
    renderRoute();

    await user.click(screen.getByLabelText("nav.back"));
    expect(mockNavigate).toHaveBeenCalledWith({
      to: "/settings",
      resetScroll: false,
    });
  });
});
