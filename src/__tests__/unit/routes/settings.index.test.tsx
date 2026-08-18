import userEvent from "@testing-library/user-event";
import type { ComponentType } from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  within,
} from "../../../test-utils";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { deviceRegistry } from "@/lib/devices/deviceRegistry";
import { usePurchasePreviewStore } from "@/lib/purchasePreviewStore";

// Mock CoreAPI
vi.mock("@/lib/coreApi", () => ({
  CoreAPI: {
    reset: vi.fn(),
  },
  validateDeviceAddress: vi.fn((address: string) => {
    if (address.includes("286")) {
      return {
        ok: false,
        errorKey: "settings.deviceAddressInvalid",
        message: "Invalid device address",
      };
    }

    return {
      ok: true,
      address,
      host: address.split(":")[0] ?? address,
      port: 7497,
      wsUrl: `ws://${address}/api/v0.1`,
    };
  }),
}));

// Mock stores
const mockUseStatusStore = vi.fn();
const mockUsePreferencesStore = vi.fn();

vi.mock("@/lib/store", async (importOriginal) => {
  const actual = (await importOriginal()) as any;
  return {
    ...actual,
    useStatusStore: (selector: any) => mockUseStatusStore(selector),
  };
});

// Mock router - use vi.hoisted to make variables accessible in mocks
const { componentRef, mockBrowserOpen, mockRouterNavigate } = vi.hoisted(
  () => ({
    componentRef: { current: null as ComponentType | null },
    mockBrowserOpen: vi.fn(),
    mockRouterNavigate: vi.fn(),
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
    Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
      <a href={to} data-testid={`link-${to.replace(/\//g, "-")}`}>
        {children}
      </a>
    ),
    useRouter: () => ({ navigate: mockRouterNavigate }),
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
  usePreferencesStore: (selector: (state: unknown) => unknown) =>
    mockUsePreferencesStore(selector),
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
  MediaDatabaseCard: ({
    onViewScrapeDetails,
  }: {
    onViewScrapeDetails?: () => void;
  }) => (
    <div data-testid="media-database-card">
      Media Database Card
      <button onClick={onViewScrapeDetails}>View scrape details</button>
    </div>
  ),
}));

vi.mock("@/components/DeviceConnectionCard", () => ({
  DeviceConnectionCard: ({
    address,
    setAddress,
    onScanClick,
    onAddressChange,
    addressError,
  }: {
    address: string;
    setAddress: (address: string) => void;
    onAddressChange: (address: string) => void;
    connectionError: string;
    addressError?: string;
    onScanClick: () => void;
  }) => (
    <div data-testid="device-connection-card">
      <span data-testid="address-value">{address}</span>
      {addressError && <span role="alert">{addressError}</span>}
      <button onClick={onScanClick} data-testid="scan-button">
        Scan
      </button>
      <button
        onClick={() => onAddressChange("192.168.1.200")}
        data-testid="change-address"
      >
        Change Address
      </button>
      <button
        onClick={() => onAddressChange("192.168.1.286")}
        data-testid="invalid-address"
      >
        Invalid Address
      </button>
      <button
        onClick={() => {
          setAddress("192.168.1.201");
          onAddressChange("192.168.1.201");
        }}
        data-testid="valid-address"
      >
        Valid Address
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
const getSettings = (): ComponentType => {
  const Settings = componentRef.current;
  if (!Settings) {
    throw new Error("Settings route component was not captured");
  }
  return Settings;
};

describe("Settings Index Route", () => {
  let queryClient: QueryClient;

  const defaultStoreState = {
    connectionError: "",
    loggedInUser: null,
    resetConnectionState: vi.fn(),
    safeInsets: { top: "0px", bottom: "0px", left: "0px", right: "0px" },
    inboxMessages: [],
    setInboxModalOpen: vi.fn(),
    coreVersion: null as string | null,
    coreVersionPending: false,
    scrapingStatus: null,
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
    mockUsePreferencesStore.mockImplementation((selector) =>
      selector({
        onlinePremiumAccess: false,
      }),
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

    it("should open Manage Media from scrape details", async () => {
      const user = userEvent.setup();
      renderComponent();

      await user.click(
        screen.getByRole("button", { name: "View scrape details" }),
      );

      expect(mockRouterNavigate).toHaveBeenCalledWith({
        to: "/settings/media",
      });
    });

    it("should render navigation links to settings subpages", () => {
      renderComponent();
      expect(
        screen.getByRole("link", { name: "settings.languageRegion.title" }),
      ).toHaveAttribute("href", "/settings/language-region");
      expect(
        screen.getByText("settings.readers.title").closest("a"),
      ).toHaveAttribute("href", "/settings/readers");
      expect(
        screen.getByText("settings.playControls.title").closest("a"),
      ).toHaveAttribute("href", "/settings/play-controls");
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

    it("should show manage media row for supported Core versions", () => {
      mockUseStatusStore.mockImplementation((selector) =>
        selector({
          ...defaultStoreState,
          coreVersion: "2.12.0",
          coreVersionPending: false,
        }),
      );

      renderComponent();

      expect(
        screen.getByRole("link", { name: "settings.media.title" }),
      ).toHaveAttribute("href", "/settings/media");
    });

    it("should not show a spinner on the manage media row while scraping", () => {
      mockUseStatusStore.mockImplementation((selector) =>
        selector({
          ...defaultStoreState,
          coreVersion: "2.12.0",
          coreVersionPending: false,
          scrapingStatus: {
            processed: 0,
            total: 0,
            matched: 0,
            skipped: 0,
            totalScraped: 0,
            scraping: true,
            done: false,
            paused: false,
          },
        }),
      );

      renderComponent();

      const mediaLink = screen.getByRole("link", {
        name: "settings.media.title",
      });
      expect(within(mediaLink).queryByRole("status")).not.toBeInTheDocument();
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

      mockUseStatusStore.mockImplementation((selector) =>
        selector({
          ...defaultStoreState,
          resetConnectionState: mockResetConnectionState,
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

    it("should show validation message and not select invalid address", async () => {
      const mockResetConnectionState = vi.fn();

      mockUseStatusStore.mockImplementation((selector) =>
        selector({
          ...defaultStoreState,
          resetConnectionState: mockResetConnectionState,
        }),
      );

      renderComponent();

      fireEvent.click(screen.getByTestId("invalid-address"));

      expect(
        await screen.findByText("settings.deviceAddressInvalid"),
      ).toBeInTheDocument();
      expect(mockResetConnectionState).not.toHaveBeenCalled();
      // An address that fails validation must not reach the registry — a record
      // written here would outlive the error message.
      expect(deviceRegistry.getSnapshot().records).toEqual({});
    });

    it("should clear validation message after a valid address", async () => {
      renderComponent();

      fireEvent.click(screen.getByTestId("invalid-address"));
      expect(
        await screen.findByText("settings.deviceAddressInvalid"),
      ).toBeInTheDocument();

      fireEvent.click(screen.getByTestId("valid-address"));

      await waitFor(() => {
        expect(
          screen.queryByText("settings.deviceAddressInvalid"),
        ).not.toBeInTheDocument();
      });
      expect(screen.getByTestId("address-value")).toHaveTextContent(
        "192.168.1.201",
      );
    });
  });

  describe("online account", () => {
    it("should show signed-out status in the Online navigation row", () => {
      renderComponent();

      const onlineLink = screen.getByRole("link", { name: /online\.title/ });
      expect(onlineLink).toHaveTextContent("online.settingsStatusSignedOut");
    });

    it("should show free account status without duplicating email", () => {
      mockUseStatusStore.mockImplementation((selector) =>
        selector({
          ...defaultStoreState,
          loggedInUser: { email: "test@example.com" },
        }),
      );

      renderComponent();

      const onlineLink = screen.getByRole("link", { name: /online\.title/ });
      expect(onlineLink).toHaveTextContent("online.settingsStatusFree");
      expect(screen.queryByText("test@example.com")).not.toBeInTheDocument();
    });

    it("should show neutral signed-in status while subscription loads", async () => {
      const { Capacitor } = await import("@capacitor/core");
      vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);
      mockUseStatusStore.mockImplementation((selector) =>
        selector({
          ...defaultStoreState,
          loggedInUser: { email: "test@example.com" },
        }),
      );
      mockUsePreferencesStore.mockImplementation((selector) =>
        selector({ onlinePremiumAccess: null }),
      );

      renderComponent();

      const onlineLink = screen.getByRole("link", { name: /online\.title/ });
      expect(onlineLink).toHaveTextContent("online.settingsStatusSignedIn");
      expect(
        screen.queryByRole("button", { name: "scan.purchaseProAction" }),
      ).not.toBeInTheDocument();
    });

    it("should show development Pro preview on web", () => {
      usePurchasePreviewStore.getState().setPreviewState("pro");

      renderComponent();

      expect(
        screen.getByRole("button", { name: "settings.app.proActive" }),
      ).toBeDisabled();
      const onlineLink = screen.getByRole("link", { name: /online\.title/ });
      expect(onlineLink).toHaveTextContent("online.settingsStatusFree");
    });

    it("should show active Warp and suppress Pro upsell", async () => {
      const { Capacitor } = await import("@capacitor/core");
      vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);
      mockUseStatusStore.mockImplementation((selector) =>
        selector({
          ...defaultStoreState,
          loggedInUser: { email: "test@example.com" },
        }),
      );
      mockUsePreferencesStore.mockImplementation((selector) =>
        selector({ onlinePremiumAccess: true }),
      );

      renderComponent();

      const onlineLink = screen.getByRole("link", { name: /online\.title/ });
      expect(onlineLink).toHaveTextContent("online.settingsStatusWarpActive");
      expect(
        screen.queryByRole("button", { name: "scan.purchaseProAction" }),
      ).not.toBeInTheDocument();
    });
  });
});
