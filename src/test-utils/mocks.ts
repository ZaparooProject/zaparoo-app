import { vi } from "vitest";

/**
 * Mock AbortController for test environments that don't have native support.
 * Provides full signal handling with event listeners and abort functionality.
 */
export class MockAbortController {
  signal: {
    aborted: boolean;
    addEventListener: (
      type: string,
      listener: () => void,
      options?: any,
    ) => void;
    removeEventListener: (type: string, listener: () => void) => void;
  };

  private _listeners: (() => void)[] = [];

  constructor() {
    this.signal = {
      aborted: false,
      addEventListener: vi.fn((_type: string, listener: () => void) => {
        this._listeners.push(listener);
      }),
      removeEventListener: vi.fn(),
    };
  }

  abort() {
    this.signal.aborted = true;
    // Call all registered listeners
    this._listeners.forEach((listener: () => void) => listener());
  }
}

/**
 * Sets up MockAbortController as the global AbortController for tests.
 * Call this in test files that need AbortController functionality.
 */
export function setupMockAbortController() {
  global.AbortController = MockAbortController as any;
}

// Shared i18n mock that returns keys
export const mockI18n = {
  t: (key: string, options?: any) => {
    // Handle simple interpolation for testing
    if (options && typeof options === "object") {
      let result = key;
      Object.entries(options).forEach(([param, value]) => {
        result = result.replace(new RegExp(`{{${param}}}`, "g"), String(value));
      });
      return result;
    }
    return key;
  },
  i18n: {
    changeLanguage: vi.fn(() => Promise.resolve()),
  },
};

// React i18next mock
export const mockReactI18next = () => ({
  useTranslation: () => mockI18n,
});

// i18next mock
export const mockI18nextCore = () => ({
  t: mockI18n.t,
});

// Capacitor Preferences mock
export const mockCapacitorPreferences = () => ({
  Preferences: {
    get: vi.fn(),
    set: vi.fn().mockResolvedValue(undefined),
    remove: vi.fn().mockResolvedValue(undefined),
    clear: vi.fn().mockResolvedValue(undefined),
  },
});

// Capacitor Core mock
export const mockCapacitorCore = (platform = "ios") => ({
  Capacitor: {
    getPlatform: vi.fn().mockReturnValue(platform),
    isNativePlatform: vi.fn().mockReturnValue(platform !== "web"),
  },
});

// RevenueCat Purchases mock
export const mockRevenueCatPurchases = () => ({
  Purchases: {
    restorePurchases: vi.fn(),
    getCustomerInfo: vi.fn(),
    getOfferings: vi.fn(),
    purchasePackage: vi.fn(),
  },
});

// React Hot Toast mock
export const mockReactHotToast = () => ({
  default: {
    success: vi.fn(),
    error: vi.fn(),
    dismiss: vi.fn(),
  },
});

// Mock global location.reload
export const mockLocationReload = () => {
  Object.defineProperty(window, "location", {
    value: {
      reload: vi.fn(),
    },
    writable: true,
  });
};
