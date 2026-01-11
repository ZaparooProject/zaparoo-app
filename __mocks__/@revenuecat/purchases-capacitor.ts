import { vi } from "vitest";

export const LOG_LEVEL = {
  VERBOSE: "VERBOSE",
  DEBUG: "DEBUG",
  INFO: "INFO",
  WARN: "WARN",
  ERROR: "ERROR",
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
