import { beforeEach, describe, expect, it } from "vitest";
import type { CustomerInfo } from "@revenuecat/purchases-capacitor";
import {
  cachePurchaseErrorDiagnostics,
  cachePurchaseReportContext,
  clearCachedPurchaseErrorDiagnostics,
  getCachedPurchaseReportContext,
  getPurchaseFirebaseUserSuffix,
} from "@/lib/purchaseReportContext";

function customerInfo(
  originalAppUserId: string,
  activeEntitlements: string[] = [],
): CustomerInfo {
  return {
    originalAppUserId,
    entitlements: {
      active: Object.fromEntries(
        activeEntitlements.map((entitlement) => [entitlement, {}]),
      ),
    },
  } as unknown as CustomerInfo;
}

describe("purchaseReportContext", () => {
  beforeEach(() => {
    clearCachedPurchaseErrorDiagnostics();
  });

  it("should cache only a RevenueCat anonymous alias for support correlation", () => {
    cachePurchaseReportContext(
      customerInfo("$RCAnonymousID:support-id", ["warp", "tapto_launcher"]),
    );

    expect(getCachedPurchaseReportContext()).toEqual({
      billingSupportProfileID: "$RCAnonymousID:support-id",
      billingActiveEntitlements: ["tapto_launcher", "warp"],
    });
  });

  it("should omit account identifiers from automatic report context", () => {
    expect(getPurchaseFirebaseUserSuffix("firebase-user-12345678")).toBe(
      "12345678",
    );
    cachePurchaseReportContext(customerInfo("firebase-user-12345678"));

    expect(getCachedPurchaseReportContext()).toEqual({
      billingActiveEntitlements: [],
    });
  });

  it("should attach and clear cached purchase-error diagnostics", () => {
    cachePurchaseErrorDiagnostics(
      {
        code: "3",
        readableErrorCode: "PurchaseNotAllowedError",
        underlyingErrorMessage: "FEATURE_NOT_SUPPORTED",
      },
      "purchasePackage",
    );

    expect(getCachedPurchaseReportContext()).toMatchObject({
      billingLastPurchaseError: {
        code: "3",
        readableErrorCode: "PurchaseNotAllowedError",
        underlyingErrorMessage: "FEATURE_NOT_SUPPORTED",
      },
      billingLastPurchaseErrorAction: "purchasePackage",
    });

    clearCachedPurchaseErrorDiagnostics();

    expect(getCachedPurchaseReportContext()).not.toHaveProperty(
      "billingLastPurchaseError",
    );
    expect(getCachedPurchaseReportContext()).not.toHaveProperty(
      "billingLastPurchaseErrorAction",
    );
  });
});
