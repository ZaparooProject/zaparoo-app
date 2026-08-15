import { act, render, waitFor } from "@/test-utils";
import { vi, beforeEach, describe, it, expect } from "vitest";
import React from "react";

const { mockIsPluginAvailable } = vi.hoisted(() => ({
  mockIsPluginAvailable: vi.fn<(pluginName: string) => boolean>(() => true),
}));

// Store mock functions
let mockLoggedInUser: { uid: string; email?: string } | null = null;
const mockSetLoggedInUser = vi.fn(
  (user: { uid: string; email?: string } | null) => {
    mockLoggedInUser = user;
  },
);
const mockSetLauncherAccess = vi.fn();
const mockBeginOnlinePremiumAccessCheck = vi.fn();
const mockSetOnlinePremiumAccess = vi.fn();
const mockClearOnlinePremiumAccess = vi.fn();
const mockGetIdToken = vi.fn();
const mockReload = vi.fn();
const mockAddListener = vi.fn();
const mockRemove = vi.fn();

// RevenueCat mock functions
const mockPurchasesLogIn = vi.fn();
const mockPurchasesLogOut = vi.fn();
const mockPurchasesGetCustomerInfo = vi.fn();
const mockPurchasesIsAnonymous = vi.fn();
const mockResetPurchasesUser = vi.fn();

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
    isPluginAvailable: mockIsPluginAvailable,
  },
  registerPlugin: vi.fn(),
}));

vi.mock("@uidotdev/usehooks", () => ({
  usePrevious: vi.fn(() => undefined),
  useMediaQuery: vi.fn(() => false),
}));

vi.mock("@/lib/capacitorBridge", () => ({
  isPluginAvailable: (pluginName: string) => mockIsPluginAvailable(pluginName),
  isNativePluginAvailable: (pluginName: string) =>
    mockPlatform !== "web" && mockIsPluginAvailable(pluginName),
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
    getIdToken: (...args: unknown[]) => mockGetIdToken(...args),
    reload: () => mockReload(),
  },
}));

vi.mock("@revenuecat/purchases-capacitor", () => ({
  Purchases: {
    logIn: (...args: unknown[]) => mockPurchasesLogIn(...args),
    logOut: () => mockPurchasesLogOut(),
    getCustomerInfo: () => mockPurchasesGetCustomerInfo(),
    isAnonymous: () => mockPurchasesIsAnonymous(),
  },
}));

// purchasesReady resolves immediately in tests
vi.mock("@/lib/purchasesSetup", () => ({
  purchasesReady: Promise.resolve(),
  ensurePurchasesUser: async (appUserID: string) => {
    const result = await mockPurchasesLogIn({ appUserID });
    return result.customerInfo;
  },
  getPurchaseAccess: (customerInfo: {
    entitlements?: { active?: Record<string, unknown> };
  }) => ({
    lifetimePro: Boolean(customerInfo.entitlements?.active?.tapto_launcher),
    warp: Boolean(customerInfo.entitlements?.active?.warp),
  }),
  resetPurchasesUser: () => mockResetPurchasesUser(),
}));

vi.mock("@/lib/onlineApi", () => ({
  getSubscriptionStatus: (signal?: AbortSignal) =>
    mockGetSubscriptionStatus(signal),
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
      inboxMessages: [],
      inboxModalOpen: false,
      setInboxModalOpen: vi.fn(),
      removeInboxMessage: vi.fn(),
      setInboxMessages: vi.fn(),
      coreVersion: null as string | null,
      coreVersionPending: false,
    };
    if (typeof selector === "function") {
      return selector(mockState);
    }
    return mockState;
  });

  useStatusStore.getState = () => ({
    loggedInUser: mockLoggedInUser,
    playing: { mediaName: "", systemId: "", mediaPath: "" },
    gamesIndex: { exists: true, indexing: false, totalFiles: 0 },
    safeInsets: { top: "0px", bottom: "0px", left: "0px", right: "0px" },
    inboxMessages: [],
    coreVersion: null,
    coreVersionPending: false,
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
      whatsNewInitialized: true,
      lastWhatsNewRuntimeKey: "native:1.0.0+1",
      seenWhatsNewAnnouncementIds: [],
      initializeWhatsNew: vi.fn(),
      setLastWhatsNewRuntimeKey: vi.fn(),
      markWhatsNewSeen: vi.fn(),
      setLifetimeProAccess: mockSetLauncherAccess,
      beginOnlinePremiumAccessCheck: mockBeginOnlinePremiumAccessCheck,
      setOnlinePremiumAccess: mockSetOnlinePremiumAccess,
      clearOnlinePremiumAccess: mockClearOnlinePremiumAccess,
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
    openPairingModal: () => {},
  }),
}));

vi.mock("@/components/ReconnectingIndicator", () => ({
  ReconnectingIndicator: () => null,
}));

vi.mock("@/lib/deepLinks", () => ({
  useDeepLinks: vi.fn(),
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

vi.mock("@/components/InboxModal", () => ({
  InboxModal: () => <div data-testid="inbox-modal" />,
}));

vi.mock("@/components/AppBadgeManager", () => ({
  AppBadgeManager: () => <div data-testid="app-badge-manager" />,
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
  useRunQueueProcessor: vi.fn(() => ({
    pendingConfirm: null,
    confirmRun: vi.fn(),
    cancelConfirm: vi.fn(),
  })),
}));
vi.mock("@/hooks/useWriteQueueProcessor", () => ({
  useWriteQueueProcessor: vi.fn(() => ({
    nfcWriter: {
      write: vi.fn(),
      retry: vi.fn(),
      end: vi.fn(),
      writing: false,
      result: null,
      status: null,
      verifyError: null,
      getVerifyError: vi.fn(() => null),
    },
    reset: vi.fn(),
  })),
}));
vi.mock("@/hooks/useShakeDetection", () => ({ useShakeDetection: vi.fn() }));
vi.mock("@/hooks/usePassiveNfcListener", () => ({
  usePassiveNfcListener: vi.fn(),
}));
vi.mock("@/lib/logger", () => ({
  initDeviceInfo: vi.fn(),
  logger: {
    log: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: mockLoggerError,
  },
}));

// Mock window.location
Object.defineProperty(window, "location", {
  value: { hostname: "localhost", search: "", hash: "", pathname: "/" },
  writable: true,
  configurable: true,
});

// Load App during test collection so coverage instrumentation and module
// transforms do not consume the first test's timeout under CI load.
const App = (await import("@/App")).default;

describe("Firebase Auth Integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLoggedInUser = null;
    mockPlatform = "web"; // Default to web platform
    mockIsPluginAvailable.mockReturnValue(true);
    mockAddListener.mockImplementation(() =>
      Promise.resolve({ remove: mockRemove }),
    );
    mockGetIdToken.mockResolvedValue({ token: "mock-token" });
    mockReload.mockResolvedValue(undefined);

    // Default RevenueCat mocks
    mockPurchasesLogIn.mockResolvedValue({
      customerInfo: { entitlements: { active: {} } },
    });
    mockPurchasesLogOut.mockResolvedValue(undefined);
    mockPurchasesIsAnonymous.mockResolvedValue({ isAnonymous: false });
    mockPurchasesGetCustomerInfo.mockResolvedValue({
      customerInfo: { entitlements: { active: {} } },
    });
    mockResetPurchasesUser.mockResolvedValue({ entitlements: { active: {} } });

    // Default online API mock
    mockGetSubscriptionStatus.mockResolvedValue({ is_premium: false });
  });

  it("should register authStateChange listener on mount", async () => {
    render(<App />);

    await waitFor(() => {
      expect(mockAddListener).toHaveBeenCalledWith(
        "authStateChange",
        expect.any(Function),
      );
    });
  });

  it("should skip auth listener setup when FirebaseAuthentication is unavailable", async () => {
    mockIsPluginAvailable.mockImplementation(
      (pluginName: string) => pluginName !== "FirebaseAuthentication",
    );

    const App = (await import("@/App")).default;
    render(<App />);

    await waitFor(() => {
      expect(mockAddListener).not.toHaveBeenCalled();
    });
    expect(mockClearOnlinePremiumAccess).not.toHaveBeenCalled();
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

    // Wait for cleanup to be called
    await waitFor(() => {
      expect(mockRemove).toHaveBeenCalled();
    });
  });

  it("should remove a listener that resolves after unmount", async () => {
    let resolveListener!: (handle: { remove: typeof mockRemove }) => void;
    mockAddListener.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveListener = resolve;
        }),
    );

    const App = (await import("@/App")).default;
    const { unmount } = render(<App />);
    await waitFor(() => expect(mockAddListener).toHaveBeenCalled());

    unmount();
    resolveListener({ remove: mockRemove });

    await waitFor(() => expect(mockRemove).toHaveBeenCalledOnce());
  });

  // Regression test: Ensures token is refreshed on auth state change to get
  // latest claims (e.g., email_verified). Without this, users who verified
  // their email externally would see the requirements modal on app restart
  // because the cached token still had email_verified=false.
  it("should refresh token with forceRefresh on auth state change to get latest claims", async () => {
    mockPlatform = "ios";
    const callOrder: string[] = [];

    let authCallback: ((change: { user: unknown }) => void) | null = null;
    mockAddListener.mockImplementation(
      (_event: string, callback: (change: { user: unknown }) => void) => {
        authCallback = callback;
        return Promise.resolve({ remove: mockRemove });
      },
    );

    mockReload.mockImplementation(() => {
      callOrder.push("reload");
      return Promise.resolve();
    });

    mockGetIdToken.mockImplementation(() => {
      callOrder.push("getIdToken");
      return Promise.resolve({ token: "mock-token" });
    });

    mockGetSubscriptionStatus.mockImplementation(() => {
      callOrder.push("getSubscriptionStatus");
      return Promise.resolve({ is_premium: false });
    });

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

    // Verify reload and getIdToken were called
    expect(mockReload).toHaveBeenCalled();
    expect(mockGetIdToken).toHaveBeenCalledWith({ forceRefresh: true });

    // Wait for the calls to complete
    await waitFor(() => {
      expect(callOrder.length).toBeGreaterThanOrEqual(2);
    });

    // Verify the order: reload -> getIdToken -> API calls
    const reloadIndex = callOrder.indexOf("reload");
    const getIdTokenIndex = callOrder.indexOf("getIdToken");
    const apiCallIndex = callOrder.indexOf("getSubscriptionStatus");

    expect(callOrder).toContain("reload");
    expect(callOrder).toContain("getIdToken");
    expect(reloadIndex).toBeLessThan(getIdTokenIndex);
    if (apiCallIndex !== -1) {
      expect(getIdTokenIndex).toBeLessThan(apiCallIndex);
    }
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

    it("should skip RevenueCat sync when Purchases plugin is unavailable", async () => {
      mockPlatform = "ios";
      mockIsPluginAvailable.mockImplementation(
        (pluginName: string) => pluginName !== "Purchases",
      );

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

      expect(mockSetLoggedInUser).toHaveBeenCalledWith(mockUser);
      expect(mockPurchasesLogIn).not.toHaveBeenCalled();
      expect(mockPurchasesLogOut).not.toHaveBeenCalled();
      expect(mockPurchasesGetCustomerInfo).not.toHaveBeenCalled();
    });

    it("should clear lifetime access before synchronizing a new identity", async () => {
      mockPlatform = "ios";
      let resolveLogin!: (value: {
        customerInfo: {
          entitlements: { active: Record<string, unknown> };
        };
      }) => void;
      mockPurchasesLogIn.mockImplementation(
        () =>
          new Promise((resolve) => {
            resolveLogin = resolve;
          }),
      );

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
      await waitFor(() => expect(authCallback).not.toBeNull());

      let authPromise!: Promise<void>;
      act(() => {
        authPromise = authCallback!({
          user: { uid: "user-123", email: "test@example.com" },
        });
      });

      await waitFor(() => {
        expect(mockSetLauncherAccess).toHaveBeenCalledWith(false);
        expect(mockBeginOnlinePremiumAccessCheck).toHaveBeenCalledOnce();
      });
      expect(mockSetLauncherAccess).not.toHaveBeenCalledWith(true);

      resolveLogin({
        customerInfo: {
          entitlements: { active: { tapto_launcher: {} } },
        },
      });
      await act(async () => authPromise);

      expect(mockSetLauncherAccess).toHaveBeenLastCalledWith(true);
    });

    it("should ignore RevenueCat access from a stale identity change", async () => {
      mockPlatform = "ios";
      let resolveFirstLogin!: (value: {
        customerInfo: {
          entitlements: { active: Record<string, unknown> };
        };
      }) => void;
      mockPurchasesLogIn
        .mockImplementationOnce(
          () =>
            new Promise((resolve) => {
              resolveFirstLogin = resolve;
            }),
        )
        .mockResolvedValueOnce({
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
      await waitFor(() => expect(authCallback).not.toBeNull());

      let firstChange!: Promise<void>;
      act(() => {
        firstChange = authCallback!({ user: { uid: "user-123" } });
      });
      await waitFor(() => expect(mockPurchasesLogIn).toHaveBeenCalledOnce());

      await act(async () => {
        await authCallback!({ user: { uid: "user-456" } });
      });
      resolveFirstLogin({
        customerInfo: {
          entitlements: { active: { tapto_launcher: {} } },
        },
      });
      await act(async () => firstChange);

      expect(mockSetLauncherAccess).not.toHaveBeenCalledWith(true);
      expect(mockSetLauncherAccess).toHaveBeenLastCalledWith(false);
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

      expect(mockSetOnlinePremiumAccess).toHaveBeenLastCalledWith(true);
    });

    it("should reset the RevenueCat user when signing out", async () => {
      mockPlatform = "ios";

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

      expect(mockResetPurchasesUser).toHaveBeenCalledOnce();
    });

    it("should report unexpected RevenueCat logout errors on sign out", async () => {
      mockPlatform = "ios";
      const error = new Error("network connection lost");
      mockResetPurchasesUser.mockRejectedValueOnce(error);

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

      await act(async () => {
        await authCallback!({ user: null });
      });

      expect(mockLoggerError).toHaveBeenCalledWith(
        "RevenueCat login sync failed:",
        error,
        expect.objectContaining({
          category: "purchase",
          action: "logOut",
        }),
      );
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

      // Failed synchronization must leave the previous identity's access cleared.
      expect(mockSetLauncherAccess).toHaveBeenLastCalledWith(false);
      expect(mockLoggerError).toHaveBeenCalledWith(
        "RevenueCat login sync failed:",
        expect.any(Error),
        expect.objectContaining({
          category: "purchase",
          action: "logIn",
        }),
      );
    });

    it("should retry a failed subscription status check once", async () => {
      mockPlatform = "ios";
      mockPurchasesLogIn.mockResolvedValue({
        customerInfo: { entitlements: { active: {} } },
      });
      mockGetSubscriptionStatus
        .mockRejectedValueOnce(new Error("temporary API error"))
        .mockResolvedValueOnce({ is_premium: true });

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
      await waitFor(() => expect(authCallback).not.toBeNull());

      await act(async () => {
        await authCallback!({
          user: { uid: "user-123", email: "test@example.com" },
        });
      });

      expect(mockGetSubscriptionStatus).toHaveBeenCalledTimes(2);
      expect(mockGetSubscriptionStatus).toHaveBeenCalledWith(
        expect.any(AbortSignal),
      );
      expect(mockSetOnlinePremiumAccess).toHaveBeenCalledWith(true);
      expect(mockLoggerError).not.toHaveBeenCalledWith(
        "Failed to check subscription status:",
        expect.anything(),
        expect.anything(),
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

      // Should retry once, then terminate pending access and log the error.
      expect(mockGetSubscriptionStatus).toHaveBeenCalledTimes(2);
      expect(mockSetOnlinePremiumAccess).toHaveBeenCalledWith(false);
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
