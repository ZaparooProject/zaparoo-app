import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "../../../test-utils";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { encodeDeviceAddress } from "@/lib/deviceUrl";

const {
  componentRef,
  mockNavigate,
  mockGoBack,
  mockSelectDevice,
  mockParams,
  mockCoreReset,
  mockSetDeviceAddress,
  mockGetDeviceAddress,
} = vi.hoisted(() => ({
  componentRef: { current: null as any },
  mockNavigate: vi.fn(),
  mockGoBack: vi.fn(),
  mockSelectDevice: vi.fn(),
  mockParams: { current: { address: "192.168.1.50" } },
  mockCoreReset: vi.fn(),
  mockSetDeviceAddress: vi.fn(),
  mockGetDeviceAddress: vi.fn(() => "192.168.1.10"),
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
    useRouter: () => ({
      history: { back: mockGoBack },
      navigate: mockNavigate,
    }),
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

vi.mock("@/hooks/useSelectDevice", () => ({
  useSelectDevice: () => ({
    selectDevice: mockSelectDevice,
    selectScanDevice: vi.fn(),
  }),
}));

vi.mock("@/lib/coreApi", () => ({
  CoreAPI: { reset: mockCoreReset },
  getDeviceAddress: () => mockGetDeviceAddress(),
  setDeviceAddress: (v: string) => mockSetDeviceAddress(v),
}));

vi.mock("@/lib/crypto/credentials", () => ({
  credentialStore: { list: vi.fn().mockResolvedValue([]) },
  normalizeDeviceKey: (s: string) =>
    s
      .toLowerCase()
      .replace(/^wss?:\/\//, "")
      .replace(/\/$/, ""),
}));

const mockUseStatusStore = vi.fn();
const mockUpdateDeviceHistoryMeta = vi.fn();
const mockRemoveDeviceHistory = vi.fn();
const mockResetConnectionState = vi.fn();
const mockSetTargetDeviceAddress = vi.fn();

vi.mock("@/lib/store", async (importOriginal) => {
  const actual = (await importOriginal()) as any;
  return {
    ...actual,
    useStatusStore: (selector: any) => mockUseStatusStore(selector),
  };
});

import "@/routes/settings.devices_.$address";

const getDeviceDetail = () => componentRef.current;

describe("Settings Device Detail Route", () => {
  let queryClient: QueryClient;

  const sampleEntry = {
    address: "192.168.1.50",
    name: "Living Room",
    platform: "linux",
    version: "1.0.0",
    lastConnectedAt: new Date("2026-01-01T12:00:00Z").getTime(),
  };

  const buildState = (overrides: Partial<any> = {}) => ({
    deviceHistory: [sampleEntry],
    removeDeviceHistory: mockRemoveDeviceHistory,
    updateDeviceHistoryMeta: mockUpdateDeviceHistoryMeta,
    setTargetDeviceAddress: mockSetTargetDeviceAddress,
    resetConnectionState: mockResetConnectionState,
    safeInsets: { top: "0px", bottom: "0px", left: "0px", right: "0px" },
    ...overrides,
  });

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    mockParams.current = {
      address: encodeDeviceAddress("192.168.1.50"),
    };
    mockGetDeviceAddress.mockReturnValue("192.168.1.10");
    mockUseStatusStore.mockImplementation((selector) => selector(buildState()));
  });

  afterEach(() => {
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

  it("renders the entry's metadata", () => {
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

  it("disables Save until the name draft changes", async () => {
    const user = userEvent.setup();
    renderRoute();

    const saveButton = screen.getByRole("button", { name: "Save" });
    expect(saveButton).toBeDisabled();

    const input = screen.getByDisplayValue("Living Room");
    await user.clear(input);
    await user.type(input, "Bedroom");

    expect(saveButton).toBeEnabled();
  });

  it("calls updateDeviceHistoryMeta with the trimmed name on Save", async () => {
    const user = userEvent.setup();
    renderRoute();

    const input = screen.getByDisplayValue("Living Room");
    await user.clear(input);
    await user.type(input, "  Bedroom  ");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(mockUpdateDeviceHistoryMeta).toHaveBeenCalledWith(
      "192.168.1.50",
      { name: "Bedroom" },
      { source: "manual" },
    );
  });

  it("clears the custom name when Save is pressed with empty input", async () => {
    const user = userEvent.setup();
    renderRoute();

    const input = screen.getByDisplayValue("Living Room");
    await user.clear(input);
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(mockUpdateDeviceHistoryMeta).toHaveBeenCalledWith(
      "192.168.1.50",
      { name: undefined },
      { source: "manual" },
    );
  });

  it("hides 'Use this device' on the active connected device", () => {
    mockGetDeviceAddress.mockReturnValue("192.168.1.50");
    renderRoute();

    expect(
      screen.queryByRole("button", {
        name: "settings.deviceDetail.useThisDevice",
      }),
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText("settings.activeDevice")).toBeInTheDocument();
  });

  it("calls selectDevice when 'Use this device' is tapped", async () => {
    const user = userEvent.setup();
    renderRoute();

    await user.click(
      screen.getByRole("button", {
        name: "settings.deviceDetail.useThisDevice",
      }),
    );

    expect(mockSelectDevice).toHaveBeenCalledWith("192.168.1.50");
    expect(mockNavigate).toHaveBeenCalledWith({ to: "/settings" });
  });

  it("opens the forget confirm modal and removes the device on confirm", async () => {
    const user = userEvent.setup();
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

    expect(mockRemoveDeviceHistory).toHaveBeenCalledWith("192.168.1.50");
    expect(mockNavigate).toHaveBeenCalledWith({
      to: "/settings/devices",
      replace: true,
    });
  });

  it("clears connection state when forgetting the active device", async () => {
    mockGetDeviceAddress.mockReturnValue("192.168.1.50");
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

    expect(mockSetDeviceAddress).toHaveBeenCalledWith("");
    expect(mockSetTargetDeviceAddress).toHaveBeenCalledWith("");
    expect(mockResetConnectionState).toHaveBeenCalled();
    expect(mockCoreReset).toHaveBeenCalled();
  });

  it("redirects to the device list when the address is unknown", () => {
    mockParams.current = { address: encodeDeviceAddress("unknown.device") };
    renderRoute();

    expect(mockNavigate).toHaveBeenCalledWith({
      to: "/settings/devices",
      replace: true,
    });
  });
});
