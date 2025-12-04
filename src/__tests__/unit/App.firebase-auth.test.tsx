import { render, waitFor, act } from "@testing-library/react";
import { vi, beforeEach, describe, it, expect } from "vitest";
import React from "react";
import "@/test-setup";

// Store mock functions
const mockSetLoggedInUser = vi.fn();
const mockGetIdToken = vi.fn();
const mockAddListener = vi.fn();
const mockRemove = vi.fn();

// Mock all dependencies
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
  default: { dismiss: vi.fn(), success: vi.fn() },
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

vi.mock("@capacitor-firebase/authentication", () => ({
  FirebaseAuthentication: {
    addListener: (...args: unknown[]) => mockAddListener(...args),
    getIdToken: () => mockGetIdToken(),
  },
}));

vi.mock("@/lib/store", () => {
  const useStatusStore: any = vi.fn((selector) => {
    const mockState = {
      connectionState: "CONNECTED",
      gamesIndex: { exists: true, indexing: false, totalFiles: 0 },
      mediaActiveUpdate: null,
      runQueue: null,
      setRunQueue: vi.fn(),
      writeQueue: null,
      setWriteQueue: vi.fn(),
      setLastToken: vi.fn(),
      setProPurchaseModalOpen: vi.fn(),
      setLoggedInUser: mockSetLoggedInUser,
      connected: true,
      playing: { mediaName: "", systemId: "", mediaPath: "" },
      safeInsets: { top: "0px", bottom: "0px", left: "0px", right: "0px" },
    };
    if (typeof selector === "function") {
      return selector(mockState);
    }
    return mockState;
  });

  useStatusStore.getState = () => ({
    playing: { mediaName: "", systemId: "", mediaPath: "" },
    gamesIndex: { exists: true, indexing: false, totalFiles: 0 },
    safeInsets: { top: "0px", bottom: "0px", left: "0px", right: "0px" },
  });

  return { useStatusStore };
});

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

vi.mock("@/hooks/useDataCache", () => ({
  useDataCache: vi.fn(() => ({})),
}));

vi.mock("@/lib/coreApi", () => ({
  getDeviceAddress: vi.fn(() => "192.168.1.100"),
  coreApi: { addListener: vi.fn(() => ({ remove: vi.fn() })) },
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

// Mock window.location
Object.defineProperty(window, "location", {
  value: { hostname: "localhost", search: "", hash: "", pathname: "/" },
  writable: true,
  configurable: true,
});

describe("Firebase Auth Integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAddListener.mockImplementation(() =>
      Promise.resolve({ remove: mockRemove }),
    );
    mockGetIdToken.mockResolvedValue({ token: "mock-token" });
  });

  it("should register authStateChange listener on mount", async () => {
    const App = (await import("@/App")).default;
    render(<App />);

    await waitFor(() => {
      expect(mockAddListener).toHaveBeenCalledWith(
        "authStateChange",
        expect.any(Function),
      );
    });
  });

  it("should set logged in user when auth state changes with user", async () => {
    let authCallback: ((change: { user: unknown }) => void) | null = null;
    mockAddListener.mockImplementation(
      (_event: string, callback: (change: { user: unknown }) => void) => {
        authCallback = callback;
        return Promise.resolve({ remove: mockRemove });
      },
    );

    const App = (await import("@/App")).default;
    render(<App />);

    await waitFor(() => {
      expect(authCallback).not.toBeNull();
    });

    // Trigger auth state change with a user
    const mockUser = { uid: "123", email: "test@example.com" };
    await act(async () => {
      authCallback!({ user: mockUser });
    });

    expect(mockSetLoggedInUser).toHaveBeenCalledWith(mockUser);
    expect(mockGetIdToken).toHaveBeenCalled();
  });

  it("should set logged in user to null when auth state changes without user", async () => {
    let authCallback: ((change: { user: unknown }) => void) | null = null;
    mockAddListener.mockImplementation(
      (_event: string, callback: (change: { user: unknown }) => void) => {
        authCallback = callback;
        return Promise.resolve({ remove: mockRemove });
      },
    );

    const App = (await import("@/App")).default;
    render(<App />);

    await waitFor(() => {
      expect(authCallback).not.toBeNull();
    });

    // Trigger auth state change without a user
    await act(async () => {
      authCallback!({ user: null });
    });

    expect(mockSetLoggedInUser).toHaveBeenCalledWith(null);
    // getIdToken should NOT be called when user is null
    expect(mockGetIdToken).not.toHaveBeenCalled();
  });

  it("should handle getIdToken failure gracefully", async () => {
    let authCallback: ((change: { user: unknown }) => void) | null = null;
    mockAddListener.mockImplementation(
      (_event: string, callback: (change: { user: unknown }) => void) => {
        authCallback = callback;
        return Promise.resolve({ remove: mockRemove });
      },
    );
    mockGetIdToken.mockRejectedValue(new Error("Token refresh failed"));

    const App = (await import("@/App")).default;
    render(<App />);

    await waitFor(() => {
      expect(authCallback).not.toBeNull();
    });

    // Trigger auth state change with a user - should not throw
    const mockUser = { uid: "123", email: "test@example.com" };
    await act(async () => {
      authCallback!({ user: mockUser });
    });

    expect(mockSetLoggedInUser).toHaveBeenCalledWith(mockUser);
    expect(mockGetIdToken).toHaveBeenCalled();
    // Component should still be rendered without error
  });

  it("should cleanup listener on unmount", async () => {
    const App = (await import("@/App")).default;
    const { unmount } = render(<App />);

    await waitFor(() => {
      expect(mockAddListener).toHaveBeenCalled();
    });

    unmount();

    // Give time for cleanup
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    expect(mockRemove).toHaveBeenCalled();
  });
});
