import { act, render, renderHook, screen, waitFor } from "@/test-utils";
import { describe, it, expect, vi, beforeEach } from "vitest";
import userEvent from "@testing-library/user-event";
import { useProPurchase } from "@/components/ProPurchase";
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

vi.mock("@/lib/purchasesSetup", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/purchasesSetup")>()),
  purchasesReady: Promise.resolve(),
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

describe("useProPurchase", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    // Reset store state
    const { usePreferencesStore } = await import("@/lib/preferencesStore");
    usePreferencesStore.setState({
      launcherAccess: false,
      lifetimeProAccess: false,
      onlinePremiumAccess: false,
      launchOnScan: false,
      setLaunchOnScan: mockSetLaunchOnScan,
    });
    const { useStatusStore } = await import("@/lib/store");
    useStatusStore.setState({ proPurchaseModalOpen: false });
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
    const { Purchases } = await import("@revenuecat/purchases-capacitor");
    const { logger } = await import("@/lib/logger");
    vi.mocked(Purchases.getOfferings).mockResolvedValue(createOfferings());

    const { result } = renderHook(() => useProPurchase());

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

    act(() => {
      result.current.setProPurchaseModalOpen(true);
    });

    const PurchaseModalComponent = result.current.PurchaseModal;
    render(<PurchaseModalComponent />);

    expect(screen.getByText("scan.purchaseProUnavailable")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "scan.purchaseProUnavailableAction" }),
    ).toBeDisabled();
  });

  it("should show error state and report when offerings fail to load", async () => {
    const { Purchases } = await import("@revenuecat/purchases-capacitor");
    const { logger } = await import("@/lib/logger");
    const error = new Error("Network unavailable");
    vi.mocked(Purchases.getOfferings).mockRejectedValue(error);

    const { result } = renderHook(() => useProPurchase());

    await waitFor(() => {
      expect(logger.error).toHaveBeenCalledWith(
        "RevenueCat offerings unavailable",
        error,
        {
          category: "purchase",
          action: "getOfferings",
          severity: "warning",
        },
      );
    });

    act(() => {
      result.current.setProPurchaseModalOpen(true);
    });

    const PurchaseModalComponent = result.current.PurchaseModal;
    render(<PurchaseModalComponent />);

    expect(
      screen.getByText("scan.purchaseProOfferingsError"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "scan.purchaseProUnavailableAction" }),
    ).toBeDisabled();
  });

  it("should show fetched package price and enable purchase action", async () => {
    const { Purchases } = await import("@revenuecat/purchases-capacitor");
    vi.mocked(Purchases.getOfferings).mockResolvedValue(
      createOfferings(createOffering([createPackage()])),
    );

    const { result } = renderHook(() => useProPurchase());

    await waitFor(() => {
      expect(Purchases.getOfferings).toHaveBeenCalled();
    });

    act(() => {
      result.current.setProPurchaseModalOpen(true);
    });

    const PurchaseModalComponent = result.current.PurchaseModal;
    render(<PurchaseModalComponent />);

    expect(screen.getByText("scan.purchaseProP1 $6.99")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "scan.purchaseProAction" }),
    ).toBeEnabled();
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

    const { result } = renderHook(() => useProPurchase());
    await waitFor(() => expect(Purchases.getOfferings).toHaveBeenCalled());
    act(() => result.current.setProPurchaseModalOpen(true));
    render(<result.current.PurchaseModal />);

    await user.click(
      screen.getByRole("button", { name: "scan.purchaseProAction" }),
    );

    const { usePreferencesStore } = await import("@/lib/preferencesStore");
    await waitFor(() => {
      expect(Purchases.purchasePackage).toHaveBeenCalledWith({
        aPackage: proPackage,
      });
      expect(usePreferencesStore.getState().lifetimeProAccess).toBe(true);
      expect(mockSetLaunchOnScan).toHaveBeenCalledWith(true);
      expect(result.current.proPurchaseModalOpen).toBe(false);
    });
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

    const { result } = renderHook(() => useProPurchase());
    await waitFor(() => expect(Purchases.getOfferings).toHaveBeenCalled());
    act(() => result.current.setProPurchaseModalOpen(true));
    render(<result.current.PurchaseModal />);

    await user.click(
      screen.getByRole("button", { name: "scan.purchaseProAction" }),
    );

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("scan.purchaseProFailed");
    });
    expect(mockSetLaunchOnScan).not.toHaveBeenCalled();
    expect(result.current.proPurchaseModalOpen).toBe(true);
  });

  it("should show unsupported state on web platform", async () => {
    const { Capacitor } = await import("@capacitor/core");
    const { Purchases } = await import("@revenuecat/purchases-capacitor");
    vi.mocked(Capacitor.getPlatform).mockReturnValue("web");
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(false);

    const { result } = renderHook(() => useProPurchase());

    await waitFor(() => {
      expect(Purchases.getOfferings).not.toHaveBeenCalled();
    });

    act(() => {
      result.current.setProPurchaseModalOpen(true);
    });

    const PurchaseModalComponent = result.current.PurchaseModal;
    render(<PurchaseModalComponent />);

    expect(screen.getByText("scan.purchaseProUnavailable")).toBeInTheDocument();
    expect(screen.queryByText(/\$6\.99/)).not.toBeInTheDocument();
  });

  it("should render PurchaseModal component", async () => {
    const { result } = renderHook(() => useProPurchase());

    const PurchaseModalComponent = result.current.PurchaseModal;
    render(<PurchaseModalComponent />);

    // Modal should not be visible initially (proPurchaseModalOpen is false)
    expect(
      screen.queryByRole("dialog", { name: /scan\.purchaseProTitle/i }),
    ).not.toBeInTheDocument();
  });

  it("should open purchase modal", async () => {
    const { result } = renderHook(() => useProPurchase());

    act(() => {
      result.current.setProPurchaseModalOpen(true);
    });

    const PurchaseModalComponent = result.current.PurchaseModal;
    render(<PurchaseModalComponent />);

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    // Title may appear multiple times due to test-utils wrapper
    const titles = screen.getAllByText("scan.purchaseProTitle");
    expect(titles.length).toBeGreaterThan(0);
  });
});
