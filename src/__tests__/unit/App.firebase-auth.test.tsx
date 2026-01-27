import { render, waitFor, act } from "@testing-library/react";
import { vi, beforeEach, describe, it, expect } from "vitest";
import React from "react";
import "@/test-setup";

// Store mock functions
const mockSetLoggedInUser = vi.fn();
const mockSetLauncherAccess = vi.fn();
const mockGetIdToken = vi.fn();
const mockAddListener = vi.fn();
const mockRemove = vi.fn();

// RevenueCat mock functions
const mockPurchasesLogIn = vi.fn();
const mockPurchasesLogOut = vi.fn();
const mockPurchasesGetCustomerInfo = vi.fn();

// Online API mock
const mockGetSubscriptionStatus = vi.fn();

// Logger mock
const mockLoggerError = vi.fn();

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

// Capacitor mock with configurable platform
let mockPlatform = "web";
vi.mock("@capacitor/core", () => ({
  Capacitor: {
    isNativePlatform: vi.fn(() => mockPlatform !== "web"),
    getPlatform: vi.fn(() => mockPlatform),
  },
  registerPlugin: vi.fn(),
}));

vi.mock("@uidotdev/usehooks", () => ({
  usePrevious: vi.fn(() => undefined),
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

vi.mock("@capacitor-firebase/authentication", () => ({
  FirebaseAuthentication: {
    addListener: (...args: unknown[]) => mockAddListener(...args),
    getIdToken: () => mockGetIdToken(),
  },
}));

vi.mock("@revenuecat/purchases-capacitor", () => ({
  Purchases: {
    logIn: (...args: unknown[]) => mockPurchasesLogIn(...args),
    logOut: () => mockPurchasesLogOut(),
    getCustomerInfo: () => mockPurchasesGetCustomerInfo(),
  },
}));

vi.mock("@/lib/onlineApi", () => ({
  getSubscriptionStatus: () => mockGetSubscriptionStatus(),
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
      setLauncherAccess: mockSetLauncherAccess,
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
vi.mock("@/hooks/usePassiveNfcListener", () => ({
  usePassiveNfcListener: vi.fn(),
}));
vi.mock("@/lib/logger", () => ({
  initDeviceInfo: vi.fn(),
  logger: { error: mockLoggerError },
}));

// Mock window.location
Object.defineProperty(window, "location", {
  value: { hostname: "localhost", search: "", hash: "", pathname: "/" },
  writable: true,
  configurable: true,
});

describe("Firebase Auth Integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPlatform = "web"; // Default to web platform
    mockAddListener.mockImplementation(() =>
      Promise.resolve({ remove: mockRemove }),
    );
    mockGetIdToken.mockResolvedValue({ token: "mock-token" });

    // Default RevenueCat mocks
    mockPurchasesLogIn.mockResolvedValue({
      customerInfo: { entitlements: { active: {} } },
    });
    mockPurchasesLogOut.mockResolvedValue(undefined);
    mockPurchasesGetCustomerInfo.mockResolvedValue({
      customerInfo: { entitlements: { active: {} } },
    });

    // Default online API mock
    mockGetSubscriptionStatus.mockResolvedValue({ is_premium: false });
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

  describe("RevenueCat sync", () => {
    it("should skip RevenueCat calls on web platform", async () => {
      mockPlatform = "web";

      let authCallback: ((change: { user: unknown }) => Promise<void>) | null =
        null;
      mockAddListener.mockImplementation(
        (
          _event: string,
          callback: (change: { user: unknown }) => Promise<void>,
        ) => {
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
        await authCallback!({ user: mockUser });
      });

      // RevenueCat should NOT be called on web
      expect(mockPurchasesLogIn).not.toHaveBeenCalled();
      expect(mockPurchasesLogOut).not.toHaveBeenCalled();
    });

    it("should call Purchases.logIn when user authenticates on native platform", async () => {
      mockPlatform = "ios";

      mockPurchasesLogIn.mockResolvedValue({
        customerInfo: {
          entitlements: { active: { tapto_launcher: { isActive: true } } },
        },
      });

      let authCallback: ((change: { user: unknown }) => Promise<void>) | null =
        null;
      mockAddListener.mockImplementation(
        (
          _event: string,
          callback: (change: { user: unknown }) => Promise<void>,
        ) => {
          authCallback = callback;
          return Promise.resolve({ remove: mockRemove });
        },
      );

      const App = (await import("@/App")).default;
      render(<App />);

      await waitFor(() => {
        expect(authCallback).not.toBeNull();
      });

      const mockUser = { uid: "user-123", email: "test@example.com" };
      await act(async () => {
        await authCallback!({ user: mockUser });
      });

      expect(mockPurchasesLogIn).toHaveBeenCalledWith({
        appUserID: "user-123",
      });
    });

    it("should set launcherAccess true when RevenueCat entitlement is active", async () => {
      mockPlatform = "ios";

      mockPurchasesLogIn.mockResolvedValue({
        customerInfo: {
          entitlements: { active: { tapto_launcher: { isActive: true } } },
        },
      });

      let authCallback: ((change: { user: unknown }) => Promise<void>) | null =
        null;
      mockAddListener.mockImplementation(
        (
          _event: string,
          callback: (change: { user: unknown }) => Promise<void>,
        ) => {
          authCallback = callback;
          return Promise.resolve({ remove: mockRemove });
        },
      );

      const App = (await import("@/App")).default;
      render(<App />);

      await waitFor(() => {
        expect(authCallback).not.toBeNull();
      });

      const mockUser = { uid: "user-123", email: "test@example.com" };
      await act(async () => {
        await authCallback!({ user: mockUser });
      });

      expect(mockSetLauncherAccess).toHaveBeenCalledWith(true);
    });

    it("should set launcherAccess true when online subscription is premium", async () => {
      mockPlatform = "ios";

      // No RevenueCat entitlement, but online subscription is premium
      mockPurchasesLogIn.mockResolvedValue({
        customerInfo: { entitlements: { active: {} } },
      });
      mockGetSubscriptionStatus.mockResolvedValue({ is_premium: true });

      let authCallback: ((change: { user: unknown }) => Promise<void>) | null =
        null;
      mockAddListener.mockImplementation(
        (
          _event: string,
          callback: (change: { user: unknown }) => Promise<void>,
        ) => {
          authCallback = callback;
          return Promise.resolve({ remove: mockRemove });
        },
      );

      const App = (await import("@/App")).default;
      render(<App />);

      await waitFor(() => {
        expect(authCallback).not.toBeNull();
      });

      const mockUser = { uid: "user-123", email: "test@example.com" };
      await act(async () => {
        await authCallback!({ user: mockUser });
      });

      // First call sets false (from RevenueCat), second call sets true (from API)
      expect(mockSetLauncherAccess).toHaveBeenLastCalledWith(true);
    });

    it("should call Purchases.logOut when user signs out on native platform", async () => {
      mockPlatform = "ios";

      mockPurchasesGetCustomerInfo.mockResolvedValue({
        customerInfo: { entitlements: { active: {} } },
      });

      let authCallback: ((change: { user: unknown }) => Promise<void>) | null =
        null;
      mockAddListener.mockImplementation(
        (
          _event: string,
          callback: (change: { user: unknown }) => Promise<void>,
        ) => {
          authCallback = callback;
          return Promise.resolve({ remove: mockRemove });
        },
      );

      const App = (await import("@/App")).default;
      render(<App />);

      await waitFor(() => {
        expect(authCallback).not.toBeNull();
      });

      // Trigger sign out (user is null)
      await act(async () => {
        await authCallback!({ user: null });
      });

      expect(mockPurchasesLogOut).toHaveBeenCalled();
      expect(mockPurchasesGetCustomerInfo).toHaveBeenCalled();
    });

    it("should handle RevenueCat login failure gracefully", async () => {
      mockPlatform = "ios";

      mockPurchasesLogIn.mockRejectedValue(new Error("RevenueCat error"));

      let authCallback: ((change: { user: unknown }) => Promise<void>) | null =
        null;
      mockAddListener.mockImplementation(
        (
          _event: string,
          callback: (change: { user: unknown }) => Promise<void>,
        ) => {
          authCallback = callback;
          return Promise.resolve({ remove: mockRemove });
        },
      );

      const App = (await import("@/App")).default;
      render(<App />);

      await waitFor(() => {
        expect(authCallback).not.toBeNull();
      });

      const mockUser = { uid: "user-123", email: "test@example.com" };
      await act(async () => {
        await authCallback!({ user: mockUser });
      });

      // Should log error but not throw
      expect(mockLoggerError).toHaveBeenCalledWith(
        "RevenueCat login sync failed:",
        expect.any(Error),
        expect.objectContaining({
          category: "purchase",
          action: "logIn",
        }),
      );
    });

    it("should handle subscription status check failure gracefully", async () => {
      mockPlatform = "ios";

      mockPurchasesLogIn.mockResolvedValue({
        customerInfo: { entitlements: { active: {} } },
      });
      mockGetSubscriptionStatus.mockRejectedValue(new Error("API error"));

      let authCallback: ((change: { user: unknown }) => Promise<void>) | null =
        null;
      mockAddListener.mockImplementation(
        (
          _event: string,
          callback: (change: { user: unknown }) => Promise<void>,
        ) => {
          authCallback = callback;
          return Promise.resolve({ remove: mockRemove });
        },
      );

      const App = (await import("@/App")).default;
      render(<App />);

      await waitFor(() => {
        expect(authCallback).not.toBeNull();
      });

      const mockUser = { uid: "user-123", email: "test@example.com" };
      await act(async () => {
        await authCallback!({ user: mockUser });
      });

      // Should log error but not throw
      expect(mockLoggerError).toHaveBeenCalledWith(
        "Failed to check subscription status:",
        expect.any(Error),
        expect.objectContaining({
          category: "api",
          action: "getSubscription",
        }),
      );
    });
  });
});
