import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "../../../test-utils";
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
vi.mock("@/hooks/useConnection", () => ({
  useConnection: () => ({ isConnected: mockIsConnected() }),
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
    expect(
      screen.queryByText("online.deviceLink.description"),
    ).not.toBeInTheDocument();
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

  it("should redirect to the device list when the record is unknown", () => {
    mockParams.current = { recordId: "record-that-was-forgotten" };
    renderRoute();

    expect(mockNavigate).toHaveBeenCalledWith({
      to: "/settings/devices",
      replace: true,
    });
  });
});
