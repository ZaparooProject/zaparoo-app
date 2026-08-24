import { vi } from "vitest";

export const LOG_LEVEL = {
  VERBOSE: "VERBOSE",
  DEBUG: "DEBUG",
  INFO: "INFO",
  WARN: "WARN",
  ERROR: "ERROR",
};

export const PURCHASES_ERROR_CODE = {
  UNKNOWN_ERROR: "0",
  PURCHASE_CANCELLED_ERROR: "1",
  STORE_PROBLEM_ERROR: "2",
  PURCHASE_NOT_ALLOWED_ERROR: "3",
  PURCHASE_INVALID_ERROR: "4",
  PRODUCT_NOT_AVAILABLE_FOR_PURCHASE_ERROR: "5",
  PRODUCT_ALREADY_PURCHASED_ERROR: "6",
  INVALID_APP_USER_ID_ERROR: "14",
  PAYMENT_PENDING_ERROR: "20",
  LOG_OUT_ANONYMOUS_USER_ERROR: "22",
  CONFIGURATION_ERROR: "23",
};

export const Purchases = {
  configure: vi.fn().mockResolvedValue(undefined),
  setLogLevel: vi.fn().mockResolvedValue(undefined),
  getOfferings: vi.fn().mockResolvedValue({ current: null }),
  getCustomerInfo: vi.fn().mockResolvedValue({
    customerInfo: {
      entitlements: {
        active: {},
      },
    },
  }),
  purchasePackage: vi.fn().mockResolvedValue({}),
  restorePurchases: vi.fn().mockResolvedValue({}),
  addCustomerInfoUpdateListener: vi.fn().mockReturnValue({ remove: vi.fn() }),
};

export type PurchasesPackage = {
  identifier: string;
  product: {
    priceString: string;
  };
};
