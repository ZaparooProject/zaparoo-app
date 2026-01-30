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

vi.mock("@/lib/coreApi", () => ({
  CoreAPI: {
    playtimeLimits: () => mockPlaytimeLimits(),
    playtime: () => mockPlaytime(),
    playtimeLimitsUpdate: (params: any) => mockPlaytimeLimitsUpdate(params),
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
import "@/routes/settings.playtime";

// The component will be captured by the mock
const getPlaytimeSettings = () => componentRef.current;

describe("Settings Playtime Route", () => {
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
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const renderComponent = () => {
    const PlaytimeSettings = getPlaytimeSettings();
    return render(<PlaytimeSettings />);
  };

  describe("rendering", () => {
    it("should render the page title", () => {
      renderComponent();

      expect(
        screen.getByRole("heading", { name: "settings.playtime.title" }),
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
        expect(screen.getByRole("checkbox")).toBeInTheDocument();
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
  });
});
