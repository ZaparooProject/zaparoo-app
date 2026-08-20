import { beforeEach, describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import toast from "react-hot-toast";
import type { PurchasesPackage } from "@revenuecat/purchases-capacitor";
import { render, screen, waitFor, within } from "@/test-utils";
import { usePurchasePreviewStore } from "@/lib/purchasePreviewStore";
import { usePreferencesStore } from "@/lib/preferencesStore";

const {
  mockUseWarpSubscription,
  mockSetSelectedPlan,
  mockPurchase,
  mockRestore,
  mockManage,
  mockRetry,
} = vi.hoisted(() => ({
  mockUseWarpSubscription: vi.fn(),
  mockSetSelectedPlan: vi.fn(),
  mockPurchase: vi.fn(),
  mockRestore: vi.fn(),
  mockManage: vi.fn(),
  mockRetry: vi.fn(),
}));

vi.mock("@/hooks/useWarpSubscription", () => ({
  useWarpSubscription: mockUseWarpSubscription,
}));

vi.mock("react-hot-toast", () => ({
  default: Object.assign(vi.fn(), {
    success: vi.fn(),
    error: vi.fn(),
  }),
}));

import { WarpSubscription } from "@/components/WarpSubscription";

function purchasePackage(
  identifier: string,
  priceString: string,
): PurchasesPackage {
  return {
    identifier,
    product: { priceString },
  } as unknown as PurchasesPackage;
}

function hookState(overrides: Record<string, unknown> = {}) {
  return {
    subscription: {
      is_premium: false,
      sources: [],
      patreon: null,
      revenuecat: null,
    },
    packages: {
      annual: purchasePackage("$rc_annual", "$49.99"),
      monthly: purchasePackage("$rc_monthly", "$4.99"),
    },
    selectedPlan: "annual",
    setSelectedPlan: mockSetSelectedPlan,
    isLoading: false,
    loadFailed: false,
    packagesUnavailable: false,
    revenueCatWarpActive: false,
    action: null,
    activationPending: false,
    purchase: mockPurchase,
    restore: mockRestore,
    manage: mockManage,
    retry: mockRetry,
    ...overrides,
  };
}

describe("WarpSubscription", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    usePurchasePreviewStore.setState({ state: "live" });
    usePreferencesStore.setState({
      _hasHydrated: true,
      lifetimeProAccess: false,
    });
    mockUseWarpSubscription.mockReturnValue(hookState());
    mockPurchase.mockResolvedValue("active");
    mockRestore.mockResolvedValue("not_found");
    mockManage.mockResolvedValue("opened");
    mockRetry.mockResolvedValue(undefined);
  });

  it("should open checkout with annual selected and localized full price", async () => {
    const user = userEvent.setup();
    render(<WarpSubscription appUserID="user-123" />);
    const dialog = screen.getByRole("dialog", { hidden: true });

    expect(dialog).toHaveStyle({ transform: "translate3d(0, 100%, 0)" });

    await user.click(screen.getByRole("button", { name: "online.warp.get" }));

    expect(
      screen.getByRole("dialog", { name: "online.warp.purchaseTitle" }),
    ).toBe(dialog);
    expect(dialog).toHaveStyle({ transform: "translate3d(0, 0, 0)" });
    expect(
      screen.getByRole("radio", { name: "online.warp.annual" }),
    ).toHaveAttribute("aria-checked", "true");
    expect(screen.getByText("$49.99")).toBeInTheDocument();
    expect(screen.getByText("online.warp.billedAnnually")).toBeInTheDocument();
    expect(
      screen.getByText("online.warp.autoRenewDisclosure"),
    ).toBeInTheDocument();
    expect(screen.getByText("online.warp.benefitBackup")).toBeInTheDocument();
    expect(screen.getByText("online.warp.benefitPro")).toBeInTheDocument();
    expect(
      screen.getByText("online.warp.benefitDevelopment"),
    ).toBeInTheDocument();
  });

  it("should block dismissal while a purchase is pending", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<WarpSubscription appUserID="user-123" />);
    await user.click(screen.getByRole("button", { name: "online.warp.get" }));
    const dialog = screen.getByRole("dialog", {
      name: "online.warp.purchaseTitle",
    });

    mockUseWarpSubscription.mockReturnValue(hookState({ action: "purchase" }));
    rerender(<WarpSubscription appUserID="user-123" />);

    expect(
      within(dialog).queryByRole("button", { name: "nav.close" }),
    ).not.toBeInTheDocument();
    expect(
      within(dialog).getByRole("button", {
        name: "online.warp.purchasing",
      }),
    ).toBeDisabled();

    await user.keyboard("{Escape}");
    expect(dialog).toBeInTheDocument();
  });

  it("should allow selecting monthly plan", async () => {
    const user = userEvent.setup();
    render(<WarpSubscription appUserID="user-123" />);
    await user.click(screen.getByRole("button", { name: "online.warp.get" }));

    await user.click(
      screen.getByRole("radio", { name: "online.warp.monthly" }),
    );

    expect(mockSetSelectedPlan).toHaveBeenCalledWith("monthly");
  });

  it("should suppress checkout and offer management for active Warp", () => {
    mockUseWarpSubscription.mockReturnValue(
      hookState({
        subscription: {
          is_premium: true,
          sources: ["revenuecat"],
          patreon: null,
          revenuecat: {
            active: true,
            product_id: "pri_internal_product_id",
            billing_period: "annual",
            will_renew: false,
            expires_at: "2027-01-01T00:00:00Z",
            store: "APP_STORE",
          },
        },
        packages: null,
      }),
    );

    render(<WarpSubscription appUserID="user-123" />);

    expect(
      screen.queryByRole("button", { name: "online.warp.get" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "online.warp.manage" }),
    ).toBeInTheDocument();
    expect(screen.getByText("online.warp.planSummary")).toBeInTheDocument();
    expect(screen.getByText("online.warp.expiresThrough")).toBeInTheDocument();
    expect(screen.getByText("online.warp.proIncluded")).toBeInTheDocument();
    expect(
      screen.queryByText("pri_internal_product_id"),
    ).not.toBeInTheDocument();
  });

  it("should preserve separately owned lifetime Pro in active Warp copy", () => {
    usePreferencesStore.setState({ lifetimeProAccess: true });
    mockUseWarpSubscription.mockReturnValue(
      hookState({
        subscription: {
          is_premium: true,
          sources: ["revenuecat"],
          revenuecat: { active: true, will_renew: true },
        },
        packages: null,
      }),
    );

    render(<WarpSubscription appUserID="user-123" />);

    expect(screen.getByText("online.warp.proOwned")).toBeInTheDocument();
    expect(
      screen.queryByText("online.warp.proIncluded"),
    ).not.toBeInTheDocument();
  });

  it("should preserve subscription controls while details load", () => {
    mockUseWarpSubscription.mockReturnValue(
      hookState({
        subscription: null,
        packages: null,
        isLoading: true,
      }),
    );

    render(<WarpSubscription appUserID="user-123" />);

    expect(
      screen.getByRole("status", { name: "online.warp.loading" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "online.warp.restore" }),
    ).toBeDisabled();
    expect(
      screen.queryByRole("button", { name: "online.warp.get" }),
    ).not.toBeInTheDocument();
  });

  it("should render preview state without loading live subscription data", () => {
    usePurchasePreviewStore.getState().setPreviewState("warp");

    render(<WarpSubscription appUserID="user-123" />);

    expect(screen.getByText("online.warp.planSummary")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "online.warp.manage" }),
    ).toBeInTheDocument();
    expect(mockUseWarpSubscription).not.toHaveBeenCalled();
  });

  it("should render a screenshot-ready checkout preview", async () => {
    const user = userEvent.setup();
    usePurchasePreviewStore.getState().setPreviewState("checkout");

    render(<WarpSubscription appUserID="purchase-preview" />);

    expect(
      screen.getByRole("dialog", { name: "online.warp.purchaseTitle" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("radio", { name: "online.warp.annual" }),
    ).toHaveAttribute("aria-checked", "true");
    expect(screen.getByText("$29.99")).toBeInTheDocument();

    await user.click(
      screen.getByRole("radio", { name: "online.warp.monthly" }),
    );

    expect(screen.getByText("$3.99")).toBeInTheDocument();

    const dialog = screen.getByRole("dialog", {
      name: "online.warp.purchaseTitle",
    });
    await user.click(
      within(dialog).getAllByRole("button", { name: "nav.close" })[0]!,
    );

    expect(
      screen.queryByRole("dialog", { name: "online.warp.purchaseTitle" }),
    ).not.toBeInTheDocument();
    expect(mockUseWarpSubscription).not.toHaveBeenCalled();
  });

  it("should suppress duplicate checkout while activation is pending", () => {
    mockUseWarpSubscription.mockReturnValue(
      hookState({
        packages: null,
        revenueCatWarpActive: true,
        activationPending: true,
      }),
    );

    render(<WarpSubscription appUserID="user-123" />);

    expect(
      screen.queryByRole("button", { name: "online.warp.get" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "online.warp.refresh" }),
    ).toBeInTheDocument();
  });

  it("should disable checkout on status error and offer retry", () => {
    mockUseWarpSubscription.mockReturnValue(
      hookState({ packages: null, loadFailed: true }),
    );

    render(<WarpSubscription appUserID="user-123" />);

    expect(
      screen.queryByRole("button", { name: "online.warp.get" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "online.warp.retry" }),
    ).toBeInTheDocument();
  });

  it.each([
    ["active", "success", "online.warp.purchaseSuccess"],
    ["pending", "default", "online.warp.paymentPending"],
    ["activation_pending", "default", "online.warp.activationPending"],
    ["identity_error", "error", "online.warp.accountMismatch"],
    ["failed", "error", "online.warp.purchaseFailed"],
  ] as const)(
    "should surface the %s purchase result",
    async (result, toastType, message) => {
      mockPurchase.mockResolvedValue(result);
      const user = userEvent.setup();
      render(<WarpSubscription appUserID="user-123" />);

      await user.click(screen.getByRole("button", { name: "online.warp.get" }));
      await user.click(
        screen.getByRole("button", { name: "online.warp.subscribe" }),
      );

      await waitFor(() => expect(mockPurchase).toHaveBeenCalledOnce());
      const toastMethod = toastType === "default" ? toast : toast[toastType];
      expect(toastMethod).toHaveBeenCalledWith(message);
    },
  );

  it.each(["cancelled", "busy"] as const)(
    "should not show an error for the %s purchase result",
    async (result) => {
      mockPurchase.mockResolvedValue(result);
      const user = userEvent.setup();
      render(<WarpSubscription appUserID="user-123" />);

      await user.click(screen.getByRole("button", { name: "online.warp.get" }));
      await user.click(
        screen.getByRole("button", { name: "online.warp.subscribe" }),
      );

      await waitFor(() => expect(mockPurchase).toHaveBeenCalledOnce());
      expect(toast).not.toHaveBeenCalled();
      expect(toast.success).not.toHaveBeenCalled();
      expect(toast.error).not.toHaveBeenCalled();
    },
  );

  it.each([
    ["active", "success", "online.warp.restoreSuccess"],
    ["pro_restored", "success", "online.warp.restoreProSuccess"],
    ["activation_pending", "default", "online.warp.activationPending"],
    ["not_found", "error", "online.warp.restoreNotFound"],
    ["failed", "error", "online.warp.restoreFailed"],
  ] as const)(
    "should surface the %s restore result",
    async (result, toastType, message) => {
      mockRestore.mockResolvedValue(result);
      const user = userEvent.setup();
      render(<WarpSubscription appUserID="user-123" />);

      await user.click(
        screen.getByRole("button", { name: "online.warp.restore" }),
      );

      await waitFor(() => expect(mockRestore).toHaveBeenCalledOnce());
      const toastMethod = toastType === "default" ? toast : toast[toastType];
      expect(toastMethod).toHaveBeenCalledWith(message);
    },
  );

  it.each([
    ["unavailable", "online.warp.manageUnavailable"],
    ["failed", "online.warp.manageFailed"],
  ] as const)(
    "should surface the %s management result",
    async (result, message) => {
      mockManage.mockResolvedValue(result);
      mockUseWarpSubscription.mockReturnValue(
        hookState({
          subscription: {
            is_premium: true,
            sources: ["revenuecat"],
            revenuecat: { active: true, will_renew: true },
          },
          packages: null,
        }),
      );
      const user = userEvent.setup();
      render(<WarpSubscription appUserID="user-123" />);

      await user.click(
        screen.getByRole("button", { name: "online.warp.manage" }),
      );

      await waitFor(() => expect(mockManage).toHaveBeenCalledOnce());
      expect(toast.error).toHaveBeenCalledWith(message);
    },
  );

  it("should open management without showing an error", async () => {
    mockUseWarpSubscription.mockReturnValue(
      hookState({
        subscription: {
          is_premium: true,
          sources: ["revenuecat"],
          revenuecat: { active: true, will_renew: true },
        },
        packages: null,
      }),
    );
    const user = userEvent.setup();
    render(<WarpSubscription appUserID="user-123" />);

    await user.click(
      screen.getByRole("button", { name: "online.warp.manage" }),
    );

    await waitFor(() => expect(mockManage).toHaveBeenCalledOnce());
    expect(toast.error).not.toHaveBeenCalled();
  });
});
