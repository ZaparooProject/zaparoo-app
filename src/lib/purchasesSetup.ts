import {
  Purchases,
  type CustomerInfo,
  type PurchasesOfferings,
  type PurchasesPackage,
} from "@revenuecat/purchases-capacitor";
import {
  isExpectedRevenueCatLogoutError,
  PurchaseIdentityError,
} from "@/lib/errors";

export const PRO_ENTITLEMENT_ID = "tapto_launcher";
export const PRO_OFFERING_ID = "pro";
export const PRO_PACKAGE_ID = "$rc_lifetime";
export const WARP_ENTITLEMENT_ID = "warp";
export const WARP_OFFERING_ID = "warp";
export const WARP_MONTHLY_PACKAGE_ID = "$rc_monthly";
export const WARP_ANNUAL_PACKAGE_ID = "$rc_annual";

export interface PurchaseAccess {
  lifetimePro: boolean;
  warp: boolean;
}

export interface WarpPackages {
  monthly: PurchasesPackage;
  annual: PurchasesPackage;
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
    return result.customerInfo;
  }

  const result = await Purchases.getCustomerInfo();
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
  return enqueueIdentityOperation(async () => {
    assertCurrentOperation(options);
    const customerInfo = appUserID
      ? await syncPurchasesUser(appUserID)
      : await (async () => {
          await purchasesReady;
          const result = await Purchases.getCustomerInfo();
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
