import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "../../../test-utils";

// Mock router - use vi.hoisted to make variables accessible in mocks
const { componentRef, mockGoBack } = vi.hoisted(() => ({
  componentRef: { current: null as any },
  mockGoBack: vi.fn(),
}));

vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual = (await importOriginal()) as any;
  return {
    ...actual,
    createFileRoute: () => (options: any) => {
      componentRef.current = options.component;
      return { options };
    },
    useRouter: () => ({ history: { back: mockGoBack } }),
  };
});

// Mock CoreAPI
const mockPlaytimeLimits = vi.fn();
const mockPlaytime = vi.fn();
const mockPlaytimeLimitsUpdate = vi.fn();
const mockSettings = vi.fn();
const mockSettingsUpdate = vi.fn();

vi.mock("@/lib/coreApi", () => ({
  CoreAPI: {
    playtimeLimits: () => mockPlaytimeLimits(),
    playtime: () => mockPlaytime(),
    playtimeLimitsUpdate: (params: any) => mockPlaytimeLimitsUpdate(params),
    settings: () => mockSettings(),
    settingsUpdate: (params: any) => mockSettingsUpdate(params),
  },
}));

// Mock store
vi.mock("@/lib/store", async (importOriginal) => {
  const actual = (await importOriginal()) as any;
  return {
    ...actual,
    useStatusStore: (selector: any) =>
      selector({
        connected: true,
        connectionState: "CONNECTED",
        safeInsets: { top: "0px", bottom: "0px", left: "0px", right: "0px" },
        gamesIndex: {
          indexing: false,
          totalSteps: 100,
          currentStep: 100,
        },
      }),
    ConnectionState: {
      IDLE: "IDLE",
      CONNECTING: "CONNECTING",
      CONNECTED: "CONNECTED",
      RECONNECTING: "RECONNECTING",
      ERROR: "ERROR",
      DISCONNECTED: "DISCONNECTED",
    },
  };
});

// Mock hooks
vi.mock("@/hooks/useSmartSwipe", () => ({
  useSmartSwipe: () => ({}),
}));

vi.mock("@/hooks/usePageHeadingFocus", () => ({
  usePageHeadingFocus: vi.fn(),
}));

// Import the route module to trigger createFileRoute which captures the component
import "@/routes/settings.play-controls";

// The component will be captured by the mock
const getPlayControlsSettings = () => componentRef.current;

describe("Settings Play Controls Route", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockPlaytimeLimits.mockResolvedValue({
      enabled: true,
      daily: "2h0m0s",
      session: "1h0m0s",
      sessionReset: "30m0s",
    });

    mockPlaytime.mockResolvedValue({
      state: "active",
      sessionDuration: "45m30s",
      sessionRemaining: "14m30s",
      dailyUsageToday: "1h30m0s",
      dailyRemaining: "30m0s",
    });

    mockPlaytimeLimitsUpdate.mockResolvedValue({});

    mockSettings.mockResolvedValue({
      runZapScript: false,
      debugLogging: false,
      errorReporting: false,
      audioScanFeedback: false,
      readersAutoDetect: false,
      readersScanMode: "tap",
      readersScanExitDelay: 0,
      readersScanIgnoreSystems: [],
      launchGuardEnabled: true,
      launchGuardTimeout: 15,
      launchGuardDelay: 0,
      launchGuardRequireConfirm: true,
    });

    mockSettingsUpdate.mockResolvedValue({});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const renderComponent = () => {
    const PlayControlsSettings = getPlayControlsSettings();
    return render(<PlayControlsSettings />);
  };

  describe("rendering", () => {
    it("should render the page title", () => {
      renderComponent();

      expect(
        screen.getByRole("heading", { name: "settings.playControls.title" }),
      ).toBeInTheDocument();
    });

    it("should render back button", () => {
      renderComponent();

      expect(screen.getByLabelText("nav.back")).toBeInTheDocument();
    });

    it("should navigate back when back button clicked", () => {
      renderComponent();

      fireEvent.click(screen.getByLabelText("nav.back"));
      expect(mockGoBack).toHaveBeenCalled();
    });
  });

  describe("enabled toggle", () => {
    it("should render the enabled toggle label", () => {
      renderComponent();

      expect(
        screen.getByText("settings.core.playtime.enabled"),
      ).toBeInTheDocument();
    });

    it("should render toggle when data loads", async () => {
      renderComponent();

      // Wait for the checkbox to appear (not loading skeleton)
      await waitFor(() => {
        expect(screen.getAllByRole("checkbox").length).toBeGreaterThan(0);
      });
    });
  });

  describe("launch guard controls", () => {
    it("should render Launch Guard controls", async () => {
      renderComponent();

      expect(
        await screen.findByText("settings.core.launchGuard.title"),
      ).toBeInTheDocument();
      expect(
        screen.getByText("settings.core.launchGuard.enabled"),
      ).toBeInTheDocument();
      expect(
        screen.getByText("settings.core.launchGuard.requireConfirm"),
      ).toBeInTheDocument();
      expect(
        screen.getByText("settings.core.launchGuard.timeout"),
      ).toBeInTheDocument();
      expect(
        screen.getByText("settings.core.launchGuard.delay"),
      ).toBeInTheDocument();
    });

    it("should call settings update when Launch Guard is toggled", async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getAllByRole("checkbox").length).toBeGreaterThanOrEqual(
          3,
        );
      });

      const launchGuardToggle = screen
        .getAllByLabelText("settings.core.launchGuard.enabled")
        .find((element) => element.tagName === "INPUT");
      expect(launchGuardToggle).toBeDefined();
      fireEvent.click(launchGuardToggle!);

      await waitFor(() => {
        expect(mockSettingsUpdate).toHaveBeenCalledWith({
          launchGuardEnabled: false,
        });
      });
    });
  });

  describe("configuration inputs", () => {
    it("should render daily limit label", () => {
      renderComponent();

      expect(
        screen.getByText("settings.core.playtime.dailyLimit"),
      ).toBeInTheDocument();
    });

    it("should render session limit label", () => {
      renderComponent();

      expect(
        screen.getByText("settings.core.playtime.sessionLimit"),
      ).toBeInTheDocument();
    });

    it("should render session reset label", () => {
      renderComponent();

      expect(
        screen.getByText("settings.core.playtime.sessionReset"),
      ).toBeInTheDocument();
    });

    it("should show reset hint text", () => {
      renderComponent();

      expect(
        screen.getByText("settings.core.playtime.neverReset"),
      ).toBeInTheDocument();
    });
  });

  describe("API interactions", () => {
    it("should call playtime limits API", async () => {
      renderComponent();

      await waitFor(() => {
        expect(mockPlaytimeLimits).toHaveBeenCalled();
      });
    });

    it("should call settings API", async () => {
      renderComponent();

      await waitFor(() => {
        expect(mockSettings).toHaveBeenCalled();
      });
    });
  });
});
