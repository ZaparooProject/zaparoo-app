import {
  render,
  screen,
  fireEvent,
  waitFor,
  renderHook,
  act,
} from "../../../test-utils";
import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";
import {
  RestorePuchasesButton,
  useProPurchase,
} from "@/components/ProPurchase";

// Mock external modules
vi.mock("@capacitor/preferences", () => ({
  Preferences: {
    get: vi.fn(),
    set: vi.fn().mockResolvedValue(undefined),
    remove: vi.fn().mockResolvedValue(undefined),
    clear: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock("@capacitor/core", () => ({
  Capacitor: {
    getPlatform: vi.fn().mockReturnValue("ios"),
    isNativePlatform: vi.fn().mockReturnValue(true),
  },
}));

vi.mock("@revenuecat/purchases-capacitor", () => ({
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

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { changeLanguage: vi.fn() },
  }),
}));

// Mock i18next for direct t() imports used in ProPurchase component
vi.mock("i18next", () => ({
  t: (key: string) => key,
}));

describe("RestorePuchasesButton", () => {
  beforeAll(() => {
    Object.defineProperty(window, "location", {
      value: {
        reload: vi.fn(),
      },
      writable: true,
    });
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should render restore purchases button", () => {
    render(<RestorePuchasesButton />);

    const button = screen.getByRole("button", {
      name: "settings.app.restorePurchases",
    });
    expect(button).toBeInTheDocument();
  });

  it("should handle successful restore with active entitlement", async () => {
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
    vi.mocked(Purchases.restorePurchases).mockResolvedValue({} as any);
    vi.mocked(Purchases.getCustomerInfo).mockResolvedValue(mockCustomerInfo);

    render(<RestorePuchasesButton />);

    const button = screen.getByRole("button", {
      name: "settings.app.restorePurchases",
    });
    fireEvent.click(button);

    await waitFor(() => {
      expect(Purchases.restorePurchases).toHaveBeenCalled();
      expect(Purchases.getCustomerInfo).toHaveBeenCalled();
    });

    const { Preferences } = await import("@capacitor/preferences");
    // Preferences.set is now called with app-preferences key and full state
    expect(Preferences.set).toHaveBeenCalled();
    const setCall = vi.mocked(Preferences.set).mock.calls[0]![0];
    expect(setCall.key).toBe("app-preferences");
    const state = JSON.parse(setCall.value);
    expect(state.state.launcherAccess).toBe(true);

    // No longer reloads the page - state updates reactively
    expect(window.location.reload).not.toHaveBeenCalled();
  });

  it("should handle restore purchases failure", async () => {
    const { Purchases } = await import("@revenuecat/purchases-capacitor");
    vi.mocked(Purchases.restorePurchases).mockRejectedValue(
      new Error("Restore failed"),
    );

    render(<RestorePuchasesButton />);

    const button = screen.getByRole("button", {
      name: "settings.app.restorePurchases",
    });
    fireEvent.click(button);

    await waitFor(() => {
      expect(Purchases.restorePurchases).toHaveBeenCalled();
    });

    const toast = await import("react-hot-toast");
    expect(toast.default.error).toHaveBeenCalledWith(
      "settings.app.restoreFail",
    );
  });

  it("should show not found toast when restore succeeds but no entitlement exists", async () => {
    const mockCustomerInfo = {
      customerInfo: {
        entitlements: {
          active: {}, // No tapto_launcher entitlement
        },
      },
    } as any;

    const { Purchases } = await import("@revenuecat/purchases-capacitor");
    vi.mocked(Purchases.restorePurchases).mockResolvedValue({} as any);
    vi.mocked(Purchases.getCustomerInfo).mockResolvedValue(mockCustomerInfo);

    render(<RestorePuchasesButton />);

    const button = screen.getByRole("button", {
      name: "settings.app.restorePurchases",
    });
    fireEvent.click(button);

    await waitFor(() => {
      expect(Purchases.restorePurchases).toHaveBeenCalled();
      expect(Purchases.getCustomerInfo).toHaveBeenCalled();
    });

    const toast = await import("react-hot-toast");
    expect(toast.default.error).toHaveBeenCalledWith(
      "settings.app.restoreNotFound",
    );
  });

  it("should handle undefined entitlements.active gracefully", async () => {
    const mockCustomerInfo = {
      customerInfo: {
        entitlements: {
          active: undefined,
        },
      },
    } as any;

    const { Purchases } = await import("@revenuecat/purchases-capacitor");
    vi.mocked(Purchases.restorePurchases).mockResolvedValue({} as any);
    vi.mocked(Purchases.getCustomerInfo).mockResolvedValue(mockCustomerInfo);

    render(<RestorePuchasesButton />);

    const button = screen.getByRole("button", {
      name: "settings.app.restorePurchases",
    });
    fireEvent.click(button);

    await waitFor(() => {
      expect(Purchases.restorePurchases).toHaveBeenCalled();
      expect(Purchases.getCustomerInfo).toHaveBeenCalled();
    });

    const toast = await import("react-hot-toast");
    // Should show "not found" toast, not crash
    expect(toast.default.error).toHaveBeenCalledWith(
      "settings.app.restoreNotFound",
    );
  });

  it("should handle missing entitlements object gracefully", async () => {
    const mockCustomerInfo = {
      customerInfo: {}, // No entitlements at all
    } as any;

    const { Purchases } = await import("@revenuecat/purchases-capacitor");
    vi.mocked(Purchases.restorePurchases).mockResolvedValue({} as any);
    vi.mocked(Purchases.getCustomerInfo).mockResolvedValue(mockCustomerInfo);

    render(<RestorePuchasesButton />);

    const button = screen.getByRole("button", {
      name: "settings.app.restorePurchases",
    });
    fireEvent.click(button);

    await waitFor(() => {
      expect(Purchases.restorePurchases).toHaveBeenCalled();
      expect(Purchases.getCustomerInfo).toHaveBeenCalled();
    });

    const toast = await import("react-hot-toast");
    // Should show "not found" toast, not crash
    expect(toast.default.error).toHaveBeenCalledWith(
      "settings.app.restoreNotFound",
    );
  });
});

describe("useProPurchase", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    // Reset store state
    const { usePreferencesStore } = await import("@/lib/preferencesStore");
    usePreferencesStore.setState({ launcherAccess: false });
    // Set up default mock returns for the hook
    const { Purchases } = await import("@revenuecat/purchases-capacitor");
    vi.mocked(Purchases.getOfferings).mockResolvedValue({
      current: {
        availablePackages: [],
      },
    } as any);
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

  it("should reflect store state when launcherAccess is true", async () => {
    // Set store state before rendering
    const { usePreferencesStore } = await import("@/lib/preferencesStore");
    usePreferencesStore.setState({ launcherAccess: true });

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
    });

    const mockOfferings = {
      current: {
        availablePackages: [
          {
            product: {
              priceString: "$6.99",
            },
          },
        ],
      },
    } as any;

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
