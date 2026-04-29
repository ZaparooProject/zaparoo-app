import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "../../../test-utils";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { encodeDeviceAddress } from "@/lib/deviceUrl";
import { useStatusStore } from "@/lib/store";

const { componentRef, mockNavigate, mockGoBack, mockSelectDevice } = vi.hoisted(
  () => ({
    componentRef: { current: null as any },
    mockNavigate: vi.fn(),
    mockGoBack: vi.fn(),
    mockSelectDevice: vi.fn(),
  }),
);

vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual = (await importOriginal()) as any;
  return {
    ...actual,
    createFileRoute: () => (options: any) => {
      componentRef.current = options.component;
      return { options };
    },
    useRouter: () => ({
      history: { back: mockGoBack },
      navigate: mockNavigate,
    }),
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
        ? to.replace(/\$(\w+)/g, (_m, k) => params[k] ?? "")
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

vi.mock("@/hooks/useSelectDevice", () => ({
  useSelectDevice: () => ({
    selectDevice: mockSelectDevice,
    selectScanDevice: vi.fn(),
  }),
}));

vi.mock("@/lib/coreApi", () => ({
  CoreAPI: { reset: vi.fn() },
  getDeviceAddress: vi.fn(() => "192.168.1.10"),
  setDeviceAddress: vi.fn(),
}));

const mockCredentialList = vi.fn();
vi.mock("@/lib/crypto/credentials", () => ({
  credentialStore: {
    list: () => mockCredentialList(),
  },
  normalizeDeviceKey: (s: string) =>
    s
      .toLowerCase()
      .replace(/^wss?:\/\//, "")
      .replace(/\/$/, ""),
}));

import "@/routes/settings.devices";

const getDevices = () => componentRef.current;

type DeviceEntry = {
  address: string;
  name?: string;
  platform?: string;
  version?: string;
};

const seedDeviceHistory = (deviceHistory: DeviceEntry[]) => {
  useStatusStore.setState({
    deviceHistory,
    safeInsets: { top: "0px", bottom: "0px", left: "0px", right: "0px" },
  });
};

describe("Settings Devices Route", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    mockCredentialList.mockResolvedValue([]);
    seedDeviceHistory([]);
  });

  afterEach(() => {
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
    renderRoute();
    await waitFor(() => {
      expect(
        screen.getByText("settings.deviceHistoryEmpty"),
      ).toBeInTheDocument();
    });
  });

  it("should render one row per device entry, sorted alphabetically", async () => {
    seedDeviceHistory([
      { address: "192.168.1.10", name: "Zulu" },
      { address: "192.168.1.11", name: "Alpha" },
      { address: "192.168.1.12", name: "Mike" },
    ]);

    renderRoute();

    await waitFor(() => {
      const names = screen
        .getAllByText(/Alpha|Mike|Zulu/)
        .map((el) => el.textContent);
      expect(names).toEqual(["Alpha", "Mike", "Zulu"]);
    });
  });

  it("should mark the currently connected device as active", async () => {
    seedDeviceHistory([
      { address: "192.168.1.10", name: "Active" },
      { address: "192.168.1.11", name: "Other" },
    ]);

    renderRoute();

    await waitFor(() => {
      expect(
        screen.getByLabelText("settings.activeDevice"),
      ).toBeInTheDocument();
    });
  });

  it("should show the lock icon only on rows with stored credentials", async () => {
    mockCredentialList.mockResolvedValue([{ deviceKey: "192.168.1.11" }]);
    seedDeviceHistory([
      { address: "192.168.1.10", name: "Unpaired" },
      { address: "192.168.1.11", name: "Paired" },
    ]);

    renderRoute();

    await waitFor(() => {
      const locks = screen.getAllByLabelText("connection.encrypted");
      expect(locks).toHaveLength(1);
    });
  });

  it("should call selectDevice and navigate back to /settings on row tap", async () => {
    const user = userEvent.setup();
    seedDeviceHistory([{ address: "192.168.1.20", name: "Pick me" }]);

    renderRoute();

    await user.click(screen.getByText("Pick me"));

    expect(mockSelectDevice).toHaveBeenCalledWith("192.168.1.20");
    expect(mockNavigate).toHaveBeenCalledWith({ to: "/settings" });
  });

  it("should render an info link per row pointing to /settings/devices/$address", async () => {
    seedDeviceHistory([{ address: "192.168.1.30", name: "With Info" }]);

    renderRoute();

    await waitFor(() => {
      const infoLink = screen.getByLabelText("settings.deviceDetails");
      expect(infoLink).toHaveAttribute(
        "href",
        `/settings/devices/${encodeDeviceAddress("192.168.1.30")}`,
      );
    });
  });

  it("should call history.back when the back button is clicked", async () => {
    const user = userEvent.setup();
    renderRoute();

    await user.click(screen.getByLabelText("nav.back"));
    expect(mockGoBack).toHaveBeenCalled();
  });
});
