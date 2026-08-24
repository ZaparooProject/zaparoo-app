import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "../../../test-utils";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ConnectionState } from "@/lib/store";
import { usePurchasePreviewStore } from "@/lib/purchasePreviewStore";

// Mock CoreAPI
const mockSettings = vi.fn();
const mockSettingsUpdate = vi.fn();

vi.mock("@/lib/coreApi", () => ({
  CoreAPI: {
    settings: () => mockSettings(),
    settingsUpdate: (params: any) => mockSettingsUpdate(params),
  },
}));

// Mock stores
const mockUseStatusStore = vi.fn();
const mockUsePreferencesStore = vi.fn();
const { mockIsNativePluginAvailable, mockIsNativePlatform, mockGetPlatform } =
  vi.hoisted(() => ({
    mockIsNativePluginAvailable: vi.fn(),
    mockIsNativePlatform: vi.fn(),
    mockGetPlatform: vi.fn(),
  }));

vi.mock("@/lib/store", async (importOriginal) => {
  const actual = (await importOriginal()) as any;
  return {
    ...actual,
    useStatusStore: (selector: any) => mockUseStatusStore(selector),
  };
});

vi.mock("@/lib/preferencesStore", () => ({
  usePreferencesStore: (selector: any) => mockUsePreferencesStore(selector),
}));

vi.mock("@/lib/capacitorBridge", () => ({
  isNativePluginAvailable: (pluginName: string) =>
    mockIsNativePlatform() && mockIsNativePluginAvailable(pluginName),
}));

// Mock router - use vi.hoisted to make variables accessible in mocks
const { mockNavigate, componentRef } = vi.hoisted(() => ({
  mockNavigate: vi.fn(),
  componentRef: { current: null as any },
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
    Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
      <a href={to} data-testid="link">
        {children}
      </a>
    ),
  };
});

// Mock hooks
vi.mock("@/hooks/useSmartSwipe", () => ({
  useSmartSwipe: () => ({}),
}));

vi.mock("@/hooks/usePageHeadingFocus", () => ({
  usePageHeadingFocus: vi.fn(),
}));

// Mock Capacitor
vi.mock("@capacitor/core", () => ({
  Capacitor: {
    isNativePlatform: mockIsNativePlatform,
    getPlatform: mockGetPlatform,
  },
}));

// Mock ProPurchase — this route only needs to know full emergency purchase
// support is rendered natively; purchase logic itself is tested elsewhere.
vi.mock("@/components/ProPurchase", () => ({
  PurchaseSupportActions: ({ variant }: { variant?: string }) => (
    <div data-testid="purchase-support-actions" data-variant={variant}>
      Purchase support
    </div>
  ),
}));

// Import the route module to trigger createFileRoute which captures the component
import "@/routes/settings.advanced";

// The component will be captured by the mock
const getAdvancedSettings = () => componentRef.current;

describe("Settings Advanced Route", () => {
  let queryClient: QueryClient;

  const defaultStoreState = {
    connected: true,
    connectionState: ConnectionState.CONNECTED,
    currentClient: {
      paired: true,
      role: "admin",
      capabilities: ["settings.write"],
    },
    safeInsets: { top: "0px", bottom: "0px", left: "0px", right: "0px" },
  };

  const defaultPreferencesState = {
    showFilenames: false,
    setShowFilenames: vi.fn(),
    appBadgeEnabled: true,
    setAppBadgeEnabled: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });

    // Default mock implementations
    mockSettings.mockResolvedValue({
      debugLogging: false,
      errorReporting: false,
      audioScanFeedback: true,
      readersAutoDetect: false,
    });
    mockSettingsUpdate.mockResolvedValue({});
    mockIsNativePluginAvailable.mockReturnValue(false);
    mockIsNativePlatform.mockReturnValue(false);
    mockGetPlatform.mockReturnValue("web");

    mockUseStatusStore.mockImplementation((selector) =>
      selector(defaultStoreState),
    );
    mockUsePreferencesStore.mockImplementation((selector) =>
      selector(defaultPreferencesState),
    );
  });

  afterEach(() => {
    queryClient.clear();
  });

  const renderComponent = () => {
    const AdvancedSettings = getAdvancedSettings();
    return render(
      <QueryClientProvider client={queryClient}>
        <AdvancedSettings />
      </QueryClientProvider>,
    );
  };

  describe("rendering", () => {
    it("should render the page title", async () => {
      renderComponent();

      await waitFor(() => {
        expect(
          screen.getByRole("heading", { name: "settings.advanced.title" }),
        ).toBeInTheDocument();
      });
    });

    it("should render error reporting toggle", async () => {
      renderComponent();

      await waitFor(() => {
        expect(
          screen.getByRole("checkbox", {
            name: "settings.advanced.errorReporting",
          }),
        ).toBeInTheDocument();
      });
    });

    it("should render debug logging toggle", async () => {
      renderComponent();

      await waitFor(() => {
        expect(
          screen.getByRole("checkbox", {
            name: "settings.advanced.debugLogging",
          }),
        ).toBeInTheDocument();
      });
    });

    it("should render show filenames toggle", async () => {
      renderComponent();

      await waitFor(() => {
        expect(
          screen.getByRole("checkbox", {
            name: "settings.advanced.showFilenames",
          }),
        ).toBeInTheDocument();
      });
    });

    it("should render view logs link when connected", async () => {
      renderComponent();

      await waitFor(() => {
        expect(
          screen.getByText("settings.advanced.viewLogs"),
        ).toBeInTheDocument();
      });
    });

    it("should show emergency billing support actions natively", () => {
      mockIsNativePlatform.mockReturnValue(true);
      mockGetPlatform.mockReturnValue("android");

      renderComponent();

      expect(
        screen.getByTestId("purchase-support-actions"),
      ).not.toHaveAttribute("data-variant");
    });

    it("should hide purchase support actions on web", () => {
      renderComponent();

      expect(
        screen.queryByTestId("purchase-support-actions"),
      ).not.toBeInTheDocument();
    });

    it("should update development purchase preview state", async () => {
      const user = userEvent.setup();
      renderComponent();

      await user.selectOptions(
        screen.getByRole("combobox", {
          name: "settings.advanced.purchasePreview",
        }),
        "pro",
      );

      expect(usePurchasePreviewStore.getState().state).toBe("pro");
    });
  });

  describe("settings data loading", () => {
    it("should call CoreAPI.settings on mount", async () => {
      renderComponent();

      await waitFor(() => {
        expect(mockSettings).toHaveBeenCalled();
      });
    });

    it("should display debug logging value from API", async () => {
      mockSettings.mockResolvedValue({ debugLogging: true });

      renderComponent();

      await waitFor(() => {
        const checkbox = screen.getByRole("checkbox", {
          name: /settings.advanced.debugLogging/i,
        });
        expect(checkbox).toBeChecked();
      });
    });
  });

  describe("settings updates", () => {
    it("should call settingsUpdate when debug logging is toggled", async () => {
      mockSettings.mockResolvedValue({
        debugLogging: false,
        errorReporting: false,
      });

      renderComponent();

      // Wait for loading to complete (checkboxes to appear)
      await waitFor(() => {
        const checkboxes = screen.getAllByRole("checkbox");
        expect(checkboxes.length).toBeGreaterThanOrEqual(3);
      });

      // Get the second checkbox (debug logging toggle - after error reporting)
      const checkboxes = screen.getAllByRole("checkbox");
      const debugLoggingCheckbox = checkboxes[1]!;
      fireEvent.click(debugLoggingCheckbox);

      await waitFor(() => {
        expect(mockSettingsUpdate).toHaveBeenCalledWith({ debugLogging: true });
      });
    });

    it("should disable Core settings for a member client", async () => {
      mockUseStatusStore.mockImplementation((selector) =>
        selector({
          ...defaultStoreState,
          currentClient: {
            paired: true,
            role: "member",
            capabilities: [],
          },
        }),
      );

      renderComponent();

      const errorReporting = await screen.findByRole("checkbox", {
        name: /settings.advanced.errorReporting/i,
      });
      const debugLogging = screen.getByRole("checkbox", {
        name: /settings.advanced.debugLogging/i,
      });
      const showFilenames = screen.getByRole("checkbox", {
        name: /settings.advanced.showFilenames/i,
      });

      expect(errorReporting).toBeDisabled();
      expect(debugLogging).toBeDisabled();
      expect(showFilenames).toBeEnabled();
    });

    it("should update app icon badge preference on iOS", async () => {
      const user = userEvent.setup();
      const setAppBadgeEnabled = vi.fn();
      mockIsNativePlatform.mockReturnValue(true);
      mockGetPlatform.mockReturnValue("ios");
      mockIsNativePluginAvailable.mockImplementation(
        (pluginName: string) => pluginName === "Badge",
      );
      mockUsePreferencesStore.mockImplementation((selector) =>
        selector({
          ...defaultPreferencesState,
          setAppBadgeEnabled,
        }),
      );

      renderComponent();

      const appBadgeToggle = await screen.findByRole("checkbox", {
        name: /settings.advanced.appIconBadges/i,
      });
      await user.click(appBadgeToggle);

      expect(setAppBadgeEnabled).toHaveBeenCalledWith(false);
    });

    it("should hide the app icon badge preference on Android", () => {
      mockIsNativePlatform.mockReturnValue(true);
      mockGetPlatform.mockReturnValue("android");
      mockIsNativePluginAvailable.mockImplementation(
        (pluginName: string) => pluginName === "Badge",
      );

      renderComponent();

      expect(
        screen.queryByRole("checkbox", {
          name: /settings.advanced.appIconBadges/i,
        }),
      ).not.toBeInTheDocument();
    });

    it("should call setShowFilenames when show filenames is toggled", async () => {
      const mockSetShowFilenames = vi.fn();
      mockUsePreferencesStore.mockImplementation((selector) =>
        selector({
          showFilenames: false,
          setShowFilenames: mockSetShowFilenames,
        }),
      );

      renderComponent();

      // Wait for loading to complete (all checkboxes to appear)
      await waitFor(() => {
        const checkboxes = screen.getAllByRole("checkbox");
        expect(checkboxes.length).toBeGreaterThanOrEqual(3);
      });

      // Get the third checkbox (show filenames toggle - after error reporting and debug logging)
      const checkboxes = screen.getAllByRole("checkbox");
      const showFilenamesCheckbox = checkboxes[2]!;
      fireEvent.click(showFilenamesCheckbox);

      expect(mockSetShowFilenames).toHaveBeenCalledWith(true);
    });
  });

  describe("error reporting", () => {
    it("should show confirmation modal when enabling error reporting", async () => {
      const user = userEvent.setup();
      mockSettings.mockResolvedValue({
        debugLogging: false,
        errorReporting: false,
      });

      renderComponent();

      const toggle = await screen.findByRole("checkbox", {
        name: /settings.advanced.errorReporting/i,
      });
      await user.click(toggle);

      // Modal should appear
      await waitFor(() => {
        expect(
          screen.getAllByText("settings.advanced.errorReportingConfirmTitle")
            .length,
        ).toBeGreaterThan(0);
        expect(
          screen.getByText("settings.advanced.errorReportingConfirmText"),
        ).toBeInTheDocument();
      });
    });

    it("should enable error reporting when confirmed", async () => {
      const user = userEvent.setup();
      mockSettings.mockResolvedValue({
        debugLogging: false,
        errorReporting: false,
      });

      renderComponent();

      const toggle = await screen.findByRole("checkbox", {
        name: /settings.advanced.errorReporting/i,
      });
      await user.click(toggle);

      // Wait for modal and click confirm
      const confirmButton = await screen.findByText("yes");
      await user.click(confirmButton);

      await waitFor(() => {
        expect(mockSettingsUpdate).toHaveBeenCalledWith({
          errorReporting: true,
        });
      });
    });

    it("should not enable error reporting when cancelled", async () => {
      const user = userEvent.setup();
      mockSettings.mockResolvedValue({
        debugLogging: false,
        errorReporting: false,
      });

      renderComponent();

      const toggle = await screen.findByRole("checkbox", {
        name: /settings.advanced.errorReporting/i,
      });
      await user.click(toggle);

      // Wait for modal and click cancel
      const cancelButton = await screen.findByText("nav.cancel");
      await user.click(cancelButton);

      // No update should be called when cancelled
      expect(mockSettingsUpdate).not.toHaveBeenCalled();
    });

    it("should disable error reporting without confirmation", async () => {
      const user = userEvent.setup();
      mockSettings.mockResolvedValue({
        debugLogging: false,
        errorReporting: true,
      });

      renderComponent();

      const toggle = await screen.findByRole("checkbox", {
        name: /settings.advanced.errorReporting/i,
      });
      await user.click(toggle);

      // Should directly call update without showing modal
      await waitFor(() => {
        expect(mockSettingsUpdate).toHaveBeenCalledWith({
          errorReporting: false,
        });
      });
    });

    it("should disable error reporting toggle when disconnected", async () => {
      mockUseStatusStore.mockImplementation((selector) =>
        selector({
          ...defaultStoreState,
          connected: false,
        }),
      );

      renderComponent();

      const toggle = await screen.findByRole("checkbox", {
        name: /settings.advanced.errorReporting/i,
      });
      expect(toggle).toBeDisabled();
    });
  });

  describe("connection state", () => {
    it("should disable debug logging toggle when disconnected", async () => {
      mockUseStatusStore.mockImplementation((selector) =>
        selector({
          ...defaultStoreState,
          connected: false,
        }),
      );

      renderComponent();

      await waitFor(() => {
        const checkbox = screen.getByRole("checkbox", {
          name: /settings.advanced.debugLogging/i,
        });
        expect(checkbox).toBeDisabled();
      });
    });

    it("should show disabled view logs when disconnected", async () => {
      mockUseStatusStore.mockImplementation((selector) =>
        selector({
          ...defaultStoreState,
          connected: false,
        }),
      );

      renderComponent();

      await waitFor(() => {
        // When disconnected, the link should not be rendered as a link
        const viewLogsText = screen.getByText("settings.advanced.viewLogs");
        expect(viewLogsText.closest("a")).toBeNull();
      });
    });
  });

  describe("navigation", () => {
    it("should navigate back when back button is clicked", async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByLabelText("nav.back")).toBeInTheDocument();
      });

      fireEvent.click(screen.getByLabelText("nav.back"));

      expect(mockNavigate).toHaveBeenCalledWith({
        to: "/settings",
        resetScroll: false,
      });
    });
  });
});
