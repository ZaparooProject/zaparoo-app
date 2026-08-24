import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import type {
  CustomerInfo,
  PurchasesOfferings,
  PurchasesPackage,
} from "@revenuecat/purchases-capacitor";

const {
  mockGetAppUserID,
  mockLogIn,
  mockGetCustomerInfo,
  mockIsAnonymous,
  mockLogOut,
  mockSyncPurchases,
  mockRestorePurchases,
  mockInvalidateCustomerInfoCache,
  mockGetOfferings,
  mockResolveRuntimeReleaseIdentity,
  mockGetPreferencesState,
  mockIsNativePlatform,
} = vi.hoisted(() => ({
  mockGetAppUserID: vi.fn(),
  mockLogIn: vi.fn(),
  mockGetCustomerInfo: vi.fn(),
  mockIsAnonymous: vi.fn(),
  mockLogOut: vi.fn(),
  mockSyncPurchases: vi.fn(),
  mockRestorePurchases: vi.fn(),
  mockInvalidateCustomerInfoCache: vi.fn(),
  mockGetOfferings: vi.fn(),
  mockResolveRuntimeReleaseIdentity: vi.fn(),
  mockGetPreferencesState: vi.fn(() => ({ storeVerifiedProAccess: false })),
  mockIsNativePlatform: vi.fn(),
}));

vi.mock("@capacitor/core", () => ({
  Capacitor: {
    getPlatform: vi.fn(() => "android"),
    isNativePlatform: mockIsNativePlatform,
  },
}));

vi.mock("@revenuecat/purchases-capacitor", () => ({
  Purchases: {
    getAppUserID: mockGetAppUserID,
    logIn: mockLogIn,
    getCustomerInfo: mockGetCustomerInfo,
    isAnonymous: mockIsAnonymous,
    logOut: mockLogOut,
    syncPurchases: mockSyncPurchases,
    restorePurchases: mockRestorePurchases,
    invalidateCustomerInfoCache: mockInvalidateCustomerInfoCache,
    getOfferings: mockGetOfferings,
  },
}));

vi.mock("@/lib/whatsNew", () => ({
  resolveRuntimeReleaseIdentity: mockResolveRuntimeReleaseIdentity,
}));

vi.mock("@/lib/preferencesStore", () => ({
  usePreferencesStore: { getState: mockGetPreferencesState },
}));

import { PurchaseIdentityError } from "@/lib/errors";
import {
  ensurePurchasesUser,
  formatBillingDiagnostics,
  getBillingDiagnostics,
  getProPackage,
  getPurchaseAccess,
  getWarpPackages,
  reconcileStorePurchases,
  resetPurchasesUser,
  resolvePurchasesReady,
  restorePurchasesForUser,
  runPurchasesOperation,
  withPurchasesTimeout,
} from "@/lib/purchasesSetup";

function customerInfo(active: Record<string, unknown> = {}): CustomerInfo {
  return {
    entitlements: { active },
  } as unknown as CustomerInfo;
}

function purchasePackage(identifier: string): PurchasesPackage {
  return { identifier } as unknown as PurchasesPackage;
}

function offerings(): PurchasesOfferings {
  const lifetime = purchasePackage("$rc_lifetime");
  const monthly = purchasePackage("$rc_monthly");
  const annual = purchasePackage("$rc_annual");
  const fallback = purchasePackage("fallback");

  return {
    current: {
      identifier: "warp",
      availablePackages: [fallback],
    },
    all: {
      tapto_basic: {
        identifier: "tapto_basic",
        availablePackages: [lifetime],
        lifetime,
      },
      warp: {
        identifier: "warp",
        availablePackages: [monthly, annual],
        monthly,
        annual,
      },
    },
  } as unknown as PurchasesOfferings;
}

describe("purchasesSetup", () => {
  beforeAll(() => {
    resolvePurchasesReady();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockIsNativePlatform.mockReturnValue(true);
    mockGetAppUserID.mockResolvedValue({ appUserID: "anonymous" });
    mockLogIn.mockResolvedValue({ customerInfo: customerInfo() });
    mockGetCustomerInfo.mockResolvedValue({ customerInfo: customerInfo() });
    mockIsAnonymous.mockResolvedValue({ isAnonymous: false });
    mockLogOut.mockResolvedValue(undefined);
    mockSyncPurchases.mockResolvedValue(undefined);
    mockRestorePurchases.mockResolvedValue({
      customerInfo: customerInfo(),
    });
    mockInvalidateCustomerInfoCache.mockResolvedValue(undefined);
    mockGetOfferings.mockResolvedValue(offerings());
    mockResolveRuntimeReleaseIdentity.mockResolvedValue({
      nativeVersion: "1.13.0",
      nativeBuild: "29",
      liveBundleId: null,
      releaseKey: "native:1.13.0+29",
    });
    mockGetPreferencesState.mockReturnValue({ storeVerifiedProAccess: false });
    vi.stubEnv("VITE_GOOGLE_STORE_API", "test-google-key");
  });

  it("should select Pro only from the explicit Pro offering", () => {
    expect(getProPackage(offerings())?.identifier).toBe("$rc_lifetime");
  });

  it("should require both explicit Warp packages", () => {
    const result = getWarpPackages(offerings());

    expect(result?.monthly.identifier).toBe("$rc_monthly");
    expect(result?.annual.identifier).toBe("$rc_annual");
  });

  it("should parse lifetime and Warp access independently", () => {
    expect(
      getPurchaseAccess(
        customerInfo({ tapto_launcher: { id: "pro" }, warp: { id: "warp" } }),
      ),
    ).toEqual({ lifetimePro: true, warp: true });
    expect(getPurchaseAccess({} as unknown as CustomerInfo)).toEqual({
      lifetimePro: false,
      warp: false,
    });
  });

  it("should avoid logging in again when identity already matches", async () => {
    mockGetAppUserID.mockResolvedValue({ appUserID: "user-123" });
    mockGetCustomerInfo.mockResolvedValue({
      customerInfo: customerInfo({ tapto_launcher: {} }),
    });

    const result = await ensurePurchasesUser("user-123");

    expect(mockLogIn).not.toHaveBeenCalled();
    expect(mockGetCustomerInfo).toHaveBeenCalledOnce();
    expect(getPurchaseAccess(result).lifetimePro).toBe(true);
  });

  it("should log in with the requested account before returning info", async () => {
    await ensurePurchasesUser("user-456");

    expect(mockLogIn).toHaveBeenCalledWith({ appUserID: "user-456" });
  });

  it("should serialize account identity changes", async () => {
    let releaseFirstLogin!: (value: { customerInfo: CustomerInfo }) => void;
    mockLogIn
      .mockImplementationOnce(
        () =>
          new Promise<{ customerInfo: CustomerInfo }>((resolve) => {
            releaseFirstLogin = resolve;
          }),
      )
      .mockResolvedValueOnce({ customerInfo: customerInfo() });

    const first = ensurePurchasesUser("user-a");
    await vi.waitFor(() => {
      expect(mockLogIn).toHaveBeenCalledWith({ appUserID: "user-a" });
    });

    const second = ensurePurchasesUser("user-b");
    expect(mockGetAppUserID).toHaveBeenCalledTimes(1);

    releaseFirstLogin({ customerInfo: customerInfo() });
    await Promise.all([first, second]);

    expect(mockLogIn).toHaveBeenLastCalledWith({ appUserID: "user-b" });
    expect(mockLogIn.mock.invocationCallOrder[0]!).toBeLessThan(
      mockGetAppUserID.mock.invocationCallOrder[1]!,
    );
  });

  it("should reconcile store ownership and refresh CustomerInfo", async () => {
    const reconciled = customerInfo({ tapto_launcher: {} });
    mockGetAppUserID.mockResolvedValue({ appUserID: "user-123" });
    mockGetCustomerInfo
      .mockResolvedValueOnce({ customerInfo: customerInfo() })
      .mockResolvedValueOnce({ customerInfo: reconciled });

    const result = await reconcileStorePurchases("user-123");

    expect(mockSyncPurchases).toHaveBeenCalledOnce();
    expect(mockInvalidateCustomerInfoCache).toHaveBeenCalledOnce();
    expect(getPurchaseAccess(result).lifetimePro).toBe(true);
  });

  it("should restore purchases under the current identity", async () => {
    const restored = customerInfo({ tapto_launcher: {} });
    mockGetAppUserID.mockResolvedValue({ appUserID: "user-123" });
    mockRestorePurchases.mockResolvedValue({ customerInfo: restored });

    await expect(restorePurchasesForUser("user-123")).resolves.toBe(restored);
    expect(mockRestorePurchases).toHaveBeenCalledOnce();
  });

  it("should produce safe, support-ready billing diagnostics", async () => {
    const info = {
      ...customerInfo({ tapto_launcher: {} }),
      originalAppUserId: "$RCAnonymousID:original",
    } as CustomerInfo;
    mockGetAppUserID.mockResolvedValue({
      appUserID: "$RCAnonymousID:current",
    });
    mockGetCustomerInfo.mockResolvedValue({ customerInfo: info });
    mockGetPreferencesState.mockReturnValue({ storeVerifiedProAccess: true });

    const diagnostics = await getBillingDiagnostics("firebase-user-12345678");

    expect(diagnostics).toMatchObject({
      platform: "android",
      appVersion: "1.13.0",
      appBuild: "29",
      releaseKey: "native:1.13.0+29",
      hasStoreApiKey: true,
      revenueCatAppUserID: "$RCAnonymousID:current",
      originalRevenueCatAppUserID: "$RCAnonymousID:original",
      firebaseUserSuffix: "12345678",
      isAnonymous: false,
      activeEntitlements: ["tapto_launcher"],
      storeVerifiedProAccess: true,
      offeringStatus: "available",
      offeringDiagnostics: {
        offeringIdentifier: "tapto_basic",
        offeringFound: true,
        packageIdentifiers: ["$rc_lifetime"],
      },
      lastPurchaseError: {},
    });
    const formatted = formatBillingDiagnostics(diagnostics);
    expect(formatted).toContain("RevenueCat ID: $RCAnonymousID:current");
    expect(formatted).toContain("Store API key present: yes");
    expect(formatted).toContain("Store-verified local Pro fallback: yes");
    expect(formatted).not.toContain("test-google-key");
    expect(formatted).not.toContain("firebase-user-");
    expect(
      formatBillingDiagnostics({
        ...diagnostics,
        lastPurchaseError: {
          code: "3",
          readableErrorCode: "PurchaseNotAllowedError",
          underlyingErrorMessage: "FEATURE_NOT_SUPPORTED",
        },
      }),
    ).toContain("Last underlying store error: FEATURE_NOT_SUPPORTED");
  });

  it("should redact sensitive values from copied underlying store errors", async () => {
    const diagnostics = await getBillingDiagnostics(null);
    const formatted = formatBillingDiagnostics({
      ...diagnostics,
      lastPurchaseError: {
        code: "3",
        readableErrorCode: "PurchaseNotAllowedError",
        underlyingErrorMessage:
          "Store request failed at https://example.com?access_token=private-value",
      },
    });

    expect(formatted).toContain("Last purchase error code: 3");
    expect(formatted).toContain(
      "Last purchase error name: PurchaseNotAllowedError",
    );
    expect(formatted).toContain("access_token=[REDACTED]");
    expect(formatted).not.toContain("private-value");
  });

  it("should report unavailable offerings without a store API key", async () => {
    mockGetOfferings.mockResolvedValue({ current: null, all: {} });
    vi.stubEnv("VITE_GOOGLE_STORE_API", "");

    const diagnostics = await getBillingDiagnostics(null);

    expect(diagnostics.hasStoreApiKey).toBe(false);
    expect(diagnostics.offeringStatus).toBe("missing");
    expect(diagnostics.offeringDiagnostics).toMatchObject({
      offeringFound: false,
      packageIdentifiers: [],
    });
    expect(diagnostics.packagePriceString).toBeNull();
    expect(formatBillingDiagnostics(diagnostics)).toContain(
      "Store API key present: no",
    );
  });

  it("should still report other diagnostics when offerings fail to load", async () => {
    mockGetOfferings.mockRejectedValue(new Error("Network unavailable"));

    const diagnostics = await getBillingDiagnostics(null);

    expect(diagnostics.offeringStatus).toBe("error");
    expect(diagnostics.offeringDiagnostics).toBeNull();
    expect(diagnostics.revenueCatAppUserID).toBe("anonymous");
  });

  it("should return partial diagnostics when identity calls stall or fail", async () => {
    vi.useFakeTimers();
    mockGetAppUserID.mockReturnValue(new Promise(() => undefined));
    mockGetCustomerInfo.mockRejectedValue(new Error("Customer unavailable"));
    mockIsAnonymous.mockReturnValue(new Promise(() => undefined));

    const diagnosticsPromise = getBillingDiagnostics(null);
    await vi.advanceTimersByTimeAsync(5_000);
    const diagnostics = await diagnosticsPromise;

    expect(diagnostics).toMatchObject({
      revenueCatAppUserID: "unavailable",
      originalRevenueCatAppUserID: "unavailable",
      isAnonymous: null,
      activeEntitlements: [],
      offeringStatus: "available",
    });
    expect(formatBillingDiagnostics(diagnostics)).toContain(
      "Anonymous: unknown",
    );
  });

  it("should reject stalled RevenueCat operations at the shared bound", async () => {
    vi.useFakeTimers();
    const result = withPurchasesTimeout(
      new Promise(() => undefined),
      "configure",
    );

    void result.catch(() => undefined);
    await vi.advanceTimersByTimeAsync(5_000);
    await expect(result).rejects.toThrow("RevenueCat configure timed out");
  });

  it("should reject purchase operations on web before using RevenueCat", async () => {
    mockIsNativePlatform.mockReturnValue(false);
    const operation = vi.fn();

    await expect(runPurchasesOperation(null, operation)).rejects.toThrow(
      "require a native platform",
    );

    expect(operation).not.toHaveBeenCalled();
    expect(mockGetCustomerInfo).not.toHaveBeenCalled();
    expect(mockGetAppUserID).not.toHaveBeenCalled();
  });

  it("should reject an operation when its RevenueCat identity changes", async () => {
    mockGetAppUserID
      .mockResolvedValueOnce({ appUserID: "user-123" })
      .mockResolvedValueOnce({ appUserID: "user-456" });

    await expect(
      runPurchasesOperation("user-123", async () => "completed"),
    ).rejects.toBeInstanceOf(PurchaseIdentityError);
  });

  it("should reject an operation when its account guard becomes stale", async () => {
    mockGetAppUserID.mockResolvedValue({ appUserID: "user-123" });
    let current = true;

    await expect(
      runPurchasesOperation(
        "user-123",
        async () => {
          current = false;
          return "completed";
        },
        { isCurrentIdentity: () => current },
      ),
    ).rejects.toBeInstanceOf(PurchaseIdentityError);
  });

  it("should skip logout when the current user is anonymous", async () => {
    mockIsAnonymous.mockResolvedValue({ isAnonymous: true });

    const result = await resetPurchasesUser();

    expect(mockLogOut).not.toHaveBeenCalled();
    expect(mockGetCustomerInfo).toHaveBeenCalledOnce();
    expect(result).toEqual(customerInfo());
  });

  it("should ignore the expected anonymous logout error", async () => {
    mockLogOut.mockRejectedValue(
      new Error("Cannot log out anonymous app user"),
    );

    await expect(resetPurchasesUser()).resolves.toEqual(customerInfo());
    expect(mockGetCustomerInfo).toHaveBeenCalledOnce();
  });

  it("should rethrow unexpected logout errors", async () => {
    const error = new Error("network unavailable");
    mockLogOut.mockRejectedValue(error);

    await expect(resetPurchasesUser()).rejects.toBe(error);
    expect(mockGetCustomerInfo).not.toHaveBeenCalled();
  });
});
