import { act, renderHook, waitFor } from "@/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  CustomerInfo,
  PurchasesPackage,
} from "@revenuecat/purchases-capacitor";
import type { SubscriptionResponse } from "@/lib/models";
import {
  cachePurchaseErrorDiagnostics,
  clearCachedPurchaseErrorDiagnostics,
  getCachedPurchaseErrorDiagnostics,
} from "@/lib/purchaseReportContext";

const {
  mockEnsurePurchasesUser,
  mockGetOfferings,
  mockPurchasePackage,
  mockRestorePurchases,
  mockGetSubscriptionStatus,
  mockBrowserOpen,
  mockSetLifetimeProAccess,
  mockSetOnlinePremiumAccess,
  mockSetStoreVerifiedProAccess,
  mockIsNativePlatform,
  mockAddAppListener,
} = vi.hoisted(() => ({
  mockEnsurePurchasesUser: vi.fn(),
  mockGetOfferings: vi.fn(),
  mockPurchasePackage: vi.fn(),
  mockRestorePurchases: vi.fn(),
  mockGetSubscriptionStatus: vi.fn(),
  mockBrowserOpen: vi.fn(),
  mockSetLifetimeProAccess: vi.fn(),
  mockSetOnlinePremiumAccess: vi.fn(),
  mockSetStoreVerifiedProAccess: vi.fn(),
  mockIsNativePlatform: vi.fn(() => true),
  mockAddAppListener: vi.fn(),
}));

let appStateCallback: ((state: { isActive: boolean }) => void) | null = null;
let loggedInUserID = "user-123";

const monthlyPackage = {
  identifier: "$rc_monthly",
} as unknown as PurchasesPackage;
const annualPackage = {
  identifier: "$rc_annual",
} as unknown as PurchasesPackage;

function customerInfo(options?: {
  lifetimePro?: boolean;
  warp?: boolean;
  managementURL?: string | null;
}): CustomerInfo {
  return {
    entitlements: {
      active: {
        ...(options?.lifetimePro ? { tapto_launcher: {} } : {}),
        ...(options?.warp ? { warp: {} } : {}),
      },
    },
    managementURL: options?.managementURL ?? null,
  } as unknown as CustomerInfo;
}

function subscription(isPremium: boolean): SubscriptionResponse {
  return {
    is_premium: isPremium,
    sources: isPremium ? ["revenuecat"] : [],
    patreon: null,
    revenuecat: isPremium
      ? { active: true, will_renew: true, store: "APP_STORE" }
      : null,
  };
}

vi.mock("@capacitor/core", () => ({
  Capacitor: {
    getPlatform: vi.fn(() => "ios"),
    isNativePlatform: mockIsNativePlatform,
  },
}));

vi.mock("@capacitor/app", () => ({
  App: {
    addListener: mockAddAppListener,
  },
}));

vi.mock("@capacitor/browser", () => ({
  Browser: {
    open: mockBrowserOpen,
  },
}));

vi.mock("@revenuecat/purchases-capacitor", () => ({
  Purchases: {
    getOfferings: mockGetOfferings,
    purchasePackage: mockPurchasePackage,
    restorePurchases: mockRestorePurchases,
  },
}));

vi.mock("@/lib/onlineApi", () => ({
  getSubscriptionStatus: mockGetSubscriptionStatus,
}));

vi.mock("@/lib/purchasesSetup", () => ({
  WARP_OFFERING_ID: "warp",
  ensurePurchasesUser: mockEnsurePurchasesUser,
  getWarpPackages: vi.fn(() => ({
    monthly: monthlyPackage,
    annual: annualPackage,
  })),
  getOfferingDiagnostics: vi.fn(() => ({})),
  getPurchaseAccess: (info: CustomerInfo) => ({
    lifetimePro: Boolean(info.entitlements?.active?.tapto_launcher),
    warp: Boolean(info.entitlements?.active?.warp),
  }),
  runPurchasesOperation: async (
    appUserID: string,
    operation: (customerInfo: CustomerInfo) => Promise<unknown>,
  ) => {
    const info = await mockEnsurePurchasesUser(appUserID);
    return operation(info);
  },
}));

vi.mock("@/lib/preferencesStore", () => {
  const state = {
    setLifetimeProAccess: mockSetLifetimeProAccess,
    setOnlinePremiumAccess: mockSetOnlinePremiumAccess,
    setStoreVerifiedProAccess: mockSetStoreVerifiedProAccess,
  };
  const usePreferencesStore = (selector: (state: unknown) => unknown) =>
    selector(state);
  usePreferencesStore.getState = () => state;
  return { usePreferencesStore };
});

vi.mock("@/lib/store", () => ({
  useStatusStore: {
    getState: () => ({ loggedInUser: { uid: loggedInUserID } }),
  },
}));

vi.mock("@/lib/logger", () => ({
  logger: {
    log: vi.fn(),
    error: vi.fn(),
  },
}));

import {
  ACTIVATION_POLL_DEADLINE_MS,
  useWarpSubscription,
} from "@/hooks/useWarpSubscription";

describe("useWarpSubscription", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearCachedPurchaseErrorDiagnostics();
    appStateCallback = null;
    loggedInUserID = "user-123";
    mockIsNativePlatform.mockReturnValue(true);
    mockAddAppListener.mockImplementation(
      (_event: string, callback: (state: { isActive: boolean }) => void) => {
        appStateCallback = callback;
        return Promise.resolve({ remove: vi.fn() });
      },
    );
    mockEnsurePurchasesUser.mockResolvedValue(customerInfo());
    mockGetOfferings.mockResolvedValue({});
    mockGetSubscriptionStatus.mockResolvedValue(subscription(false));
    mockPurchasePackage.mockResolvedValue({
      customerInfo: customerInfo({ warp: true }),
    });
    mockRestorePurchases.mockResolvedValue({
      customerInfo: customerInfo(),
    });
    mockBrowserOpen.mockResolvedValue(undefined);
  });

  it("should preserve checkout diagnostics during a successful account load", async () => {
    cachePurchaseErrorDiagnostics({ code: "3" }, "purchasePackage");

    const { result } = renderHook(() => useWarpSubscription("user-123"));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(getCachedPurchaseErrorDiagnostics()).toEqual({ code: "3" });
  });

  it("should default to annual and purchase its explicit package", async () => {
    mockGetSubscriptionStatus
      .mockResolvedValueOnce(subscription(false))
      .mockResolvedValueOnce(subscription(false))
      .mockResolvedValueOnce(subscription(true));
    const { result } = renderHook(() => useWarpSubscription("user-123"));

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    let purchaseResult: string | undefined;
    await act(async () => {
      purchaseResult = await result.current.purchase();
    });

    expect(result.current.selectedPlan).toBe("annual");
    expect(mockEnsurePurchasesUser).toHaveBeenLastCalledWith("user-123");
    expect(mockPurchasePackage).toHaveBeenCalledWith({
      aPackage: annualPackage,
    });
    expect(purchaseResult).toBe("active");
    expect(mockSetOnlinePremiumAccess).toHaveBeenLastCalledWith(true);
  });

  it("should classify store payment approval as pending", async () => {
    mockPurchasePackage.mockRejectedValue({
      code: "20",
      message: "Payment pending",
    });
    const { result } = renderHook(() => useWarpSubscription("user-123"));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    let purchaseResult: string | undefined;
    await act(async () => {
      purchaseResult = await result.current.purchase();
    });

    expect(purchaseResult).toBe("pending");
  });

  it("should classify account identity failures", async () => {
    mockPurchasePackage.mockRejectedValue({
      code: "14",
      userInfo: { readableErrorCode: "InvalidAppUserIdError" },
      message: "Invalid app user ID",
    });
    const { result } = renderHook(() => useWarpSubscription("user-123"));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    let purchaseResult: string | undefined;
    await act(async () => {
      purchaseResult = await result.current.purchase();
    });

    expect(purchaseResult).toBe("identity_error");
  });

  it("should return not found without polling when restore has no access", async () => {
    mockGetSubscriptionStatus
      .mockResolvedValueOnce(subscription(false))
      .mockResolvedValueOnce(subscription(false));
    const { result } = renderHook(() => useWarpSubscription("user-123"));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    let restoreResult: string | undefined;
    await act(async () => {
      restoreResult = await result.current.restore();
    });

    expect(restoreResult).toBe("not_found");
    expect(mockRestorePurchases).toHaveBeenCalledOnce();
    expect(result.current.subscription?.is_premium).toBe(false);
    expect(result.current.activationPending).toBe(false);
    expect(mockSetStoreVerifiedProAccess).toHaveBeenCalledWith(false);
  });

  it("should clear stale activation state when checkout offerings return", async () => {
    mockEnsurePurchasesUser.mockResolvedValue(customerInfo({ warp: true }));
    const { result } = renderHook(() => useWarpSubscription("user-123"));
    await waitFor(() => expect(result.current.activationPending).toBe(true));

    mockEnsurePurchasesUser.mockResolvedValue(customerInfo());
    act(() => appStateCallback?.({ isActive: true }));

    await waitFor(() => {
      expect(mockGetOfferings).toHaveBeenCalledOnce();
      expect(result.current.activationPending).toBe(false);
    });
  });

  it.each([
    {
      label: "lifetime Pro",
      access: customerInfo({ lifetimePro: true }),
      expected: "pro_restored",
    },
    {
      label: "no purchases",
      access: customerInfo(),
      expected: "not_found",
    },
  ])(
    "should clear stale activation state after restoring $label",
    async ({ access, expected }) => {
      mockEnsurePurchasesUser.mockResolvedValue(customerInfo({ warp: true }));
      mockRestorePurchases.mockResolvedValue({ customerInfo: access });
      const { result } = renderHook(() => useWarpSubscription("user-123"));
      await waitFor(() => expect(result.current.activationPending).toBe(true));

      let restoreResult: string | undefined;
      await act(async () => {
        restoreResult = await result.current.restore();
      });

      expect(restoreResult).toBe(expected);
      expect(result.current.activationPending).toBe(false);
    },
  );

  it("should stop activation polling at the bounded deadline", async () => {
    mockGetSubscriptionStatus.mockResolvedValue(subscription(false));
    const { result } = renderHook(() => useWarpSubscription("user-123"));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    vi.useFakeTimers();
    try {
      let purchasePromise: Promise<string> | undefined;
      act(() => {
        purchasePromise = result.current.purchase();
      });

      let purchaseResult: string | undefined;
      await act(async () => {
        await vi.advanceTimersByTimeAsync(ACTIVATION_POLL_DEADLINE_MS + 1);
        purchaseResult = await purchasePromise;
      });

      expect(purchaseResult).toBe("activation_pending");
      expect(result.current.activationPending).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("should load web subscription status without native RevenueCat calls", async () => {
    mockIsNativePlatform.mockReturnValue(false);
    const { result } = renderHook(() => useWarpSubscription("user-123"));

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.subscription?.is_premium).toBe(false);
    expect(mockEnsurePurchasesUser).not.toHaveBeenCalled();
    expect(mockGetOfferings).not.toHaveBeenCalled();
  });

  it("should stop loading when the initial subscription request stalls", async () => {
    vi.useFakeTimers();
    try {
      mockIsNativePlatform.mockReturnValue(false);
      mockGetSubscriptionStatus.mockImplementation(
        (signal: AbortSignal) =>
          new Promise((_, reject) => {
            signal.addEventListener("abort", () => reject(signal.reason), {
              once: true,
            });
          }),
      );

      const { result } = renderHook(() => useWarpSubscription("user-123"));
      await act(async () => {
        await vi.runAllTimersAsync();
      });

      expect(result.current.isLoading).toBe(false);
      expect(result.current.loadFailed).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("should refresh on foreground without replacing content with loading", async () => {
    const { result } = renderHook(() => useWarpSubscription("user-123"));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    let resolveRefresh!: (value: SubscriptionResponse) => void;
    mockGetSubscriptionStatus.mockImplementationOnce(
      () =>
        new Promise<SubscriptionResponse>((resolve) => {
          resolveRefresh = resolve;
        }),
    );

    act(() => appStateCallback?.({ isActive: true }));
    expect(result.current.isLoading).toBe(false);

    resolveRefresh(subscription(true));
    await waitFor(() => {
      expect(result.current.subscription?.is_premium).toBe(true);
      expect(result.current.isLoading).toBe(false);
    });
  });

  it("should ignore a foreground response after retry starts", async () => {
    const { result } = renderHook(() => useWarpSubscription("user-123"));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    let resolveForeground!: (value: SubscriptionResponse) => void;
    mockGetSubscriptionStatus
      .mockImplementationOnce(
        () =>
          new Promise<SubscriptionResponse>((resolve) => {
            resolveForeground = resolve;
          }),
      )
      .mockResolvedValueOnce(subscription(true));

    act(() => appStateCallback?.({ isActive: true }));
    await waitFor(() =>
      expect(mockGetSubscriptionStatus).toHaveBeenCalledTimes(2),
    );

    await act(async () => result.current.retry());
    expect(result.current.subscription?.is_premium).toBe(true);

    await act(async () => {
      resolveForeground(subscription(false));
      await Promise.resolve();
    });
    expect(result.current.subscription?.is_premium).toBe(true);
  });

  it("should reject a purchase result for a stale account", async () => {
    const { result } = renderHook(() => useWarpSubscription("user-123"));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    mockSetLifetimeProAccess.mockClear();

    let resolvePurchase!: (value: { customerInfo: CustomerInfo }) => void;
    mockPurchasePackage.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolvePurchase = resolve;
        }),
    );

    let purchasePromise!: Promise<string>;
    act(() => {
      purchasePromise = result.current.purchase();
    });
    await waitFor(() => expect(mockPurchasePackage).toHaveBeenCalledOnce());

    loggedInUserID = "user-456";
    resolvePurchase({ customerInfo: customerInfo({ warp: true }) });

    let purchaseResult: string | undefined;
    await act(async () => {
      purchaseResult = await purchasePromise;
    });
    expect(purchaseResult).toBe("identity_error");
    expect(mockSetLifetimeProAccess).not.toHaveBeenCalled();
    expect(result.current.revenueCatWarpActive).toBe(false);
  });

  it("should ignore a restore result for a stale account", async () => {
    const { result } = renderHook(() => useWarpSubscription("user-123"));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    mockSetLifetimeProAccess.mockClear();

    let resolveRestore!: (value: { customerInfo: CustomerInfo }) => void;
    mockRestorePurchases.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveRestore = resolve;
        }),
    );

    let restorePromise!: Promise<string>;
    act(() => {
      restorePromise = result.current.restore();
    });
    await waitFor(() => expect(mockRestorePurchases).toHaveBeenCalledOnce());

    loggedInUserID = "user-456";
    resolveRestore({ customerInfo: customerInfo({ warp: true }) });

    let restoreResult: string | undefined;
    await act(async () => {
      restoreResult = await restorePromise;
    });
    expect(restoreResult).toBe("failed");
    expect(mockSetLifetimeProAccess).not.toHaveBeenCalled();
    expect(result.current.revenueCatWarpActive).toBe(false);
  });

  it("should fetch a fresh management URL before opening it", async () => {
    mockEnsurePurchasesUser.mockResolvedValue(
      customerInfo({ managementURL: "https://apps.apple.com/account" }),
    );
    const { result } = renderHook(() => useWarpSubscription("user-123"));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    let manageResult: string | undefined;
    await act(async () => {
      manageResult = await result.current.manage();
    });

    expect(manageResult).toBe("opened");
    expect(mockEnsurePurchasesUser).toHaveBeenLastCalledWith("user-123");
    expect(mockBrowserOpen).toHaveBeenCalledWith({
      url: "https://apps.apple.com/account",
    });
  });
});
