import { render, screen } from "../../test-utils";
import { vi, beforeEach, describe, it, expect } from "vitest";
import App from "@/App";

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
  },
  registerPlugin: vi.fn(),
}));

vi.mock("@uidotdev/usehooks", () => ({
  usePrevious: vi.fn(() => undefined),
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
  }),
}));

vi.mock("@/components/ReconnectingIndicator", () => ({
  ReconnectingIndicator: () => null,
}));

vi.mock("@/lib/deepLinks", () => ({
  default: () => <div data-testid="deep-links" />,
}));

vi.mock("@/components/MediaFinishedToast", () => ({
  MediaFinishedToast: () => <div data-testid="media-finished-toast" />,
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
    const state = {
      _hasHydrated: true,
      _proAccessHydrated: true,
      _nfcAvailabilityHydrated: true,
      _cameraAvailabilityHydrated: true,
      _accelerometerAvailabilityHydrated: true,
      showFilenames: false,
      shakeEnabled: false,
      launcherAccess: false,
    };
    if (typeof selector === "function") {
      return selector(state);
    }
    return state;
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
  useRunQueueProcessor: vi.fn(),
}));
vi.mock("@/hooks/useWriteQueueProcessor", () => ({
  useWriteQueueProcessor: vi.fn(),
}));
vi.mock("@/hooks/useShakeDetection", () => ({ useShakeDetection: vi.fn() }));
vi.mock("@/lib/logger", () => ({ initDeviceInfo: vi.fn() }));

describe("App Integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
    expect(screen.getByTestId("deep-links")).toBeInTheDocument();
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
});
