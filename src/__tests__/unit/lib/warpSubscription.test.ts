import { describe, it, expect } from "vitest";
import type { CustomerInfo } from "@revenuecat/purchases-capacitor";
import type { SubscriptionResponse } from "@/lib/models";
import { hasNonPromotionalWarp, getPurchaseAccess } from "@/lib/purchasesSetup";
import {
  canSubscribeToWarp,
  isPaidWarpActive,
  getWarpTrialView,
} from "@/lib/warpSubscription";

const trial: SubscriptionResponse = {
  is_premium: true,
  sources: ["revenuecat"],
  can_subscribe: true,
  paid_subscription: { active: false, will_renew: false },
  trial: {
    status: "active",
    starts_at: "2026-10-15T00:00:00Z",
    expires_at: "2026-10-29T00:00:00Z",
  },
};

describe("Warp trial classification", () => {
  it("offers trial checkout without calling promotional access paid", () => {
    expect(canSubscribeToWarp(trial)).toBe(true);
    expect(isPaidWarpActive(trial)).toBe(false);
    expect(canSubscribeToWarp({ ...trial, can_subscribe: false })).toBe(false);
  });
  it("retains conservative legacy and unknown-state behavior", () => {
    expect(canSubscribeToWarp(undefined)).toBe(false);
    expect(canSubscribeToWarp({ is_premium: true, sources: [] })).toBe(false);
    expect(canSubscribeToWarp({ is_premium: false, sources: [] })).toBe(true);
  });
  it.each([
    ["2026-10-25T00:00:00Z", null],
    ["2026-10-26T00:00:00Z", "ending"],
    ["2026-10-28T00:00:00Z", "last-day"],
    ["2026-10-29T00:00:00Z", null],
  ])("resolves notice at %s", (now, notice) =>
    expect(getWarpTrialView(trial, Date.parse(now))?.notice).toBe(notice),
  );
  it("requires confirmed dates", () =>
    expect(
      getWarpTrialView({ ...trial, trial: { status: "active" } })?.status,
    ).toBe("pending"));
  it("does not turn a Warp promotion into lifetime Pro or paid ownership", () => {
    const info = {
      entitlements: {
        active: {
          warp: { store: "PROMOTIONAL", productIdentifier: "rc_promo_warp" },
        },
      },
    } as unknown as CustomerInfo;
    expect(getPurchaseAccess(info)).toEqual({ warp: true, lifetimePro: false });
    expect(hasNonPromotionalWarp(info)).toBe(false);
  });
  it("keeps separate lifetime Pro while trial is active", () => {
    const info = {
      entitlements: {
        active: {
          tapto_launcher: {},
          warp: { store: "PROMOTIONAL", productIdentifier: "rc_promo_warp" },
        },
      },
    } as unknown as CustomerInfo;
    expect(getPurchaseAccess(info)).toEqual({ warp: true, lifetimePro: true });
  });
  it("blocks unknown nonpromotional SDK ownership", () =>
    expect(
      hasNonPromotionalWarp({
        entitlements: {
          active: {
            warp: { store: "APP_STORE", productIdentifier: "unknown" },
          },
        },
      } as unknown as CustomerInfo),
    ).toBe(true));
});
