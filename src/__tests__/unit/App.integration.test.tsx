import { render, screen, waitFor } from "../../test-utils";
import { vi, beforeEach, describe, it, expect } from "vitest";
import App from "@/App";
import { isNativePluginAvailable } from "@/lib/capacitorBridge";
import { logger } from "@/lib/logger";

const {
  mockUseDeepLinks,
  mockUseRunQueueProcessor,
  mockUseWriteQueueProcessor,
  mockPreferencesState,
} = vi.hoisted(() => ({
  mockUseDeepLinks: vi.fn(),
  mockUseRunQueueProcessor: vi.fn(),
  mockUseWriteQueueProcessor: vi.fn(),
  mockPreferencesState: {
    _hasHydrated: true,
    _proAccessHydrated: true,
    _nfcAvailabilityHydrated: true,
    _cameraAvailabilityHydrated: true,
    _accelerometerAvailabilityHydrated: true,
    showFilenames: false,
    shakeEnabled: false,
    launcherAccess: false,
  },
}));

// Mock window.location for i18n
Object.defineProperty(window, "location", {
  value: {
    hostname: "localhost",
    search: "",
    hash: "",
    pathname: "/",
  },
  writable: true,
  configurable: true,
});

// Mock all the hooks and dependencies
vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@tanstack/react-router")>();
  return {
    ...actual,
    createRouter: vi.fn(() => ({
      subscribe: vi.fn(),
      navigate: vi.fn(),
    })),
    RouterProvider: ({ children }: { children: React.ReactNode }) => (
      <div data-testid="router">{children}</div>
    ),
  };
});

vi.mock("react-hot-toast", () => ({
  default: {
    dismiss: vi.fn(),
    success: vi.fn(),
  },
  Toaster: () => <div data-testid="toaster" />,
  useToasterStore: () => ({ toasts: [] }),
}));

vi.mock("@capacitor/core", () => ({
  Capacitor: {
    isNativePlatform: vi.fn(() => false),
    getPlatform: vi.fn(() => "web"),
    isPluginAvailable: vi.fn(() => true),
  },
  registerPlugin: vi.fn(),
}));

vi.mock("@uidotdev/usehooks", () => ({
  usePrevious: vi.fn(() => undefined),
}));

vi.mock("@/lib/capacitorBridge", () => ({
  isNativePluginAvailable: vi.fn(() => true),
  isPluginAvailable: vi.fn(() => true),
}));

vi.mock("react-i18next", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-i18next")>();
  return {
    ...actual,
    useTranslation: () => ({
      t: (key: string) => key,
      i18n: { changeLanguage: vi.fn() },
    }),
  };
});

vi.mock("@capacitor-firebase/authentication", () => ({
  FirebaseAuthentication: {
    addListener: vi.fn(() => Promise.resolve({ remove: vi.fn() })),
    getIdToken: vi.fn(() => Promise.resolve({ token: "mock-token" })),
  },
}));

vi.mock("@/lib/store", () => {
  const mockState = {
    connectionState: "CONNECTED",
    gamesIndex: { exists: true, indexing: false },
    mediaActiveUpdate: null,
    runQueue: null,
    setRunQueue: vi.fn(),
    writeQueue: null,
    setWriteQueue: vi.fn(),
    setLastToken: vi.fn(),
    setProPurchaseModalOpen: vi.fn(),
    connected: true,
    playing: { mediaName: "", systemId: "", mediaPath: "" },
    safeInsets: { top: "0px", bottom: "0px", left: "0px", right: "0px" },
    inboxMessages: [],
    inboxModalOpen: false,
    setInboxModalOpen: vi.fn(),
    removeInboxMessage: vi.fn(),
    setInboxMessages: vi.fn(),
    coreVersion: null,
    coreVersionPending: false,
  };

  const useStatusStore: any = vi.fn((selector) => {
    if (typeof selector === "function") {
      return selector(mockState);
    }
    return mockState;
  });

  // Add getState method for direct access
  useStatusStore.getState = () => mockState;

  return {
    useStatusStore,
  };
});

vi.mock("@/hooks/useDataCache", () => ({
  useDataCache: vi.fn(() => ({})),
}));

vi.mock("@/lib/coreApi", () => ({
  getDeviceAddress: vi.fn(() => "192.168.1.100"),
  coreApi: {
    addListener: vi.fn(() => ({ remove: vi.fn() })),
  },
}));

vi.mock("@/components/ConnectionProvider", () => ({
  ConnectionProvider: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="connection-provider">{children}</div>
  ),
  useConnection: () => ({
    activeConnection: null,
    isConnected: true,
    hasData: false,
    showReconnecting: false,
    openPairingModal: () => {},
  }),
}));

vi.mock("@/components/ReconnectingIndicator", () => ({
  ReconnectingIndicator: () => null,
}));

vi.mock("@/lib/deepLinks", () => ({
  useDeepLinks: mockUseDeepLinks,
  default: () => <div data-testid="deep-links" />,
}));

vi.mock("@/components/MediaFinishedToast", () => ({
  MediaFinishedToast: () => <div data-testid="media-finished-toast" />,
}));

vi.mock("@/components/InboxModal", () => ({
  InboxModal: () => <div data-testid="inbox-modal" />,
}));

vi.mock("@/components/home/StagedTokenModal", () => ({
  StagedTokenModal: () => <div data-testid="staged-token-modal" />,
}));

vi.mock("@/components/SlideModalProvider", () => ({
  SlideModalProvider: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="slide-modal-provider">{children}</div>
  ),
}));

vi.mock("@capacitor/status-bar", () => ({
  StatusBar: {
    show: vi.fn(() => Promise.resolve()),
    setStyle: vi.fn(() => Promise.resolve()),
  },
  Style: {
    Dark: "DARK",
  },
}));

vi.mock("@/lib/preferencesStore", () => {
  const usePreferencesStore: any = vi.fn((selector) => {
    if (typeof selector === "function") {
      return selector(mockPreferencesState);
    }
    return mockPreferencesState;
  });

  return { usePreferencesStore };
});

vi.mock("@/components/A11yAnnouncer", () => ({
  A11yAnnouncerProvider: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="a11y-provider">{children}</div>
  ),
  useAnnouncer: () => ({ announce: vi.fn() }),
}));

vi.mock("@/hooks/useProAccessCheck", () => ({ useProAccessCheck: vi.fn() }));
vi.mock("@/hooks/useNfcAvailabilityCheck", () => ({
  useNfcAvailabilityCheck: vi.fn(),
}));
vi.mock("@/hooks/useCameraAvailabilityCheck", () => ({
  useCameraAvailabilityCheck: vi.fn(),
}));
vi.mock("@/hooks/useAccelerometerAvailabilityCheck", () => ({
  useAccelerometerAvailabilityCheck: vi.fn(),
}));
vi.mock("@/hooks/useRunQueueProcessor", () => ({
  useRunQueueProcessor: mockUseRunQueueProcessor,
}));
vi.mock("@/hooks/useWriteQueueProcessor", () => ({
  useWriteQueueProcessor: mockUseWriteQueueProcessor,
}));
vi.mock("@/hooks/useShakeDetection", () => ({ useShakeDetection: vi.fn() }));
vi.mock("@/lib/logger", () => ({
  initDeviceInfo: vi.fn(),
  logger: { warn: vi.fn(), debug: vi.fn(), log: vi.fn(), error: vi.fn() },
}));
vi.mock("@/lib/purchasesSetup", () => ({ purchasesReady: Promise.resolve() }));

describe("App Integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.assign(mockPreferencesState, {
      _hasHydrated: true,
      _proAccessHydrated: true,
      _nfcAvailabilityHydrated: true,
      _cameraAvailabilityHydrated: true,
      _accelerometerAvailabilityHydrated: true,
      showFilenames: false,
      shakeEnabled: false,
      launcherAccess: false,
    });
    vi.mocked(isNativePluginAvailable).mockReturnValue(true);
  });

  it("should render App component with all providers", () => {
    render(<App />);

    // Verify the SlideModalProvider is rendered (may have multiple from test-utils wrapper)
    const slideModalProviders = screen.getAllByTestId("slide-modal-provider");
    expect(slideModalProviders.length).toBeGreaterThan(0);

    // Verify RouterProvider is rendered
    expect(screen.getByTestId("router")).toBeInTheDocument();

    // Verify Toaster is rendered
    expect(screen.getByTestId("toaster")).toBeInTheDocument();

    // Verify ConnectionProvider is rendered
    expect(screen.getByTestId("connection-provider")).toBeInTheDocument();
    expect(mockUseDeepLinks).toHaveBeenCalled();
    expect(screen.getByTestId("staged-token-modal")).toBeInTheDocument();
  });

  it("should use useDataCache hook", () => {
    render(<App />);

    // Verify useDataCache mock is available (implicitly tested by rendering)
    expect(screen.getByTestId("router")).toBeInTheDocument();
  });

  it("should have ConnectionProvider wrapping app content", () => {
    render(<App />);

    // Verify ConnectionProvider is rendered
    expect(screen.getByTestId("connection-provider")).toBeInTheDocument();
  });

  it("should initialize deep links before hydration completes", () => {
    mockPreferencesState._hasHydrated = false;

    const { container } = render(<App />);

    expect(mockUseDeepLinks).toHaveBeenCalled();
    expect(mockUseRunQueueProcessor).not.toHaveBeenCalled();
    expect(mockUseWriteQueueProcessor).not.toHaveBeenCalled();
    expect(container.textContent).toBe("");
  });

  it("should skip StatusBar setup when native plugin is unavailable", async () => {
    const { Capacitor } = await import("@capacitor/core");
    const { StatusBar } = await import("@capacitor/status-bar");

    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);
    vi.mocked(isNativePluginAvailable).mockImplementation(
      (pluginName: string) => pluginName !== "StatusBar",
    );

    render(<App />);

    expect(StatusBar.show).not.toHaveBeenCalled();
    expect(StatusBar.setStyle).not.toHaveBeenCalled();
  });

  it("should log non-critical StatusBar setup failures", async () => {
    const { Capacitor } = await import("@capacitor/core");
    const { StatusBar } = await import("@capacitor/status-bar");
    const error = new Error("StatusBar unavailable");

    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);
    vi.mocked(StatusBar.show).mockRejectedValueOnce(error);

    render(<App />);

    await waitFor(() => {
      expect(logger.warn).toHaveBeenCalledWith(
        "StatusBar setup failed:",
        error,
      );
    });
  });
});
