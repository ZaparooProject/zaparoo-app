import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "../../../test-utils";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { CoreAPI } from "@/lib/coreApi";
import {
  credentialKeyForRecord,
  credentialStore,
  type StoredCredentials,
} from "@/lib/crypto/credentials";
import {
  deviceRegistry,
  type DeviceRecord,
} from "@/lib/devices/deviceRegistry";
import { ConnectionState, useStatusStore } from "@/lib/store";
import {
  mockDeviceRecord,
  seedDeviceRegistry,
} from "@/test-utils/deviceRegistry";

const { componentRef, mockNavigate, mockParams } = vi.hoisted(() => ({
  componentRef: { current: null as any },
  mockNavigate: vi.fn(),
  mockParams: { current: { recordId: "" } },
}));

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

const mockIsConnected = vi.fn(() => true);
vi.mock("@/hooks/useConnection", () => ({
  useConnection: () => ({ isConnected: mockIsConnected() }),
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

  it("should tear the connection down when forgetting the active device", async () => {
    await seedRecord(true);
    const user = userEvent.setup();
    useStatusStore.setState({
      connectionState: ConnectionState.CONNECTED,
      connected: true,
      connectionError: "stale error",
    });
    CoreAPI.setWsInstance({
      isConnected: true,
      send: () => {},
    } as unknown as Parameters<typeof CoreAPI.setWsInstance>[0]);
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
      expect(useStatusStore.getState().connectionState).toBe(
        ConnectionState.IDLE,
      );
    });
    expect(useStatusStore.getState().connectionError).toBe("");
    expect(CoreAPI.isConnected()).toBe(false);
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
