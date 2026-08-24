import { act, render, renderHook, screen, waitFor, within } from "@/test-utils";
import { describe, it, expect, vi, beforeEach } from "vitest";
import userEvent from "@testing-library/user-event";
import {
  PurchaseSupportActions,
  useProPurchase,
} from "@/components/ProPurchase";
import {
  PACKAGE_TYPE,
  PRODUCT_CATEGORY,
  PRODUCT_TYPE,
  type PurchasesOffering,
  type PurchasesOfferings,
  type PurchasesPackage,
  type PurchasesStoreProduct,
} from "@revenuecat/purchases-capacitor";

// Mock external modules
vi.mock("@capacitor/preferences", () => ({
  Preferences: {
    get: vi.fn().mockResolvedValue({ value: null }),
    set: vi.fn().mockResolvedValue(undefined),
    remove: vi.fn().mockResolvedValue(undefined),
    clear: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock("@capacitor/core", () => ({
  Capacitor: {
    getPlatform: vi.fn().mockReturnValue("ios"),
    isNativePlatform: vi.fn().mockReturnValue(true),
    isPluginAvailable: vi.fn().mockReturnValue(true),
  },
}));

const {
  mockCopyDiagnostics,
  mockGetBillingDiagnostics,
  mockReconcileStorePurchases,
  mockRestorePurchasesForUser,
} = vi.hoisted(() => ({
  mockCopyDiagnostics: vi.fn(),
  mockGetBillingDiagnostics: vi.fn(),
  mockReconcileStorePurchases: vi.fn(),
  mockRestorePurchasesForUser: vi.fn(),
}));

vi.mock("@capacitor/clipboard", () => ({
  Clipboard: {
    write: mockCopyDiagnostics,
  },
}));

vi.mock("@/lib/purchasesSetup", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/purchasesSetup")>()),
  getBillingDiagnostics: mockGetBillingDiagnostics,
  purchasesReady: Promise.resolve(),
  reconcileStorePurchases: mockReconcileStorePurchases,
  restorePurchasesForUser: mockRestorePurchasesForUser,
  runPurchasesOperation: async (
    _appUserID: string | null,
    operation: (customerInfo: unknown) => Promise<unknown>,
  ) => operation({}),
}));

vi.mock("@revenuecat/purchases-capacitor", () => ({
  PACKAGE_TYPE: {
    LIFETIME: "LIFETIME",
  },
  PRODUCT_CATEGORY: {
    NON_SUBSCRIPTION: "NON_SUBSCRIPTION",
  },
  PRODUCT_TYPE: {
    NON_CONSUMABLE: "NON_CONSUMABLE",
  },
  Purchases: {
    restorePurchases: vi.fn(),
    getCustomerInfo: vi.fn(),
    getOfferings: vi.fn(),
    purchasePackage: vi.fn(),
  },
}));

vi.mock("react-hot-toast", () => ({
  default: {
    success: vi.fn(),
    error: vi.fn(),
    dismiss: vi.fn(),
  },
}));

vi.mock("@/hooks/useHaptics", () => ({
  useHaptics: () => ({
    impact: vi.fn(),
    notification: vi.fn(),
    vibrate: vi.fn(),
  }),
}));

vi.mock("@/lib/logger", () => ({
  logger: {
    log: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

const mockSetLaunchOnScan = vi.fn();

const { mockT } = vi.hoisted(() => ({
  mockT: (key: string, options?: Record<string, string>) => {
    if (key === "scan.purchaseProP1" && options?.price) {
      return `${key} ${options.price}`;
    }

    return key;
  },
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: mockT,
    i18n: { changeLanguage: vi.fn() },
  }),
}));

// Mock i18next for direct t() imports used in ProPurchase component
vi.mock("i18next", () => ({
  t: mockT,
}));

const presentedOfferingContext = {
  offeringIdentifier: "tapto_basic",
  placementIdentifier: null,
  targetingContext: null,
} as const;

function createProduct(): PurchasesStoreProduct {
  return {
    identifier: "tapto_launcher",
    description: "TapTo Launcher",
    title: "TapTo Launcher",
    price: 6.99,
    priceString: "$6.99",
    pricePerWeek: null,
    pricePerMonth: null,
    pricePerYear: null,
    pricePerWeekString: null,
    pricePerMonthString: null,
    pricePerYearString: null,
    currencyCode: "USD",
    introPrice: null,
    discounts: null,
    productCategory: PRODUCT_CATEGORY.NON_SUBSCRIPTION,
    productType: PRODUCT_TYPE.NON_CONSUMABLE,
    subscriptionPeriod: null,
    defaultOption: null,
    subscriptionOptions: null,
    presentedOfferingIdentifier: "tapto_basic",
    presentedOfferingContext,
  };
}

function createPackage(): PurchasesPackage {
  return {
    identifier: "$rc_lifetime",
    packageType: PACKAGE_TYPE.LIFETIME,
    product: createProduct(),
    offeringIdentifier: "tapto_basic",
    presentedOfferingContext,
    webCheckoutUrl: null,
  };
}

function createOffering(
  availablePackages: PurchasesPackage[] = [],
): PurchasesOffering {
  return {
    identifier: "tapto_basic",
    serverDescription: "Pro offering",
    metadata: {},
    availablePackages,
    lifetime: null,
    annual: null,
    sixMonth: null,
    threeMonth: null,
    twoMonth: null,
    monthly: null,
    weekly: null,
    webCheckoutUrl: null,
  };
}

function createOfferings(
  current: PurchasesOffering | null = createOffering(),
): PurchasesOfferings {
  return {
    current,
    all: current ? { [current.identifier]: current } : {},
  };
}

function ProPurchaseHarness() {
  const { purchaseModal, setProPurchaseModalOpen } = useProPurchase();

  return (
    <>
      <button type="button" onClick={() => setProPurchaseModalOpen(true)}>
        Open Pro purchase
      </button>
      {purchaseModal}
    </>
  );
}

describe("useProPurchase", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    // Reset store state
    const { usePreferencesStore } = await import("@/lib/preferencesStore");
    usePreferencesStore.setState({
      launcherAccess: false,
      lifetimeProAccess: false,
      storeVerifiedProAccess: false,
      onlinePremiumAccess: false,
      launchOnScan: false,
      setLaunchOnScan: mockSetLaunchOnScan,
    });
    const { useStatusStore } = await import("@/lib/store");
    useStatusStore.setState({
      loggedInUser: null,
      proPurchaseModalOpen: false,
    });
    mockCopyDiagnostics.mockResolvedValue(undefined);
    mockGetBillingDiagnostics.mockResolvedValue({
      platform: "android",
      appVersion: "1.13.0",
      appBuild: "29",
      releaseKey: "native:1.13.0+29",
      hasStoreApiKey: true,
      revenueCatAppUserID: "$RCAnonymousID:current",
      originalRevenueCatAppUserID: "$RCAnonymousID:original",
      firebaseUserSuffix: "signed-out",
      isAnonymous: true,
      activeEntitlements: [],
      storeVerifiedProAccess: false,
      offeringStatus: "available",
      offeringDiagnostics: {
        offeringIdentifier: "tapto_basic",
        offeringFound: true,
        packageIdentifiers: ["$rc_lifetime"],
      },
      packagePriceString: "$6.99",
      lastPurchaseError: {},
    });
    mockReconcileStorePurchases.mockResolvedValue({
      entitlements: { active: {} },
    });
    mockRestorePurchasesForUser.mockResolvedValue({
      entitlements: { active: {} },
    });
    const { clearCachedPurchaseErrorDiagnostics } =
      await import("@/lib/purchaseReportContext");
    clearCachedPurchaseErrorDiagnostics();
    const { Capacitor } = await import("@capacitor/core");
    vi.mocked(Capacitor.getPlatform).mockReturnValue("ios");
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);
    // Set up default mock returns for the hook
    const { Purchases } = await import("@revenuecat/purchases-capacitor");
    vi.mocked(Purchases.getOfferings).mockResolvedValue(createOfferings());
    vi.mocked(Purchases.getCustomerInfo).mockResolvedValue({
      customerInfo: {
        entitlements: {
          active: {},
        },
      },
    } as any);
  });

  it("should slide the mounted purchase modal open", async () => {
    const user = userEvent.setup();
    render(<ProPurchaseHarness />);
    const dialog = screen
      .getByText("scan.purchaseProTitle")
      .closest('[role="dialog"]')!;

    expect(dialog).toHaveStyle({ transform: "translate3d(0, 100%, 0)" });

    await user.click(screen.getByRole("button", { name: "Open Pro purchase" }));

    expect(screen.getByRole("dialog")).toBe(dialog);
    expect(dialog).toHaveStyle({ transform: "translate3d(0, 0, 0)" });
  });

  it("should read proAccess from store", async () => {
    const { result } = renderHook(() => useProPurchase());

    expect(result.current.proAccess).toBe(false);
    expect(result.current.proPurchaseModalOpen).toBe(false);

    // Wait for any async effects to settle
    await waitFor(() => {
      expect(result.current.proAccess).toBe(false);
    });
  });

  it("should reflect store state when lifetime Pro access is true", async () => {
    const { usePreferencesStore } = await import("@/lib/preferencesStore");
    usePreferencesStore.setState({
      launcherAccess: true,
      lifetimeProAccess: true,
    });

    const { result } = renderHook(() => useProPurchase());

    expect(result.current.proAccess).toBe(true);

    // Wait for any async effects to settle
    await waitFor(() => {
      expect(result.current.proAccess).toBe(true);
    });
  });

  it("should skip initialization on web platform", async () => {
    const { Capacitor } = await import("@capacitor/core");
    const { Purchases } = await import("@revenuecat/purchases-capacitor");
    vi.mocked(Capacitor.getPlatform).mockReturnValue("web");
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(false);

    renderHook(() => useProPurchase());

    // Verify that on web platform, no RevenueCat calls are made
    // Use waitFor to allow any async effects to complete
    await waitFor(() => {
      expect(Purchases.getOfferings).not.toHaveBeenCalled();
    });
    expect(Purchases.getCustomerInfo).not.toHaveBeenCalled();
  });

  it("should fetch offerings and customer info on mobile platforms when not hydrated", async () => {
    const { Capacitor } = await import("@capacitor/core");
    vi.mocked(Capacitor.getPlatform).mockReturnValue("ios"); // Ensure non-web platform

    // Set not hydrated so getCustomerInfo is called
    const { usePreferencesStore } = await import("@/lib/preferencesStore");
    usePreferencesStore.setState({
      _proAccessHydrated: false,
      launcherAccess: false,
      lifetimeProAccess: false,
    });

    const mockOfferings = createOfferings(createOffering([createPackage()]));

    const mockCustomerInfo = {
      customerInfo: {
        entitlements: {
          active: {
            tapto_launcher: true,
          },
        },
      },
    } as any;

    const { Purchases } = await import("@revenuecat/purchases-capacitor");
    vi.mocked(Purchases.getOfferings).mockResolvedValue(mockOfferings);
    vi.mocked(Purchases.getCustomerInfo).mockResolvedValue(mockCustomerInfo);

    const { result } = renderHook(() => useProPurchase());

    await waitFor(() => {
      expect(Purchases.getOfferings).toHaveBeenCalled();
      expect(Purchases.getCustomerInfo).toHaveBeenCalled();
      expect(result.current.proAccess).toBe(true);
    });
  });

  it("should show unavailable state and report when offerings have no packages", async () => {
    const user = userEvent.setup();
    const { Purchases } = await import("@revenuecat/purchases-capacitor");
    const { logger } = await import("@/lib/logger");
    vi.mocked(Purchases.getOfferings).mockResolvedValue(createOfferings());

    render(<ProPurchaseHarness />);

    await waitFor(() => {
      expect(logger.error).toHaveBeenCalledWith(
        "RevenueCat offerings returned no packages",
        expect.objectContaining({
          platform: "ios",
          offeringIdentifier: "tapto_basic",
          offeringFound: true,
          packageIdentifiers: [],
        }),
        {
          category: "purchase",
          action: "getOfferings",
          severity: "warning",
        },
      );
    });
    await user.click(screen.getByRole("button", { name: "Open Pro purchase" }));

    expect(screen.getByText("scan.purchaseProUnavailable")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "scan.purchaseProUnavailableAction" }),
    ).toBeDisabled();
    expect(
      screen.queryByRole("button", { name: "settings.app.restorePurchases" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: "settings.app.copyBillingDiagnostics",
      }),
    ).toBeInTheDocument();
  });

  it("should treat a store product-unavailable rejection like an unavailable offering", async () => {
    const user = userEvent.setup();
    const { Purchases } = await import("@revenuecat/purchases-capacitor");
    vi.mocked(Purchases.getOfferings).mockRejectedValue({
      code: "5",
      message: "This item is not available in your country.",
    });

    render(<ProPurchaseHarness />);
    await waitFor(() => expect(Purchases.getOfferings).toHaveBeenCalled());
    await user.click(screen.getByRole("button", { name: "Open Pro purchase" }));

    expect(screen.getByText("scan.purchaseProUnavailable")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "settings.app.restorePurchases" }),
    ).not.toBeInTheDocument();
  });

  it("should show error state and report when offerings fail to load", async () => {
    const user = userEvent.setup();
    const { Purchases } = await import("@revenuecat/purchases-capacitor");
    const { logger } = await import("@/lib/logger");
    const error = new Error("Network unavailable");
    vi.mocked(Purchases.getOfferings).mockRejectedValue(error);

    render(<ProPurchaseHarness />);

    await waitFor(() => {
      expect(logger.error).toHaveBeenCalledWith(
        "RevenueCat offerings unavailable",
        error,
        {
          category: "purchase",
          action: "getOfferings",
          severity: "warning",
          purchaseError: {
            code: undefined,
            readableErrorCode: undefined,
            underlyingErrorMessage: undefined,
            userCancelled: undefined,
          },
        },
      );
    });
    await user.click(screen.getByRole("button", { name: "Open Pro purchase" }));

    expect(
      screen.getByText("scan.purchaseProOfferingsError"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "scan.purchaseProUnavailableAction" }),
    ).toBeDisabled();
    expect(
      screen.queryByRole("button", { name: "settings.app.restorePurchases" }),
    ).not.toBeInTheDocument();
  });

  it("should distinguish a store eligibility failure and expose diagnostics", async () => {
    const user = userEvent.setup();
    const { Purchases } = await import("@revenuecat/purchases-capacitor");
    const { logger } = await import("@/lib/logger");
    vi.mocked(Purchases.getOfferings).mockRejectedValue({
      message: "The device or user is not allowed to make the purchase.",
      code: "3",
      data: {
        code: 3,
        readableErrorCode: "PurchaseNotAllowedError",
        underlyingErrorMessage: "Billing response: not allowed",
      },
    });

    render(<ProPurchaseHarness />);

    await waitFor(() => {
      expect(logger.error).toHaveBeenCalledWith(
        "RevenueCat offerings unavailable",
        expect.any(Error),
        expect.objectContaining({
          action: "getOfferings",
          purchaseError: {
            code: "3",
            readableErrorCode: "PurchaseNotAllowedError",
            underlyingErrorMessage: "Billing response: not allowed",
            userCancelled: undefined,
          },
        }),
      );
    });
    await user.click(screen.getByRole("button", { name: "Open Pro purchase" }));

    expect(screen.getByText("scan.purchaseProNotAllowed")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "settings.app.restorePurchases" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: "settings.app.copyBillingDiagnostics",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "scan.purchaseProUnavailableAction" }),
    ).toBeDisabled();
  });

  it("should show fetched package price without a duplicate restore action", async () => {
    const user = userEvent.setup();
    const { Purchases } = await import("@revenuecat/purchases-capacitor");
    vi.mocked(Purchases.getOfferings).mockResolvedValue(
      createOfferings(createOffering([createPackage()])),
    );

    render(<ProPurchaseHarness />);

    await waitFor(() => {
      expect(Purchases.getOfferings).toHaveBeenCalled();
    });
    await user.click(screen.getByRole("button", { name: "Open Pro purchase" }));

    expect(
      await screen.findByText("scan.purchaseProP1 $6.99"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "scan.purchaseProAction" }),
    ).toBeEnabled();
    expect(
      screen.queryByRole("button", { name: "settings.app.restorePurchases" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", {
        name: "settings.app.copyBillingDiagnostics",
      }),
    ).not.toBeInTheDocument();
  });

  it("should preserve checkout diagnostics when offerings reload successfully", async () => {
    const user = userEvent.setup();
    const { Purchases } = await import("@revenuecat/purchases-capacitor");
    const { cachePurchaseErrorDiagnostics, getCachedPurchaseErrorDiagnostics } =
      await import("@/lib/purchaseReportContext");
    vi.mocked(Purchases.getOfferings).mockResolvedValue(
      createOfferings(createOffering([createPackage()])),
    );
    cachePurchaseErrorDiagnostics({ code: "3" }, "purchasePackage");

    render(<ProPurchaseHarness />);
    await user.click(screen.getByRole("button", { name: "Open Pro purchase" }));
    await screen.findByRole("button", { name: "scan.purchaseProAction" });

    expect(getCachedPurchaseErrorDiagnostics()).toEqual({ code: "3" });
  });

  it("should preserve checkout diagnostics when offerings fail without structured details", async () => {
    const { Purchases } = await import("@revenuecat/purchases-capacitor");
    const { cachePurchaseErrorDiagnostics, getCachedPurchaseErrorDiagnostics } =
      await import("@/lib/purchaseReportContext");
    vi.mocked(Purchases.getOfferings).mockRejectedValue(
      new Error("Network unavailable"),
    );
    cachePurchaseErrorDiagnostics({ code: "3" }, "purchasePackage");

    render(<ProPurchaseHarness />);
    await waitFor(() => expect(Purchases.getOfferings).toHaveBeenCalled());

    expect(getCachedPurchaseErrorDiagnostics()).toEqual({ code: "3" });
  });

  it("should ignore repeat activations and block dismissal while purchasing", async () => {
    const user = userEvent.setup();
    const { Purchases } = await import("@revenuecat/purchases-capacitor");
    let resolvePurchase:
      | ((value: Awaited<ReturnType<typeof Purchases.purchasePackage>>) => void)
      | undefined;
    vi.mocked(Purchases.getOfferings).mockResolvedValue(
      createOfferings(createOffering([createPackage()])),
    );
    vi.mocked(Purchases.purchasePackage).mockReturnValue(
      new Promise((resolve) => {
        resolvePurchase = resolve;
      }) as ReturnType<typeof Purchases.purchasePackage>,
    );

    render(<ProPurchaseHarness />);
    await user.click(screen.getByRole("button", { name: "Open Pro purchase" }));
    const purchaseButton = await screen.findByRole("button", {
      name: "scan.purchaseProAction",
    });
    const dialog = screen.getByRole("dialog", {
      name: "scan.purchaseProTitle",
    });

    await user.dblClick(purchaseButton);

    expect(Purchases.purchasePackage).toHaveBeenCalledTimes(1);
    expect(
      within(dialog).getByRole("button", { name: "loading" }),
    ).toBeDisabled();
    expect(
      within(dialog).queryByRole("button", { name: "nav.close" }),
    ).not.toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.getByRole("dialog", { name: "scan.purchaseProTitle" })).toBe(
      dialog,
    );

    act(() => {
      resolvePurchase?.({
        customerInfo: {
          entitlements: { active: { tapto_launcher: {} } },
        },
      } as never);
    });
    await waitFor(() => {
      expect(dialog).toHaveStyle({ transform: "translate3d(0, 100%, 0)" });
    });
  });

  it("should never buy the current Warp package as Pro", async () => {
    const user = userEvent.setup();
    const { Purchases } = await import("@revenuecat/purchases-capacitor");
    const proPackage = createPackage();
    const warpPackage = {
      ...createPackage(),
      identifier: "$rc_annual",
      offeringIdentifier: "warp",
    } as PurchasesPackage;
    const proOffering = createOffering([proPackage]);
    const warpOffering = {
      ...createOffering([warpPackage]),
      identifier: "warp",
    };
    vi.mocked(Purchases.getOfferings).mockResolvedValue({
      current: warpOffering,
      all: { tapto_basic: proOffering, warp: warpOffering },
    });
    vi.mocked(Purchases.purchasePackage).mockResolvedValue({
      customerInfo: {
        entitlements: { active: { tapto_launcher: {} } },
      },
    } as never);

    render(<ProPurchaseHarness />);
    const dialog = screen
      .getByText("scan.purchaseProTitle")
      .closest('[role="dialog"]')!;
    await waitFor(() => expect(Purchases.getOfferings).toHaveBeenCalled());
    await user.click(screen.getByRole("button", { name: "Open Pro purchase" }));
    await user.click(
      await screen.findByRole("button", { name: "scan.purchaseProAction" }),
    );

    const { usePreferencesStore } = await import("@/lib/preferencesStore");
    await waitFor(() => {
      expect(Purchases.purchasePackage).toHaveBeenCalledWith({
        aPackage: proPackage,
      });
      expect(usePreferencesStore.getState().lifetimeProAccess).toBe(true);
      expect(mockSetLaunchOnScan).toHaveBeenCalledWith(true);
      expect(dialog).toHaveStyle({ transform: "translate3d(0, 100%, 0)" });
    });
    expect(
      screen.queryByRole("dialog", { name: "scan.purchaseProTitle" }),
    ).not.toBeInTheDocument();
  });

  it("should reconcile store ownership before failing a charged purchase with no entitlement yet", async () => {
    const user = userEvent.setup();
    const { Purchases } = await import("@revenuecat/purchases-capacitor");
    const toast = (await import("react-hot-toast")).default;
    vi.mocked(Purchases.getOfferings).mockResolvedValue(
      createOfferings(createOffering([createPackage()])),
    );
    vi.mocked(Purchases.purchasePackage).mockResolvedValue({
      customerInfo: { entitlements: { active: {} } },
    } as never);
    mockReconcileStorePurchases.mockResolvedValue({
      entitlements: { active: { tapto_launcher: {} } },
    });

    render(<ProPurchaseHarness />);
    await waitFor(() => expect(Purchases.getOfferings).toHaveBeenCalled());
    await user.click(screen.getByRole("button", { name: "Open Pro purchase" }));
    await user.click(
      await screen.findByRole("button", { name: "scan.purchaseProAction" }),
    );

    const { usePreferencesStore } = await import("@/lib/preferencesStore");
    await waitFor(() => {
      expect(mockReconcileStorePurchases).toHaveBeenCalledWith(null);
      expect(usePreferencesStore.getState().lifetimeProAccess).toBe(true);
    });
    expect(toast.error).not.toHaveBeenCalledWith("scan.purchaseProFailed");
    expect(
      screen.queryByRole("dialog", { name: "scan.purchaseProTitle" }),
    ).not.toBeInTheDocument();
  });

  it("should show a purchase error without enabling launch on scan", async () => {
    const user = userEvent.setup();
    const { Purchases } = await import("@revenuecat/purchases-capacitor");
    const toast = (await import("react-hot-toast")).default;
    vi.mocked(Purchases.getOfferings).mockResolvedValue(
      createOfferings(createOffering([createPackage()])),
    );
    vi.mocked(Purchases.purchasePackage).mockRejectedValue(
      new Error("payment declined"),
    );

    render(<ProPurchaseHarness />);
    await waitFor(() => expect(Purchases.getOfferings).toHaveBeenCalled());
    await user.click(screen.getByRole("button", { name: "Open Pro purchase" }));
    await user.click(
      await screen.findByRole("button", { name: "scan.purchaseProAction" }),
    );

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("scan.purchaseProFailed");
    });
    expect(mockSetLaunchOnScan).not.toHaveBeenCalled();
    expect(
      screen.getByRole("dialog", { name: "scan.purchaseProTitle" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "scan.purchaseProAction" }),
    ).toBeEnabled();
  });

  it("should not replace useful diagnostics when the user cancels", async () => {
    const user = userEvent.setup();
    const { Purchases } = await import("@revenuecat/purchases-capacitor");
    const { cachePurchaseErrorDiagnostics, getCachedPurchaseErrorDiagnostics } =
      await import("@/lib/purchaseReportContext");
    vi.mocked(Purchases.getOfferings).mockResolvedValue(
      createOfferings(createOffering([createPackage()])),
    );
    vi.mocked(Purchases.purchasePackage).mockRejectedValue({
      code: "1",
      message: "Purchase was cancelled.",
      data: {
        code: 1,
        readableErrorCode: "PurchaseCancelledError",
        userCancelled: true,
      },
    });

    render(<ProPurchaseHarness />);
    await waitFor(() => expect(Purchases.getOfferings).toHaveBeenCalled());
    cachePurchaseErrorDiagnostics({ code: "3" }, "getOfferings");
    await user.click(screen.getByRole("button", { name: "Open Pro purchase" }));
    await user.click(
      await screen.findByRole("button", { name: "scan.purchaseProAction" }),
    );

    await waitFor(() => {
      expect(Purchases.purchasePackage).toHaveBeenCalledTimes(1);
      expect(
        screen.getByRole("button", { name: "scan.purchaseProAction" }),
      ).toBeEnabled();
    });
    expect(getCachedPurchaseErrorDiagnostics()).toEqual({ code: "3" });
  });

  it("should recover an already-owned Pro purchase without another charge", async () => {
    const user = userEvent.setup();
    const { Purchases } = await import("@revenuecat/purchases-capacitor");
    const { logger } = await import("@/lib/logger");
    vi.mocked(Purchases.getOfferings).mockResolvedValue(
      createOfferings(createOffering([createPackage()])),
    );
    vi.mocked(Purchases.purchasePackage).mockRejectedValue({
      code: "6",
      message: "This product is already active for the user.",
      userInfo: { readableErrorCode: "ProductAlreadyPurchasedError" },
    });

    render(<ProPurchaseHarness />);
    await waitFor(() => expect(Purchases.getOfferings).toHaveBeenCalled());
    await user.click(screen.getByRole("button", { name: "Open Pro purchase" }));
    await user.click(
      await screen.findByRole("button", { name: "scan.purchaseProAction" }),
    );

    const { usePreferencesStore } = await import("@/lib/preferencesStore");
    await waitFor(() => {
      expect(mockReconcileStorePurchases).toHaveBeenCalledWith(null);
      expect(usePreferencesStore.getState().storeVerifiedProAccess).toBe(true);
      expect(usePreferencesStore.getState().lifetimeProAccess).toBe(true);
      expect(logger.error).toHaveBeenCalledWith(
        "Pro access recovered from store ownership",
        expect.any(Error),
        expect.objectContaining({ action: "alreadyOwnedFallback" }),
      );
    });
    expect(
      screen.queryByRole("dialog", { name: "scan.purchaseProTitle" }),
    ).not.toBeInTheDocument();
  });

  it("should restore Pro from the general purchase support controls", async () => {
    const user = userEvent.setup();
    mockRestorePurchasesForUser.mockResolvedValue({
      entitlements: { active: { tapto_launcher: {} } },
    });

    render(<PurchaseSupportActions />);
    await user.click(
      screen.getByRole("button", { name: "settings.app.restorePurchases" }),
    );

    const { usePreferencesStore } = await import("@/lib/preferencesStore");
    await waitFor(() => {
      expect(mockRestorePurchasesForUser).toHaveBeenCalledWith(null);
      expect(usePreferencesStore.getState().lifetimeProAccess).toBe(true);
    });
  });

  it("should preserve store-verified Pro when RevenueCat restore finds no purchases", async () => {
    const user = userEvent.setup();
    const { usePreferencesStore } = await import("@/lib/preferencesStore");
    usePreferencesStore.setState({
      storeVerifiedProAccess: true,
      lifetimeProAccess: true,
    });
    mockRestorePurchasesForUser.mockResolvedValue({
      entitlements: { active: {} },
    });

    render(<PurchaseSupportActions />);
    await user.click(
      screen.getByRole("button", { name: "settings.app.restorePurchases" }),
    );

    await waitFor(() => {
      expect(usePreferencesStore.getState().storeVerifiedProAccess).toBe(true);
      expect(usePreferencesStore.getState().lifetimeProAccess).toBe(true);
    });
  });

  it("should activate restored Warp access for the signed-in account", async () => {
    const user = userEvent.setup();
    const { useStatusStore } = await import("@/lib/store");
    useStatusStore.setState({
      loggedInUser: { uid: "firebase-user-123" } as never,
    });
    mockRestorePurchasesForUser.mockResolvedValue({
      entitlements: { active: { warp: {} } },
    });

    render(<PurchaseSupportActions />);
    await user.click(
      screen.getByRole("button", { name: "settings.app.restorePurchases" }),
    );

    const { usePreferencesStore } = await import("@/lib/preferencesStore");
    await waitFor(() => {
      expect(mockRestorePurchasesForUser).toHaveBeenCalledWith(
        "firebase-user-123",
      );
      expect(usePreferencesStore.getState().onlinePremiumAccess).toBe(true);
      expect(usePreferencesStore.getState().launcherAccess).toBe(true);
    });
  });

  it("should copy pseudonymous billing diagnostics", async () => {
    const user = userEvent.setup();

    render(<PurchaseSupportActions />);
    await user.click(
      screen.getByRole("button", {
        name: "settings.app.copyBillingDiagnostics",
      }),
    );

    await waitFor(() => {
      expect(mockGetBillingDiagnostics).toHaveBeenCalledWith(null);
      expect(mockCopyDiagnostics).toHaveBeenCalledWith({
        string: expect.stringContaining(
          "RevenueCat ID: $RCAnonymousID:current",
        ),
      });
    });
  });

  it("should put emergency restore below billing diagnostics", () => {
    render(<PurchaseSupportActions />);

    expect(
      screen.getAllByRole("button").map((button) => button.textContent),
    ).toEqual([
      "settings.app.copyBillingDiagnostics",
      "settings.app.restorePurchases",
    ]);
  });

  it("should show only the restore action for the restoreOnly variant", () => {
    render(<PurchaseSupportActions variant="restoreOnly" />);

    expect(
      screen.getByRole("button", { name: "settings.app.restorePurchases" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", {
        name: "settings.app.copyBillingDiagnostics",
      }),
    ).not.toBeInTheDocument();
  });

  it("should show only the diagnostics action for the diagnosticsOnly variant", () => {
    render(<PurchaseSupportActions variant="diagnosticsOnly" />);

    expect(
      screen.getByRole("button", {
        name: "settings.app.copyBillingDiagnostics",
      }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "settings.app.restorePurchases" }),
    ).not.toBeInTheDocument();
  });

  it("should show unsupported state on web platform", async () => {
    const { Capacitor } = await import("@capacitor/core");
    const { Purchases } = await import("@revenuecat/purchases-capacitor");
    vi.mocked(Capacitor.getPlatform).mockReturnValue("web");
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(false);

    const user = userEvent.setup();
    render(<ProPurchaseHarness />);

    await waitFor(() => {
      expect(Purchases.getOfferings).not.toHaveBeenCalled();
    });
    await user.click(screen.getByRole("button", { name: "Open Pro purchase" }));

    expect(screen.getByText("scan.purchaseProUnavailable")).toBeInTheDocument();
    expect(screen.queryByText(/\$6\.99/)).not.toBeInTheDocument();
  });

  it("should keep purchase modal hidden until opened", () => {
    render(<ProPurchaseHarness />);

    expect(
      screen.queryByRole("dialog", { name: /scan\.purchaseProTitle/i }),
    ).not.toBeInTheDocument();
  });
});
