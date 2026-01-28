import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { vi } from "vitest";
import {
  RestorePuchasesButton,
  useProPurchase,
} from "@/components/ProPurchase";
import { renderHook, act } from "@testing-library/react";

// Mock modules inline to avoid hoisting issues
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

vi.mock("i18next", () => ({
  t: (key: string) => key,
}));

// Mock UI components
vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ children, open, onOpenChange }: any) =>
    open ? (
      <div data-testid="dialog" onClick={() => onOpenChange(false)}>
        {children}
      </div>
    ) : null,
  DialogContent: ({ children }: any) => (
    <div data-testid="dialog-content">{children}</div>
  ),
  DialogHeader: ({ children }: any) => (
    <div data-testid="dialog-header">{children}</div>
  ),
  DialogTitle: ({ children }: any) => (
    <h2 data-testid="dialog-title">{children}</h2>
  ),
}));

vi.mock("@/components/wui/Button", () => ({
  Button: ({ label, onClick, disabled, className }: any) => (
    <button
      data-testid="button"
      onClick={onClick}
      disabled={disabled}
      className={className}
    >
      {label}
    </button>
  ),
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

    const button = screen.getByTestId("button");
    expect(button).toBeInTheDocument();
    expect(button).toHaveTextContent("settings.app.restorePurchases");
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

    const button = screen.getByTestId("button");
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

    const button = screen.getByTestId("button");
    fireEvent.click(button);

    await waitFor(() => {
      expect(Purchases.restorePurchases).toHaveBeenCalled();
    });

    const toast = await import("react-hot-toast");
    expect(toast.default.error).toHaveBeenCalled();
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
    // Mock console.error to suppress expected "no launcher purchase package found" message
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    const { result } = renderHook(() => useProPurchase());

    expect(result.current.proAccess).toBe(false);
    expect(result.current.proPurchaseModalOpen).toBe(false);
    expect(typeof result.current.setProPurchaseModalOpen).toBe("function");
    expect(typeof result.current.PurchaseModal).toBe("function");

    // Wait for any async effects to complete
    await waitFor(() => {
      expect(consoleErrorSpy).toHaveBeenCalled();
    });

    consoleErrorSpy.mockRestore();
  });

  it("should reflect store state when launcherAccess is true", async () => {
    // Set store state before rendering
    const { usePreferencesStore } = await import("@/lib/preferencesStore");
    usePreferencesStore.setState({ launcherAccess: true });

    // Mock console.error to suppress expected "no launcher purchase package found" message
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    const { result } = renderHook(() => useProPurchase());

    expect(result.current.proAccess).toBe(true);

    // Wait for any async effects to complete
    await waitFor(() => {
      expect(consoleErrorSpy).toHaveBeenCalled();
    });

    consoleErrorSpy.mockRestore();
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
    // Mock console.error to suppress expected "no launcher purchase package found" message
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    const { result } = renderHook(() => useProPurchase());

    const PurchaseModalComponent = result.current.PurchaseModal;
    render(<PurchaseModalComponent />);

    // Modal should not be visible initially
    expect(screen.queryByTestId("dialog")).not.toBeInTheDocument();

    // Wait for any async effects to complete
    await waitFor(() => {
      expect(consoleErrorSpy).toHaveBeenCalled();
    });

    consoleErrorSpy.mockRestore();
  });

  it("should open purchase modal", async () => {
    // Mock console.error to suppress expected "no launcher purchase package found" message
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    const { result } = renderHook(() => useProPurchase());

    // Wait for initial effects to complete
    await waitFor(() => {
      expect(consoleErrorSpy).toHaveBeenCalled();
    });

    act(() => {
      result.current.setProPurchaseModalOpen(true);
    });

    const PurchaseModalComponent = result.current.PurchaseModal;
    render(<PurchaseModalComponent />);

    expect(screen.getByTestId("dialog")).toBeInTheDocument();
    expect(screen.getByText("scan.purchaseProTitle")).toBeInTheDocument();

    consoleErrorSpy.mockRestore();
  });
});
