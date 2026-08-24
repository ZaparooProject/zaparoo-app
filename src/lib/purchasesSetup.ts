import { Capacitor } from "@capacitor/core";
import {
  Purchases,
  type CustomerInfo,
  type PurchasesOfferings,
  type PurchasesPackage,
} from "@revenuecat/purchases-capacitor";
import {
  isExpectedRevenueCatLogoutError,
  PurchaseIdentityError,
  type PurchaseErrorDiagnostics,
} from "@/lib/errors";
import {
  cachePurchaseReportContext,
  getCachedPurchaseErrorDiagnostics,
  getPurchaseFirebaseUserSuffix,
} from "@/lib/purchaseReportContext";
import {
  resolveRuntimeReleaseIdentity,
  type RuntimeReleaseIdentity,
} from "@/lib/whatsNew";
import { usePreferencesStore } from "@/lib/preferencesStore";

export const PRO_ENTITLEMENT_ID = "tapto_launcher";
export const PRO_OFFERING_ID = "tapto_basic";
export const PRO_PACKAGE_ID = "$rc_lifetime";
export const WARP_ENTITLEMENT_ID = "warp";
export const WARP_OFFERING_ID = "warp";
export const WARP_MONTHLY_PACKAGE_ID = "$rc_monthly";
export const WARP_ANNUAL_PACKAGE_ID = "$rc_annual";

const PURCHASES_TIMEOUT_MS = 5_000;

export interface PurchaseAccess {
  lifetimePro: boolean;
  warp: boolean;
}

export interface WarpPackages {
  monthly: PurchasesPackage;
  annual: PurchasesPackage;
}

export interface BillingDiagnostics {
  platform: string;
  appVersion: string;
  appBuild: string;
  releaseKey: string;
  hasStoreApiKey: boolean;
  revenueCatAppUserID: string;
  originalRevenueCatAppUserID: string;
  firebaseUserSuffix: string;
  isAnonymous: boolean | null;
  activeEntitlements: string[];
  storeVerifiedProAccess: boolean;
  offeringStatus: "available" | "missing" | "error";
  offeringDiagnostics: ReturnType<typeof getOfferingDiagnostics> | null;
  packagePriceString: string | null;
  lastPurchaseError: PurchaseErrorDiagnostics;
}

// Promise executor runs synchronously, so _resolve is always assigned before use.
let _resolve!: () => void;

export const purchasesReady: Promise<void> = new Promise<void>((resolve) => {
  _resolve = resolve;
});

let identityQueue: Promise<void> = Promise.resolve();

export function resolvePurchasesReady(): void {
  _resolve();
}

export async function withPurchasesTimeout<T>(
  promise: Promise<T>,
  operation: string,
  timeoutMs = PURCHASES_TIMEOUT_MS,
): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | null = null;

  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => {
          reject(new Error(`RevenueCat ${operation} timed out`));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

async function getDiagnosticsValue<T>(
  operation: string,
  request: () => Promise<T>,
  fallback: T,
): Promise<T> {
  try {
    return await withPurchasesTimeout(request(), operation);
  } catch {
    return fallback;
  }
}

export function getPurchaseAccess(customerInfo: CustomerInfo): PurchaseAccess {
  return {
    lifetimePro: Boolean(
      customerInfo.entitlements?.active?.[PRO_ENTITLEMENT_ID],
    ),
    warp: Boolean(customerInfo.entitlements?.active?.[WARP_ENTITLEMENT_ID]),
  };
}

export function getProPackage(
  offerings: PurchasesOfferings,
): PurchasesPackage | null {
  const offering = offerings.all?.[PRO_OFFERING_ID];
  if (!offering) return null;

  return (
    offering.availablePackages.find(
      (purchasePackage) => purchasePackage.identifier === PRO_PACKAGE_ID,
    ) ?? null
  );
}

export function getWarpPackages(
  offerings: PurchasesOfferings,
): WarpPackages | null {
  const offering = offerings.all?.[WARP_OFFERING_ID];
  if (!offering) return null;

  const monthly = offering.availablePackages.find(
    (purchasePackage) => purchasePackage.identifier === WARP_MONTHLY_PACKAGE_ID,
  );
  const annual = offering.availablePackages.find(
    (purchasePackage) => purchasePackage.identifier === WARP_ANNUAL_PACKAGE_ID,
  );

  return monthly && annual ? { monthly, annual } : null;
}

export function getOfferingDiagnostics(
  offerings: PurchasesOfferings,
  offeringIdentifier: string,
) {
  const offering = offerings.all?.[offeringIdentifier];

  return {
    offeringIdentifier,
    offeringFound: Boolean(offering),
    packageIdentifiers:
      offering?.availablePackages.map(
        (purchasePackage) => purchasePackage.identifier,
      ) ?? [],
  };
}

function enqueueIdentityOperation<T>(operation: () => Promise<T>): Promise<T> {
  const result = identityQueue.then(operation);

  // Keep later identity operations moving even if this operation fails.
  identityQueue = result.then(
    () => undefined,
    () => undefined,
  );

  return result;
}

async function syncPurchasesUser(appUserID: string): Promise<CustomerInfo> {
  await purchasesReady;

  const current = await Purchases.getAppUserID();
  if (current.appUserID !== appUserID) {
    const result = await Purchases.logIn({ appUserID });
    cachePurchaseReportContext(result.customerInfo);
    return result.customerInfo;
  }

  const result = await Purchases.getCustomerInfo();
  cachePurchaseReportContext(result.customerInfo);
  return result.customerInfo;
}

export function ensurePurchasesUser(appUserID: string): Promise<CustomerInfo> {
  return enqueueIdentityOperation(() => syncPurchasesUser(appUserID));
}

export function resetPurchasesUser(): Promise<CustomerInfo> {
  return enqueueIdentityOperation(async () => {
    await purchasesReady;
    try {
      const { isAnonymous } = await Purchases.isAnonymous();
      if (!isAnonymous) await Purchases.logOut();
    } catch (e) {
      if (!isExpectedRevenueCatLogoutError(e)) throw e;
    }

    const result = await Purchases.getCustomerInfo();
    cachePurchaseReportContext(result.customerInfo);
    return result.customerInfo;
  });
}

interface PurchasesOperationOptions {
  signal?: AbortSignal;
  isCurrentIdentity?: () => boolean;
}

function assertCurrentOperation(options: PurchasesOperationOptions): void {
  options.signal?.throwIfAborted();
  if (options.isCurrentIdentity && !options.isCurrentIdentity()) {
    throw new PurchaseIdentityError();
  }
}

export function runPurchasesOperation<T>(
  appUserID: string | null,
  operation: (customerInfo: CustomerInfo) => Promise<T>,
  options: PurchasesOperationOptions = {},
): Promise<T> {
  if (!Capacitor.isNativePlatform()) {
    return Promise.reject(
      new Error("RevenueCat purchase operations require a native platform"),
    );
  }

  return enqueueIdentityOperation(async () => {
    assertCurrentOperation(options);
    const customerInfo = appUserID
      ? await syncPurchasesUser(appUserID)
      : await (async () => {
          await purchasesReady;
          const result = await Purchases.getCustomerInfo();
          cachePurchaseReportContext(result.customerInfo);
          return result.customerInfo;
        })();
    assertCurrentOperation(options);

    const result = await operation(customerInfo);
    assertCurrentOperation(options);

    if (appUserID) {
      const current = await Purchases.getAppUserID();
      assertCurrentOperation(options);
      if (current.appUserID !== appUserID) throw new PurchaseIdentityError();
    }

    return result;
  });
}

export function restorePurchasesForUser(
  appUserID: string | null,
): Promise<CustomerInfo> {
  return runPurchasesOperation(appUserID, async () => {
    const result = await Purchases.restorePurchases();
    cachePurchaseReportContext(result.customerInfo);
    return result.customerInfo;
  });
}

/**
 * Silently reconciles the current store account after checkout has already
 * confirmed ownership. This avoids another purchase attempt and does not show
 * an OS sign-in prompt.
 */
export function reconcileStorePurchases(
  appUserID: string | null,
): Promise<CustomerInfo> {
  return runPurchasesOperation(appUserID, async () => {
    await Purchases.syncPurchases();
    await Purchases.invalidateCustomerInfoCache();
    const result = await Purchases.getCustomerInfo();
    cachePurchaseReportContext(result.customerInfo);
    return result.customerInfo;
  });
}

function hasStoreApiKeyConfigured(platform: string): boolean {
  if (platform === "ios") return Boolean(import.meta.env.VITE_APPLE_STORE_API);
  if (platform === "android") {
    return Boolean(import.meta.env.VITE_GOOGLE_STORE_API);
  }
  return false;
}

/**
 * Gathers a snapshot of purchase state for support diagnostics. Fetches
 * offerings itself rather than reusing checkout-time state, so it stays off
 * the checkout path and always reflects the moment the user asked for it.
 */
export async function getBillingDiagnostics(
  firebaseUserID: string | null,
): Promise<BillingDiagnostics> {
  await getDiagnosticsValue("initialization", () => purchasesReady, undefined);

  const fallbackReleaseIdentity: RuntimeReleaseIdentity = {
    nativeVersion: import.meta.env.VITE_VERSION || "unknown",
    nativeBuild: "unknown",
    liveBundleId: null,
    releaseKey: import.meta.env.VITE_RELEASE_KEY?.trim() || "unknown",
  };
  const [revenueCatAppUserID, customerInfo, isAnonymous, releaseIdentity] =
    await Promise.all([
      getDiagnosticsValue(
        "getAppUserID",
        async () => (await Purchases.getAppUserID()).appUserID,
        "unavailable",
      ),
      getDiagnosticsValue(
        "getCustomerInfo",
        async () => (await Purchases.getCustomerInfo()).customerInfo,
        null as CustomerInfo | null,
      ),
      getDiagnosticsValue(
        "isAnonymous",
        async () => (await Purchases.isAnonymous()).isAnonymous,
        null as boolean | null,
      ),
      getDiagnosticsValue(
        "releaseIdentity",
        resolveRuntimeReleaseIdentity,
        fallbackReleaseIdentity,
      ),
    ]);
  const activeEntitlements = Object.keys(
    customerInfo?.entitlements?.active ?? {},
  ).sort();

  if (customerInfo) {
    cachePurchaseReportContext(customerInfo);
  }

  let offeringStatus: BillingDiagnostics["offeringStatus"] = "error";
  let offeringDiagnostics: BillingDiagnostics["offeringDiagnostics"] = null;
  let packagePriceString: string | null = null;
  try {
    const offerings = await withPurchasesTimeout(
      Purchases.getOfferings(),
      "getOfferings",
    );
    offeringDiagnostics = getOfferingDiagnostics(offerings, PRO_OFFERING_ID);
    const purchasePackage = getProPackage(offerings);
    packagePriceString = purchasePackage?.product?.priceString ?? null;
    offeringStatus = purchasePackage ? "available" : "missing";
  } catch {
    // Diagnostics still report everything else when offerings can't load.
  }

  const platform = Capacitor.getPlatform();

  return {
    platform,
    appVersion: releaseIdentity.nativeVersion,
    appBuild: releaseIdentity.nativeBuild,
    releaseKey: releaseIdentity.releaseKey,
    hasStoreApiKey: hasStoreApiKeyConfigured(platform),
    revenueCatAppUserID,
    originalRevenueCatAppUserID:
      customerInfo?.originalAppUserId || "unavailable",
    firebaseUserSuffix: getPurchaseFirebaseUserSuffix(firebaseUserID),
    isAnonymous,
    activeEntitlements,
    storeVerifiedProAccess:
      usePreferencesStore.getState().storeVerifiedProAccess,
    offeringStatus,
    offeringDiagnostics,
    packagePriceString,
    lastPurchaseError: getCachedPurchaseErrorDiagnostics(),
  };
}

export function formatBillingDiagnostics(
  diagnostics: BillingDiagnostics,
): string {
  return [
    "Zaparoo billing diagnostics",
    `App: ${diagnostics.appVersion} (${diagnostics.appBuild})`,
    `Release: ${diagnostics.releaseKey}`,
    `Platform: ${diagnostics.platform}`,
    `Store API key present: ${diagnostics.hasStoreApiKey ? "yes" : "no"}`,
    `RevenueCat ID: ${diagnostics.revenueCatAppUserID}`,
    `Original RevenueCat ID: ${diagnostics.originalRevenueCatAppUserID}`,
    `Firebase UID suffix: ${diagnostics.firebaseUserSuffix}`,
    `Anonymous: ${diagnostics.isAnonymous === null ? "unknown" : diagnostics.isAnonymous ? "yes" : "no"}`,
    `Active entitlements: ${diagnostics.activeEntitlements.join(", ") || "none"}`,
    `Store-verified local Pro fallback: ${diagnostics.storeVerifiedProAccess ? "yes" : "no"}`,
    `Offering status: ${diagnostics.offeringStatus}`,
    ...(diagnostics.offeringDiagnostics
      ? [
          `Offering found: ${diagnostics.offeringDiagnostics.offeringFound ? "yes" : "no"}`,
          `Offering packages: ${diagnostics.offeringDiagnostics.packageIdentifiers.join(", ") || "none"}`,
        ]
      : []),
    ...(diagnostics.packagePriceString
      ? [`Package price: ${diagnostics.packagePriceString}`]
      : []),
    ...(Object.keys(diagnostics.lastPurchaseError).length > 0
      ? [
          `Last purchase error code: ${diagnostics.lastPurchaseError.code || "unknown"}`,
          `Last purchase error name: ${diagnostics.lastPurchaseError.readableErrorCode || "unknown"}`,
          `Last underlying store error: ${diagnostics.lastPurchaseError.underlyingErrorMessage || "unavailable"}`,
        ]
      : []),
  ].join("\n");
}
