import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "../../../test-utils";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// Mock CoreAPI
vi.mock("@/lib/coreApi", () => ({
  CoreAPI: {
    reset: vi.fn(),
  },
  getDeviceAddress: vi.fn(() => "192.168.1.100"),
  setDeviceAddress: vi.fn(),
}));

// Mock stores
const mockUseStatusStore = vi.fn();

vi.mock("@/lib/store", async (importOriginal) => {
  const actual = (await importOriginal()) as any;
  return {
    ...actual,
    useStatusStore: (selector: any) => mockUseStatusStore(selector),
  };
});

// Mock router - use vi.hoisted to make variables accessible in mocks
const { componentRef, mockBrowserOpen } = vi.hoisted(() => ({
  componentRef: { current: null as any },
  mockBrowserOpen: vi.fn(),
}));

vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual = (await importOriginal()) as any;
  return {
    ...actual,
    createFileRoute: () => (options: any) => {
      componentRef.current = options.component;
      return { options };
    },
    Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
      <a href={to} data-testid={`link-${to.replace(/\//g, "-")}`}>
        {children}
      </a>
    ),
  };
});

// Mock hooks
vi.mock("@/hooks/usePageHeadingFocus", () => ({
  usePageHeadingFocus: vi.fn(),
}));

// Mock Capacitor
vi.mock("@capacitor/core", () => ({
  Capacitor: {
    isNativePlatform: vi.fn(() => false),
  },
}));

vi.mock("@capacitor/preferences", () => ({
  Preferences: {
    get: vi.fn().mockResolvedValue({ value: null }),
    set: vi.fn().mockResolvedValue(undefined),
    remove: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock("@capacitor/browser", () => ({
  Browser: {
    open: mockBrowserOpen,
  },
}));

// Mock preferencesStore to avoid hydration issues
vi.mock("@/lib/preferencesStore", () => ({
  usePreferencesStore: vi.fn(() => ({})),
}));

// Mock ProPurchase component
const mockSetProPurchaseModalOpen = vi.fn();
vi.mock("@/components/ProPurchase.tsx", () => ({
  useProPurchase: () => ({
    PurchaseModal: () => null,
    setProPurchaseModalOpen: mockSetProPurchaseModalOpen,
    proAccess: false,
  }),
}));

// Mock child components that have their own complex dependencies
vi.mock("@/components/MediaDatabaseCard", () => ({
  MediaDatabaseCard: () => (
    <div data-testid="media-database-card">Media Database Card</div>
  ),
}));

vi.mock("@/components/DeviceConnectionCard", () => ({
  DeviceConnectionCard: ({
    onHistoryClick,
    onScanClick,
    onAddressChange,
  }: {
    address: string;
    setAddress: (address: string) => void;
    onAddressChange: (address: string) => void;
    connectionError: string;
    hasDeviceHistory: boolean;
    onHistoryClick: () => void;
    onScanClick: () => void;
  }) => (
    <div data-testid="device-connection-card">
      <button onClick={onHistoryClick} data-testid="history-button">
        History
      </button>
      <button onClick={onScanClick} data-testid="scan-button">
        Scan
      </button>
      <button
        onClick={() => onAddressChange("192.168.1.200")}
        data-testid="change-address"
      >
        Change Address
      </button>
    </div>
  ),
}));

vi.mock("@/components/NetworkScanModal", () => ({
  NetworkScanModal: ({
    isOpen,
    onClose,
  }: {
    isOpen: boolean;
    onClose: () => void;
    onSelectDevice: (address: string) => void;
  }) =>
    isOpen ? (
      <div data-testid="network-scan-modal">
        <button onClick={onClose}>Close</button>
      </div>
    ) : null,
}));

// Import the route module to trigger createFileRoute which captures the component
import "@/routes/settings.index";

// The component will be captured by the mock
const getSettings = () => componentRef.current;

describe("Settings Index Route", () => {
  let queryClient: QueryClient;

  const defaultStoreState = {
    connectionError: "",
    loggedInUser: null,
    deviceHistory: [] as Array<{ address: string }>,
    setDeviceHistory: vi.fn(),
    removeDeviceHistory: vi.fn(),
    resetConnectionState: vi.fn(),
    setTargetDeviceAddress: vi.fn(),
    safeInsets: { top: "0px", bottom: "0px", left: "0px", right: "0px" },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });

    mockUseStatusStore.mockImplementation((selector) =>
      selector(defaultStoreState),
    );
  });

  afterEach(() => {
    queryClient.clear();
  });

  const renderComponent = () => {
    const Settings = getSettings();
    return render(
      <QueryClientProvider client={queryClient}>
        <Settings />
      </QueryClientProvider>,
    );
  };

  describe("rendering", () => {
    it("should render the page title", () => {
      renderComponent();
      expect(
        screen.getByRole("heading", { name: "settings.title" }),
      ).toBeInTheDocument();
    });

    it("should render the device connection card", () => {
      renderComponent();
      expect(screen.getByTestId("device-connection-card")).toBeInTheDocument();
    });

    it("should render the media database card", () => {
      renderComponent();
      expect(screen.getByTestId("media-database-card")).toBeInTheDocument();
    });

    it("should render the designer button", () => {
      renderComponent();
      expect(
        screen.getByRole("button", { name: "settings.designer" }),
      ).toBeInTheDocument();
    });

    it("should render navigation links to settings subpages", () => {
      renderComponent();
      expect(
        screen.getByText("settings.readers.title").closest("a"),
      ).toHaveAttribute("href", "/settings/readers");
      expect(
        screen.getByText("settings.playtime.title").closest("a"),
      ).toHaveAttribute("href", "/settings/playtime");
      expect(
        screen.getByText("settings.advanced.title").closest("a"),
      ).toHaveAttribute("href", "/settings/advanced");
      expect(
        screen.getByText("settings.help.title").closest("a"),
      ).toHaveAttribute("href", "/settings/help");
      expect(
        screen.getByText("settings.about.title").closest("a"),
      ).toHaveAttribute("href", "/settings/about");
    });

    it("should render the language selector with all supported languages", () => {
      renderComponent();

      const languageSelect = screen.getByRole("combobox");
      expect(languageSelect).toBeInTheDocument();

      // Check that all supported languages are options
      expect(screen.getByText("Deutsch")).toBeInTheDocument();
      expect(screen.getByText("English (UK)")).toBeInTheDocument();
      expect(screen.getByText("English (US)")).toBeInTheDocument();
      expect(screen.getByText("Français")).toBeInTheDocument();
      expect(screen.getByText("Nederlands")).toBeInTheDocument();
      expect(screen.getByText("中文")).toBeInTheDocument();
      expect(screen.getByText("日本語")).toBeInTheDocument();
      expect(screen.getByText("한국어")).toBeInTheDocument();
    });
  });

  describe("web platform specific", () => {
    it("should show Get App button on web platform", () => {
      // Capacitor.isNativePlatform is already mocked to return false
      renderComponent();

      expect(
        screen.getByRole("button", { name: "settings.getApp" }),
      ).toBeInTheDocument();
    });
  });

  describe("modals", () => {
    it("should open device history modal when history button is clicked", async () => {
      mockUseStatusStore.mockImplementation((selector) =>
        selector({
          ...defaultStoreState,
          deviceHistory: [{ address: "192.168.1.200" }],
        }),
      );

      renderComponent();

      fireEvent.click(screen.getByTestId("history-button"));

      await waitFor(() => {
        // SlideModal renders title in a <p> element, not a heading
        expect(screen.getByRole("dialog")).toBeInTheDocument();
      });
    });

    it("should open network scan modal when scan button is clicked", async () => {
      renderComponent();

      fireEvent.click(screen.getByTestId("scan-button"));

      await waitFor(() => {
        expect(screen.getByTestId("network-scan-modal")).toBeInTheDocument();
      });
    });
  });

  describe("device address changes", () => {
    it("should reset connection state when address changes", async () => {
      const mockResetConnectionState = vi.fn();
      const mockSetTargetDeviceAddress = vi.fn();

      mockUseStatusStore.mockImplementation((selector) =>
        selector({
          ...defaultStoreState,
          resetConnectionState: mockResetConnectionState,
          setTargetDeviceAddress: mockSetTargetDeviceAddress,
        }),
      );

      renderComponent();

      fireEvent.click(screen.getByTestId("change-address"));

      await waitFor(() => {
        expect(mockResetConnectionState).toHaveBeenCalled();
      });
    });

    it("should invalidate queries when address changes", async () => {
      const invalidateQueriesSpy = vi.spyOn(queryClient, "invalidateQueries");

      renderComponent();

      fireEvent.click(screen.getByTestId("change-address"));

      await waitFor(() => {
        expect(invalidateQueriesSpy).toHaveBeenCalled();
      });
    });
  });

  describe("designer button", () => {
    it("should open designer URL when clicked", async () => {
      renderComponent();

      fireEvent.click(
        screen.getByRole("button", { name: "settings.designer" }),
      );

      expect(mockBrowserOpen).toHaveBeenCalledWith({
        url: "https://design.zaparoo.org",
      });
    });
  });

  describe("online account", () => {
    it("should show login button when not logged in", () => {
      renderComponent();

      expect(
        screen.getByRole("button", { name: "online.settingsLogInButton" }),
      ).toBeInTheDocument();
    });

    it("should show manage button and email when logged in", () => {
      mockUseStatusStore.mockImplementation((selector) =>
        selector({
          ...defaultStoreState,
          loggedInUser: { email: "test@example.com" },
        }),
      );

      renderComponent();

      expect(
        screen.getByRole("button", { name: "online.settingsManageButton" }),
      ).toBeInTheDocument();
      expect(screen.getByText("test@example.com")).toBeInTheDocument();
    });
  });
});
