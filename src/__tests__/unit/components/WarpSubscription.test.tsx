import { beforeEach, describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import type { PurchasesPackage } from "@revenuecat/purchases-capacitor";
import { render, screen } from "@/test-utils";
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
    usePreferencesStore.setState({ lifetimeProAccess: false });
    mockUseWarpSubscription.mockReturnValue(hookState());
    mockPurchase.mockResolvedValue("active");
    mockRestore.mockResolvedValue("not_found");
    mockManage.mockResolvedValue("opened");
    mockRetry.mockResolvedValue(undefined);
  });

  it("should open checkout with annual selected and localized full price", async () => {
    const user = userEvent.setup();
    render(<WarpSubscription appUserID="user-123" />);

    await user.click(screen.getByRole("button", { name: "online.warp.get" }));

    expect(
      screen.getByRole("dialog", { name: "online.warp.purchaseTitle" }),
    ).toBeInTheDocument();
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
});
