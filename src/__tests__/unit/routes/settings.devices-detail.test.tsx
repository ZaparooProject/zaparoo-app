import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, within } from "../../../test-utils";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Preferences } from "@capacitor/preferences";
import { SecureStorage } from "@aparajita/capacitor-secure-storage";
import toast from "react-hot-toast";
import {
  credentialKeyForRecord,
  credentialStore,
  type StoredCredentials,
} from "@/lib/crypto/credentials";
import {
  deviceRegistry,
  type DeviceRecord,
} from "@/lib/devices/deviceRegistry";
import {
  mockDeviceRecord,
  seedDeviceRegistry,
} from "@/test-utils/deviceRegistry";

const { componentRef, mockForgetDevice, mockNavigate, mockParams } = vi.hoisted(
  () => ({
    componentRef: { current: null as any },
    mockForgetDevice: vi.fn(),
    mockNavigate: vi.fn(),
    mockParams: { current: { recordId: "" } },
  }),
);

vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual = (await importOriginal()) as any;
  return {
    ...actual,
    Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
      <a href={to}>{children}</a>
    ),
    createFileRoute: () => (options: any) => {
      componentRef.current = options.component;
      return {
        options,
        useParams: () => mockParams.current,
      };
    },
    useRouter: () => ({ navigate: mockNavigate }),
  };
});

vi.mock("@/hooks/useSmartSwipe", () => ({
  useSmartSwipe: () => ({}),
}));

vi.mock("@/hooks/usePageHeadingFocus", () => ({
  usePageHeadingFocus: vi.fn(),
}));

vi.mock("react-hot-toast", () => ({
  default: {
    error: vi.fn(),
  },
}));

const mockIsConnected = vi.fn(() => true);
const mockActiveLink = vi.fn<() => "wifi" | "bluetooth" | null>(() => null);
const mockActiveAddress = vi.fn(() => "");
vi.mock("@/hooks/useConnection", () => ({
  useConnection: () => ({
    isConnected: mockIsConnected(),
    activeConnection: { link: mockActiveLink(), address: mockActiveAddress() },
  }),
  useDeviceConnectionActions: () => ({ forgetDevice: mockForgetDevice }),
}));

import "@/routes/settings.devices_.$recordId";

const getDeviceDetail = () => componentRef.current;

const credentials: StoredCredentials = {
  authToken: "token-abc",
  pairingKey: "a".repeat(64),
  clientId: "client-uuid-1234",
  pairedAt: 1700000000000,
};

describe("Settings Device Detail Route", () => {
  let queryClient: QueryClient;
  let record: DeviceRecord;

  /** Seed the viewed record, optionally as the active device. */
  async function seedRecord(isActive = false): Promise<DeviceRecord> {
    record = mockDeviceRecord({
      address: "192.168.1.50",
      name: "Living Room",
      platform: "linux",
      version: "1.0.0",
      lastConnectedAt: new Date("2026-01-01T12:00:00Z").getTime(),
    });
    const other = mockDeviceRecord({ address: "192.168.1.10", name: "Other" });
    await seedDeviceRegistry(
      [record, other],
      isActive ? record.recordId : other.recordId,
    );
    mockParams.current = { recordId: record.recordId };
    return record;
  }

  beforeEach(async () => {
    vi.clearAllMocks();
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    mockIsConnected.mockReturnValue(true);
    mockActiveLink.mockReturnValue(null);
    mockActiveAddress.mockReturnValue("");
    mockForgetDevice.mockImplementation((recordId: string) =>
      deviceRegistry.removeRecord(recordId),
    );
    await seedRecord();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    queryClient.clear();
  });

  const renderRoute = () => {
    const DeviceDetail = getDeviceDetail();
    return render(
      <QueryClientProvider client={queryClient}>
        <DeviceDetail />
      </QueryClientProvider>,
    );
  };

  it("should render the record's metadata", () => {
    renderRoute();

    expect(screen.getAllByText("Living Room").length).toBeGreaterThan(0);
    expect(
      screen.getByText(/settings\.deviceDetail\.address/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/settings\.deviceDetail\.platform/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/settings\.deviceDetail\.version/),
    ).toBeInTheDocument();
  });

  it("should disable Save until the name draft changes", async () => {
    const user = userEvent.setup();
    renderRoute();

    const saveButton = screen.getByRole("button", { name: "save" });
    expect(saveButton).toBeDisabled();

    const input = screen.getByDisplayValue("Living Room");
    await user.clear(input);
    await user.type(input, "Bedroom");

    expect(saveButton).toBeEnabled();
  });

  it("should store the trimmed name as the user's own on Save", async () => {
    const user = userEvent.setup();
    renderRoute();

    const input = screen.getByDisplayValue("Living Room");
    await user.clear(input);
    await user.type(input, "  Bedroom  ");
    await user.click(screen.getByRole("button", { name: "save" }));

    await waitFor(() => {
      expect(
        deviceRegistry.getSnapshot().records[record.recordId],
      ).toMatchObject({ name: "Bedroom", nameIsCustom: true });
    });
  });

  it("should hand the name back to the device when Save is pressed empty", async () => {
    const user = userEvent.setup();
    renderRoute();

    const input = screen.getByDisplayValue("Living Room");
    await user.clear(input);
    await user.click(screen.getByRole("button", { name: "save" }));

    await waitFor(() => {
      const updated = deviceRegistry.getSnapshot().records[record.recordId];
      expect(updated?.name).toBeUndefined();
      expect(updated?.nameIsCustom).toBe(false);
    });
  });

  it("should hide 'Use this device' and Online linking on the active connected device", async () => {
    await seedRecord(true);
    renderRoute();

    expect(
      screen.queryByRole("button", {
        name: "settings.deviceDetail.useThisDevice",
      }),
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText("settings.activeDevice")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "online.deviceLink.link" }),
    ).not.toBeInTheDocument();
  });

  it("should show the link in use on the active connected device", async () => {
    await seedRecord(true);
    mockActiveLink.mockReturnValue("bluetooth");
    renderRoute();

    expect(screen.getByText("settings.deviceDetail.link")).toBeInTheDocument();
  });

  it("should not show a link for a device that is not in use", () => {
    mockActiveLink.mockReturnValue("wifi");
    renderRoute();

    expect(
      screen.queryByText("settings.deviceDetail.link"),
    ).not.toBeInTheDocument();
  });

  describe("the address of a device saved over Bluetooth", () => {
    const bluetoothOnly: DeviceRecord = {
      recordId: "ble-only",
      endpoints: [],
      preferredEndpointId: "",
      ble: { deviceId: "core-1", peripheralId: "AA:BB" },
      reportedEndpoints: {
        addresses: ["10.0.0.206", "192.168.1.9"],
        port: 7497,
        at: 1,
      },
    };

    beforeEach(async () => {
      await seedDeviceRegistry([bluetoothOnly], bluetoothOnly.recordId);
      mockParams.current = { recordId: bluetoothOnly.recordId };
      mockActiveAddress.mockReturnValue("ws://192.168.1.9:7497/api/v0.1");
    });

    it("should be the network address in use while connected over Wi-Fi", () => {
      mockActiveLink.mockReturnValue("wifi");
      renderRoute();

      expect(screen.getByPlaceholderText("192.168.1.9")).toBeInTheDocument();
      // The heading also carries the active-device marker.
      expect(
        screen.getByRole("heading", { level: 1, name: /192\.168\.1\.9/ }),
      ).toBeInTheDocument();
      expect(
        screen.queryByPlaceholderText("settings.bluetoothScan.viaBluetooth"),
      ).not.toBeInTheDocument();
    });

    it("should stay Bluetooth while connected over Bluetooth", () => {
      mockActiveLink.mockReturnValue("bluetooth");
      mockActiveAddress.mockReturnValue("bluetooth:AA:BB");
      renderRoute();

      expect(
        screen.getByPlaceholderText("settings.bluetoothScan.viaBluetooth"),
      ).toBeInTheDocument();
    });

    it("should stay Bluetooth while not connected", () => {
      mockIsConnected.mockReturnValue(false);
      mockActiveLink.mockReturnValue("wifi");
      renderRoute();

      expect(
        screen.getByPlaceholderText("settings.bluetoothScan.viaBluetooth"),
      ).toBeInTheDocument();
    });

    it("should stay Bluetooth while another device is the one connected", async () => {
      const other = mockDeviceRecord({ address: "192.168.1.10" });
      await seedDeviceRegistry([bluetoothOnly, other], other.recordId);
      mockActiveLink.mockReturnValue("wifi");
      renderRoute();

      expect(
        screen.getByPlaceholderText("settings.bluetoothScan.viaBluetooth"),
      ).toBeInTheDocument();
    });
  });

  it("should keep a device's own saved address while connected over Wi-Fi", async () => {
    const saved = mockDeviceRecord({
      address: "192.168.1.50",
      ble: { deviceId: "core-1", peripheralId: "AA:BB" },
      reportedEndpoints: { addresses: ["192.168.1.9"], port: 7497, at: 1 },
    });
    await seedDeviceRegistry([saved], saved.recordId);
    mockParams.current = { recordId: saved.recordId };
    mockActiveLink.mockReturnValue("wifi");
    mockActiveAddress.mockReturnValue("ws://192.168.1.9:7497/api/v0.1");
    renderRoute();

    expect(screen.getByPlaceholderText("192.168.1.50")).toBeInTheDocument();
    expect(
      screen.queryByPlaceholderText("192.168.1.9"),
    ).not.toBeInTheDocument();
  });

  it("should show a Bluetooth-only device instead of redirecting", async () => {
    const bluetoothOnly: DeviceRecord = {
      recordId: "ble-only",
      endpoints: [],
      preferredEndpointId: "",
      ble: { deviceId: "core-1", peripheralId: "AA:BB" },
    };
    await seedDeviceRegistry([bluetoothOnly], bluetoothOnly.recordId);
    mockParams.current = { recordId: bluetoothOnly.recordId };
    renderRoute();

    expect(
      screen.getByPlaceholderText("settings.bluetoothScan.viaBluetooth"),
    ).toBeInTheDocument();
    expect(mockNavigate).not.toHaveBeenCalledWith(
      expect.objectContaining({ to: "/settings/devices" }),
    );
  });

  it("should navigate back to the device list without resetting scroll", async () => {
    const user = userEvent.setup();
    renderRoute();

    await user.click(screen.getByLabelText("nav.back"));

    expect(mockNavigate).toHaveBeenCalledWith({
      to: "/settings/devices",
      resetScroll: false,
    });
  });

  it("should make the record active when 'Use this device' is tapped", async () => {
    const user = userEvent.setup();
    renderRoute();

    await user.click(
      screen.getByRole("button", {
        name: "settings.deviceDetail.useThisDevice",
      }),
    );

    await waitFor(() => {
      expect(deviceRegistry.getSnapshot().activeRecordId).toBe(record.recordId);
    });
    expect(mockNavigate).toHaveBeenCalledWith({ to: "/settings" });
  });

  it("should forget the device and its pairing on confirm", async () => {
    const user = userEvent.setup();
    await credentialStore.set(
      credentialKeyForRecord(record.recordId),
      credentials,
    );
    renderRoute();

    await user.click(
      screen.getByRole("button", { name: "settings.deviceDetail.forget" }),
    );

    await waitFor(() => {
      expect(
        screen.getByText("settings.deviceDetail.forgetBody"),
      ).toBeInTheDocument();
    });

    await user.click(
      screen.getByRole("button", {
        name: "settings.deviceDetail.forgetConfirm",
      }),
    );

    await waitFor(() => {
      expect(
        deviceRegistry.getSnapshot().records[record.recordId],
      ).toBeUndefined();
    });
    // Leaving the pairing behind would let a later device at the same address
    // inherit it.
    await expect(
      credentialStore.get(credentialKeyForRecord(record.recordId)),
    ).resolves.toBeNull();
    expect(mockNavigate).toHaveBeenCalledWith({
      to: "/settings/devices",
      replace: true,
    });
  });

  it("should keep the device available without orphaning credentials when registry persistence fails", async () => {
    const user = userEvent.setup();
    const credentialKey = credentialKeyForRecord(record.recordId);
    await credentialStore.set(credentialKey, credentials);
    vi.mocked(Preferences.set).mockRejectedValueOnce(
      new Error("preferences write failed"),
    );
    renderRoute();

    await user.click(
      screen.getByRole("button", { name: "settings.deviceDetail.forget" }),
    );
    await user.click(
      screen.getByRole("button", {
        name: "settings.deviceDetail.forgetConfirm",
      }),
    );

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        "settings.deviceDetail.forgetFailed",
      );
    });
    expect(deviceRegistry.getSnapshot().records[record.recordId]).toBeDefined();
    await expect(credentialStore.get(credentialKey)).resolves.toBeNull();
    expect(
      screen.getByRole("button", {
        name: "settings.deviceDetail.forgetConfirm",
      }),
    ).toBeEnabled();
    expect(mockNavigate).not.toHaveBeenCalledWith({
      to: "/settings/devices",
      replace: true,
    });
  });

  it("should keep the device without writing the registry when credential deletion fails", async () => {
    const user = userEvent.setup();
    const credentialKey = credentialKeyForRecord(record.recordId);
    await credentialStore.set(credentialKey, credentials);
    vi.mocked(SecureStorage.remove).mockRejectedValueOnce(
      new Error("secure storage deletion failed"),
    );
    vi.mocked(Preferences.set).mockClear();
    renderRoute();

    await user.click(
      screen.getByRole("button", { name: "settings.deviceDetail.forget" }),
    );
    await user.click(
      screen.getByRole("button", {
        name: "settings.deviceDetail.forgetConfirm",
      }),
    );

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        "settings.deviceDetail.forgetFailed",
      );
    });
    expect(deviceRegistry.getSnapshot().records[record.recordId]).toBeDefined();
    await expect(credentialStore.get(credentialKey)).resolves.toEqual(
      credentials,
    );
    expect(Preferences.set).not.toHaveBeenCalled();
    expect(
      screen.getByRole("button", {
        name: "settings.deviceDetail.forgetConfirm",
      }),
    ).toBeEnabled();
    expect(mockNavigate).not.toHaveBeenCalledWith({
      to: "/settings/devices",
      replace: true,
    });
  });

  it("should delegate active-device teardown to the connection owner", async () => {
    await seedRecord(true);
    const user = userEvent.setup();
    renderRoute();

    await user.click(
      screen.getByRole("button", { name: "settings.deviceDetail.forget" }),
    );
    await user.click(
      screen.getByRole("button", {
        name: "settings.deviceDetail.forgetConfirm",
      }),
    );

    await waitFor(() => {
      expect(mockForgetDevice).toHaveBeenCalledWith(record.recordId);
    });
    expect(deviceRegistry.getSnapshot().activeRecordId).toBeNull();
  });

  describe("combining with another saved device", () => {
    /** Seed the viewed record and one other, then point the page at the first. */
    async function seedPair(active: "shown" | "other" | null) {
      const shown = mockDeviceRecord({
        address: "steamdeck.local",
        name: "Steamdeck",
      });
      const other = mockDeviceRecord({
        address: "10.0.0.206",
        name: "Steamdeck alias",
        platform: "linux",
      });
      await seedDeviceRegistry(
        [shown, other],
        active === null ? null : (active === "shown" ? shown : other).recordId,
      );
      mockParams.current = { recordId: shown.recordId };
      return { shown, other };
    }

    /** Open the combine modal and pick the other record, up to the confirmation. */
    async function chooseOther(user: ReturnType<typeof userEvent.setup>) {
      await user.click(
        screen.getByRole("button", { name: "settings.deviceCombine.open" }),
      );
      const chooser = screen.getByRole("dialog", {
        name: "settings.deviceCombine.choose",
      });
      await user.click(
        within(chooser).getByRole("button", { name: /Steamdeck alias/ }),
      );
      return screen.getByRole("dialog", {
        name: "settings.deviceCombine.title",
      });
    }

    const detailsOf = (target: DeviceRecord) => ({
      to: "/settings/devices/$recordId",
      params: { recordId: target.recordId },
      replace: true,
    });

    it("should not offer combining when no other record is saved", async () => {
      const only = mockDeviceRecord({ address: "192.168.1.50", name: "Only" });
      await seedDeviceRegistry([only]);
      mockParams.current = { recordId: only.recordId };
      renderRoute();

      expect(
        screen.getByRole("button", { name: "settings.deviceDetail.forget" }),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "settings.deviceCombine.open" }),
      ).not.toBeInTheDocument();
    });

    it("should list only the other saved records to combine with", async () => {
      const user = userEvent.setup();
      const shown = mockDeviceRecord({ address: "10.0.0.1", name: "Shown" });
      const older = mockDeviceRecord({
        address: "10.0.0.2",
        name: "Older",
        lastConnectedAt: 1,
      });
      const newer = mockDeviceRecord({
        address: "10.0.0.3",
        platform: "mister",
        lastConnectedAt: 2,
      });
      const bluetoothOnly: DeviceRecord = {
        recordId: "ble-only",
        endpoints: [],
        preferredEndpointId: "",
        ble: { deviceId: "core-1", peripheralId: "AA:BB" },
      };
      await seedDeviceRegistry([shown, older, bluetoothOnly, newer]);
      mockParams.current = { recordId: shown.recordId };
      renderRoute();

      await user.click(
        screen.getByRole("button", { name: "settings.deviceCombine.open" }),
      );

      const chooser = screen.getByRole("dialog", {
        name: "settings.deviceCombine.choose",
      });
      expect(
        within(chooser)
          .getAllByRole("button")
          .map((row) => row.textContent)
          .filter((text) => text !== ""),
      ).toEqual(["10.0.0.3mister", "Older", "settings.bluetoothScan.unnamed"]);
      expect(
        screen.queryByRole("button", {
          name: "settings.deviceCombine.confirm",
        }),
      ).not.toBeInTheDocument();
    });

    it("should tell same-named records apart by address or Bluetooth", async () => {
      const user = userEvent.setup();
      const shown = mockDeviceRecord({ address: "10.0.0.1", name: "Shown" });
      const overNetwork = mockDeviceRecord({
        address: "10.0.0.2",
        name: "MiSTer",
        platform: "mister",
        lastConnectedAt: 3,
      });
      const overBluetooth: DeviceRecord = {
        recordId: "ble-only",
        endpoints: [],
        preferredEndpointId: "",
        name: "MiSTer",
        ble: { deviceId: "core-1", peripheralId: "AA:BB" },
        lastConnectedAt: 2,
      };
      const unique = mockDeviceRecord({
        address: "10.0.0.4",
        name: "Deck",
        lastConnectedAt: 1,
      });
      await seedDeviceRegistry([shown, overNetwork, overBluetooth, unique]);
      mockParams.current = { recordId: shown.recordId };
      renderRoute();

      await user.click(
        screen.getByRole("button", { name: "settings.deviceCombine.open" }),
      );

      const chooser = screen.getByRole("dialog", {
        name: "settings.deviceCombine.choose",
      });
      expect(
        within(chooser)
          .getAllByRole("button")
          .map((row) => row.textContent)
          .filter((text) => text !== ""),
      ).toEqual([
        "MiSTermister · 10.0.0.2",
        "MiSTersettings.bluetoothScan.viaBluetooth",
        "Deck",
      ]);
    });

    it("should be ready to combine again on the record it left for", async () => {
      const user = userEvent.setup();
      const shown = mockDeviceRecord({
        address: "steamdeck.local",
        name: "Steamdeck",
      });
      const other = mockDeviceRecord({
        address: "10.0.0.206",
        name: "Steamdeck alias",
      });
      const third = mockDeviceRecord({
        address: "10.0.0.207",
        name: "Third deck",
      });
      await seedDeviceRegistry([shown, other, third], other.recordId);
      mockParams.current = { recordId: shown.recordId };
      const DeviceDetail = getDeviceDetail();
      const page = () => (
        <QueryClientProvider client={queryClient}>
          <DeviceDetail />
        </QueryClientProvider>
      );
      const view = render(page());

      const confirmation = await chooseOther(user);
      await user.click(
        within(confirmation).getByRole("button", {
          name: "settings.deviceCombine.confirm",
        }),
      );
      await waitFor(() =>
        expect(mockNavigate).toHaveBeenCalledWith(detailsOf(other)),
      );

      // The router reuses the page for the record that was kept.
      mockParams.current = { recordId: other.recordId };
      view.rerender(page());

      await user.click(
        screen.getByRole("button", { name: "settings.deviceCombine.open" }),
      );
      await user.click(
        within(
          screen.getByRole("dialog", { name: "settings.deviceCombine.choose" }),
        ).getByRole("button", { name: /Third deck/ }),
      );
      expect(
        within(
          screen.getByRole("dialog", { name: "settings.deviceCombine.title" }),
        ).getByRole("button", { name: "settings.deviceCombine.confirm" }),
      ).toBeEnabled();
    });

    it("should combine with the chosen record after confirmation, keeping the active one", async () => {
      const user = userEvent.setup();
      const { shown, other } = await seedPair("other");
      queryClient.setQueryData(["library", shown.recordId], "hostname cache");
      queryClient.setQueryData(["library", other.recordId], "ip cache");
      renderRoute();

      const confirmation = await chooseOther(user);
      expect(
        within(confirmation).getByText("settings.deviceCombine.body"),
      ).toBeInTheDocument();
      expect(Object.keys(deviceRegistry.getSnapshot().records)).toHaveLength(2);

      await user.click(
        within(confirmation).getByRole("button", {
          name: "settings.deviceCombine.confirm",
        }),
      );

      await waitFor(() => {
        expect(Object.keys(deviceRegistry.getSnapshot().records)).toEqual([
          other.recordId,
        ]);
      });
      expect(deviceRegistry.getSnapshot().activeRecordId).toBe(other.recordId);
      expect(
        deviceRegistry.getSnapshot().records[other.recordId]?.endpoints,
      ).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ host: "steamdeck.local" }),
          expect.objectContaining({ host: "10.0.0.206" }),
        ]),
      );
      expect(
        queryClient.getQueryData(["library", shown.recordId]),
      ).toBeUndefined();
      expect(
        queryClient.getQueryData(["library", other.recordId]),
      ).toBeUndefined();
      await waitFor(() =>
        expect(mockNavigate).toHaveBeenCalledWith(detailsOf(other)),
      );
      // The page is leaving for the survivor, so the redirect for a record
      // that no longer exists must not follow it.
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(mockNavigate).toHaveBeenCalledExactlyOnceWith(detailsOf(other));
    });

    it("should keep the shown record when it is the active one and move the other's pairing to it", async () => {
      const user = userEvent.setup();
      const { shown, other } = await seedPair("shown");
      await credentialStore.set(
        credentialKeyForRecord(other.recordId),
        credentials,
      );
      renderRoute();

      const confirmation = await chooseOther(user);
      await user.click(
        within(confirmation).getByRole("button", {
          name: "settings.deviceCombine.confirm",
        }),
      );

      await waitFor(() => {
        expect(Object.keys(deviceRegistry.getSnapshot().records)).toEqual([
          shown.recordId,
        ]);
      });
      await expect(
        credentialStore.get(credentialKeyForRecord(shown.recordId)),
      ).resolves.toEqual(credentials);
      await waitFor(() =>
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
      );
      expect(mockNavigate).not.toHaveBeenCalled();
      expect(
        screen.queryByRole("button", { name: "settings.deviceCombine.open" }),
      ).not.toBeInTheDocument();
    });

    it.each([
      { paired: ["other"], survivor: "other" },
      { paired: ["shown"], survivor: "shown" },
      { paired: ["shown", "other"], survivor: "shown" },
      { paired: [], survivor: "shown" },
    ] as const)(
      "should keep the $survivor record when neither is active and $paired hold credentials",
      async ({ paired, survivor }) => {
        const user = userEvent.setup();
        const pair = await seedPair(null);
        for (const holder of paired) {
          await credentialStore.set(
            credentialKeyForRecord(pair[holder].recordId),
            credentials,
          );
        }
        const merge = vi.spyOn(deviceRegistry, "mergeRecords");
        renderRoute();

        const confirmation = await chooseOther(user);
        await user.click(
          within(confirmation).getByRole("button", {
            name: "settings.deviceCombine.confirm",
          }),
        );

        const kept = pair[survivor];
        const dropped = survivor === "shown" ? pair.other : pair.shown;
        await waitFor(() => {
          expect(Object.keys(deviceRegistry.getSnapshot().records)).toEqual([
            kept.recordId,
          ]);
        });
        expect(merge).toHaveBeenCalledExactlyOnceWith(
          kept.recordId,
          dropped.recordId,
        );
        await expect(
          credentialStore.get(credentialKeyForRecord(kept.recordId)),
        ).resolves.toEqual(paired.length > 0 ? credentials : null);
        if (survivor === "other") {
          await waitFor(() =>
            expect(mockNavigate).toHaveBeenCalledWith(detailsOf(kept)),
          );
        } else {
          expect(mockNavigate).not.toHaveBeenCalled();
        }
      },
    );

    it("should keep the record whose pairing is still under its pre-V2 key", async () => {
      const user = userEvent.setup();
      const shown = mockDeviceRecord({
        address: "10.0.0.1",
        name: "Steamdeck",
      });
      const other = mockDeviceRecord({
        address: "10.0.0.206",
        name: "Steamdeck alias",
        legacyCredentialKey: "10.0.0.206",
      });
      await seedDeviceRegistry([shown, other], null);
      await credentialStore.set("10.0.0.206", credentials);
      mockParams.current = { recordId: shown.recordId };
      renderRoute();

      const confirmation = await chooseOther(user);
      await user.click(
        within(confirmation).getByRole("button", {
          name: "settings.deviceCombine.confirm",
        }),
      );

      await waitFor(() => {
        expect(Object.keys(deviceRegistry.getSnapshot().records)).toEqual([
          other.recordId,
        ]);
      });
      await waitFor(() =>
        expect(mockNavigate).toHaveBeenCalledWith(detailsOf(other)),
      );
    });

    it("should leave both records alone when the confirmation is cancelled", async () => {
      const user = userEvent.setup();
      const { shown, other } = await seedPair("other");
      const merge = vi.spyOn(deviceRegistry, "mergeRecords");
      renderRoute();

      const confirmation = await chooseOther(user);
      await user.click(
        within(confirmation).getByRole("button", {
          name: "settings.deviceCombine.cancel",
        }),
      );

      await waitFor(() =>
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
      );
      expect(merge).not.toHaveBeenCalled();
      expect(Object.keys(deviceRegistry.getSnapshot().records)).toEqual([
        shown.recordId,
        other.recordId,
      ]);
    });

    it("should retain both records when combining fails", async () => {
      const user = userEvent.setup();
      const { shown, other } = await seedPair("other");
      vi.spyOn(deviceRegistry, "mergeRecords").mockRejectedValueOnce(
        new Error("keychain locked"),
      );
      renderRoute();

      const confirmation = await chooseOther(user);
      await user.click(
        within(confirmation).getByRole("button", {
          name: "settings.deviceCombine.confirm",
        }),
      );

      expect(
        await within(confirmation).findByText("settings.deviceCombine.failed"),
      ).toHaveAttribute("role", "alert");
      expect(Object.keys(deviceRegistry.getSnapshot().records)).toEqual([
        shown.recordId,
        other.recordId,
      ]);
      expect(
        within(confirmation).getByRole("button", {
          name: "settings.deviceCombine.confirm",
        }),
      ).toBeEnabled();
      expect(mockNavigate).not.toHaveBeenCalled();
    });
  });

  it("should redirect to the device list when the record is unknown", () => {
    mockParams.current = { recordId: "record-that-was-forgotten" };
    renderRoute();

    expect(mockNavigate).toHaveBeenCalledWith({
      to: "/settings/devices",
      replace: true,
    });
  });
});
