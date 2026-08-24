import type { CustomerInfo } from "@revenuecat/purchases-capacitor";
import type { PurchaseErrorDiagnostics } from "@/lib/errors";

let cachedPurchaseProfileContext: Record<string, unknown> = {};
let cachedPurchaseErrorDiagnostics: PurchaseErrorDiagnostics = {};

export function cachePurchaseReportContext(customerInfo: CustomerInfo): void {
  const originalAppUserID = customerInfo.originalAppUserId;

  cachedPurchaseProfileContext = {
    ...(typeof originalAppUserID === "string" &&
    originalAppUserID.startsWith("$RCAnonymousID:")
      ? { billingSupportProfileID: originalAppUserID }
      : {}),
    billingActiveEntitlements: Object.keys(
      customerInfo.entitlements?.active ?? {},
    ).sort(),
  };
}

export function getPurchaseFirebaseUserSuffix(
  firebaseUserID: string | null,
): string {
  return firebaseUserID ? firebaseUserID.slice(-8) : "signed-out";
}

let cachedPurchaseErrorAction: string | null = null;

/**
 * Caches the diagnostics from the most recent failed purchase operation,
 * tagged with the operation that produced it (e.g. "getOfferings",
 * "purchasePackage", "restorePurchases"). Call `clearCachedPurchaseErrorDiagnostics`
 * when a later operation succeeds so a stale failure doesn't keep showing up
 * in every subsequent report.
 */
export function cachePurchaseErrorDiagnostics(
  diagnostics: PurchaseErrorDiagnostics,
  action: string,
): void {
  cachedPurchaseErrorDiagnostics = diagnostics;
  cachedPurchaseErrorAction = action;
}

/**
 * Clears the last-error cache. Call this when a purchase operation succeeds,
 * so the cache doesn't keep attaching an old failure to unrelated reports.
 */
export function clearCachedPurchaseErrorDiagnostics(): void {
  cachedPurchaseErrorDiagnostics = {};
  cachedPurchaseErrorAction = null;
}

export function getCachedPurchaseErrorDiagnostics(): PurchaseErrorDiagnostics {
  return cachedPurchaseErrorDiagnostics;
}

export function getCachedPurchaseReportContext(): Record<string, unknown> {
  return {
    ...cachedPurchaseProfileContext,
    ...(Object.keys(cachedPurchaseErrorDiagnostics).length > 0
      ? {
          billingLastPurchaseError: cachedPurchaseErrorDiagnostics,
          billingLastPurchaseErrorAction: cachedPurchaseErrorAction,
        }
      : {}),
  };
}
