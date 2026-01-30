import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "../../../test-utils";
import { mockReaderInfo } from "../../../test-utils/factories";

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
const mockSettings = vi.fn();
const mockSettingsUpdate = vi.fn();
const mockReaders = vi.fn();

vi.mock("@/lib/coreApi", () => ({
  CoreAPI: {
    settings: () => mockSettings(),
    settingsUpdate: (params: unknown) => mockSettingsUpdate(params),
    readers: () => mockReaders(),
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

// Mock preferences store
vi.mock("@/lib/preferencesStore", () => ({
  usePreferencesStore: vi.fn((selector) => {
    const state = {
      restartScan: false,
      launchOnScan: false,
      launcherAccess: false,
      preferRemoteWriter: false,
      shakeEnabled: false,
      shakeMode: "random" as const,
      shakeZapscript: "",
      nfcAvailable: false,
      accelerometerAvailable: false,
      setRestartScan: vi.fn(),
      setLaunchOnScan: vi.fn(),
      setPreferRemoteWriter: vi.fn(),
      setShakeEnabled: vi.fn(),
      setShakeMode: vi.fn(),
      setShakeZapscript: vi.fn(),
    };
    return selector(state);
  }),
  selectAppSettings: (state: any) => state,
  selectShakeSettings: (state: any) => state,
}));

// Mock hooks
vi.mock("@/hooks/useSmartSwipe", () => ({
  useSmartSwipe: () => ({}),
}));

vi.mock("@/hooks/usePageHeadingFocus", () => ({
  usePageHeadingFocus: vi.fn(),
}));

// Mock Capacitor (not native platform for most tests)
vi.mock("@capacitor/core", () => ({
  Capacitor: {
    isNativePlatform: () => false,
    getPlatform: () => "web",
  },
}));

// Mock Pro purchase hook
vi.mock("@/components/ProPurchase", () => ({
  useProPurchase: () => ({
    PurchaseModal: () => null,
    setProPurchaseModalOpen: vi.fn(),
  }),
}));

// Import the route module to trigger createFileRoute which captures the component
import "@/routes/settings.readers";

// The component will be captured by the mock
const getReadersSettings = () => componentRef.current;

describe("Settings Readers Route", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockSettings.mockResolvedValue({
      readersScanMode: "tap",
      audioScanFeedback: true,
      readersAutoDetect: true,
    });

    mockReaders.mockResolvedValue({ readers: [] });
    mockSettingsUpdate.mockResolvedValue({});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const renderComponent = () => {
    const ReadersSettings = getReadersSettings();
    return render(<ReadersSettings />);
  };

  describe("rendering", () => {
    it("should render the page title", () => {
      renderComponent();

      expect(
        screen.getByRole("heading", { name: "settings.readers.title" }),
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

  describe("readers list", () => {
    it("should show connected readers label", () => {
      renderComponent();

      expect(
        screen.getByText("settings.readers.connectedReaders"),
      ).toBeInTheDocument();
    });

    it("should show 'no readers detected' when no readers are connected", async () => {
      mockReaders.mockResolvedValue({ readers: [] });
      renderComponent();

      await waitFor(() => {
        expect(
          screen.getByText("settings.readers.noReadersDetected"),
        ).toBeInTheDocument();
      });
    });

    it("should display connected reader", async () => {
      const reader = mockReaderInfo({
        id: "pn532_1",
        info: "PN532 NFC Reader",
        connected: true,
      });
      mockReaders.mockResolvedValue({ readers: [reader] });
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText("PN532 NFC Reader")).toBeInTheDocument();
      });
    });

    it("should display multiple readers", async () => {
      const readers = [
        mockReaderInfo({
          id: "pn532_1",
          info: "PN532 NFC Reader",
          connected: true,
        }),
        mockReaderInfo({
          id: "acr122u_1",
          info: "ACR122U USB Reader",
          connected: true,
        }),
      ];
      mockReaders.mockResolvedValue({ readers });
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText("PN532 NFC Reader")).toBeInTheDocument();
        expect(screen.getByText("ACR122U USB Reader")).toBeInTheDocument();
      });
    });

    it("should fallback to reader id when info is empty", async () => {
      const reader = mockReaderInfo({
        id: "simple_serial_1",
        info: "",
        connected: true,
      });
      mockReaders.mockResolvedValue({ readers: [reader] });
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText("simple_serial_1")).toBeInTheDocument();
      });
    });
  });

  describe("scan mode", () => {
    it("should render scan mode section", () => {
      renderComponent();

      expect(screen.getByText("settings.readers.scanMode")).toBeInTheDocument();
    });

    it("should render tap and hold mode buttons", async () => {
      renderComponent();

      await waitFor(() => {
        expect(
          screen.getByRole("radio", { name: /settings.tapMode/i }),
        ).toBeInTheDocument();
        expect(
          screen.getByRole("radio", { name: /settings.insertMode/i }),
        ).toBeInTheDocument();
      });
    });

    it("should show tap mode as selected when set", async () => {
      mockSettings.mockResolvedValue({
        readersScanMode: "tap",
        audioScanFeedback: true,
        readersAutoDetect: true,
      });
      renderComponent();

      await waitFor(() => {
        const tapButton = screen.getByRole("radio", {
          name: /settings.tapMode/i,
        });
        expect(tapButton).toHaveAttribute("aria-checked", "true");
      });
    });

    it("should show hold mode as selected when set", async () => {
      mockSettings.mockResolvedValue({
        readersScanMode: "hold",
        audioScanFeedback: true,
        readersAutoDetect: true,
      });
      renderComponent();

      await waitFor(() => {
        const holdButton = screen.getByRole("radio", {
          name: /settings.insertMode/i,
        });
        expect(holdButton).toHaveAttribute("aria-checked", "true");
      });
    });

    it("should call settings update when changing mode to hold", async () => {
      renderComponent();

      // Wait for buttons to be available
      await waitFor(() => {
        expect(
          screen.getByRole("radio", { name: /settings.insertMode/i }),
        ).toBeInTheDocument();
      });

      const holdButton = screen.getByRole("radio", {
        name: /settings.insertMode/i,
      });
      fireEvent.click(holdButton);

      expect(mockSettingsUpdate).toHaveBeenCalledWith({
        readersScanMode: "hold",
      });
    });
  });

  describe("core settings toggles", () => {
    it("should render audio feedback toggle", () => {
      renderComponent();

      expect(
        screen.getByText("settings.readers.audioFeedback"),
      ).toBeInTheDocument();
    });

    it("should render auto-detect readers toggle", () => {
      renderComponent();

      expect(
        screen.getByText("settings.readers.autoDetectReaders"),
      ).toBeInTheDocument();
    });
  });

  describe("app settings toggles", () => {
    it("should render continuous scan toggle", () => {
      renderComponent();

      expect(
        screen.getByText("settings.readers.continuousScan"),
      ).toBeInTheDocument();
    });
  });
});
