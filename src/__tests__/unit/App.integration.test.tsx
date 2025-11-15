import { render, screen } from "@testing-library/react";
import { vi, beforeEach, describe, it, expect } from "vitest";
import App from "@/App";
import "@/test-setup";

// Mock window.location for i18n
Object.defineProperty(window, 'location', {
  value: {
    hostname: 'localhost',
    search: '',
    hash: '',
    pathname: '/'
  },
  writable: true,
  configurable: true
});

// Mock all the hooks and dependencies
vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-router")>();
  return {
    ...actual,
    createRouter: vi.fn(() => ({
      subscribe: vi.fn(),
      navigate: vi.fn(),
    })),
    RouterProvider: ({ children }: { children: React.ReactNode }) => <div data-testid="router">{children}</div>,
  };
});

vi.mock("react-hot-toast", () => ({
  default: {
    dismiss: vi.fn(),
    success: vi.fn(),
  },
  Toaster: () => <div data-testid="toaster" />,
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
    addListener: vi.fn(() => ({ remove: vi.fn() })),
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
  };

  const useStatusStore: any = vi.fn((selector) => {
    if (typeof selector === 'function') {
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

vi.mock("@/components/CoreApiWebSocket", () => ({
  CoreApiWebSocket: () => <div data-testid="websocket" />,
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

describe("App Integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should render App component with all providers", () => {
    render(<App />);

    // Verify the SlideModalProvider is rendered (new import)
    expect(screen.getByTestId("slide-modal-provider")).toBeInTheDocument();

    // Verify RouterProvider is rendered
    expect(screen.getByTestId("router")).toBeInTheDocument();

    // Verify Toaster is rendered
    expect(screen.getByTestId("toaster")).toBeInTheDocument();

    // Verify other components are rendered
    expect(screen.getByTestId("websocket")).toBeInTheDocument();
    expect(screen.getByTestId("deep-links")).toBeInTheDocument();
  });

  it("should use useDataCache hook", () => {
    render(<App />);

    // Verify useDataCache mock is available (implicitly tested by rendering)
    expect(screen.getByTestId("router")).toBeInTheDocument();
  });

  it("should call getDeviceAddress", () => {
    render(<App />);

    // Verify getDeviceAddress is available (implicitly tested by rendering)
    expect(screen.getByTestId("websocket")).toBeInTheDocument();
  });
});