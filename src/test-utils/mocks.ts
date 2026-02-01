import { vi } from "vitest";

/**
 * Mock AbortController for test environments that don't have native support.
 * Provides full signal handling with event listeners and abort functionality.
 * Implements the EventTarget interface for proper signal behavior.
 */
export class MockAbortController {
  signal: {
    aborted: boolean;
    reason: unknown;
    addEventListener: (
      type: string,
      listener: () => void,
      options?:
        | { once?: boolean; passive?: boolean; signal?: AbortSignal }
        | boolean,
    ) => void;
    removeEventListener: (type: string, listener: () => void) => void;
    dispatchEvent: (event: Event) => boolean;
    throwIfAborted: () => void;
    onabort: ((this: AbortSignal, ev: Event) => unknown) | null;
  };

  private _listeners: Map<string, Set<() => void>> = new Map();

  constructor() {
    this.signal = {
      aborted: false,
      reason: undefined,
      onabort: null,
      addEventListener: vi.fn((type: string, listener: () => void) => {
        if (!this._listeners.has(type)) {
          this._listeners.set(type, new Set());
        }
        this._listeners.get(type)!.add(listener);
      }),
      removeEventListener: vi.fn((type: string, listener: () => void) => {
        const listeners = this._listeners.get(type);
        if (listeners) {
          listeners.delete(listener);
        }
      }),
      dispatchEvent: vi.fn((event: Event) => {
        const listeners = this._listeners.get(event.type);
        if (listeners) {
          listeners.forEach((listener) => listener());
        }
        return true;
      }),
      throwIfAborted: () => {
        if (this.signal.aborted) {
          throw this.signal.reason;
        }
      },
    };
  }

  abort(reason?: unknown) {
    this.signal.aborted = true;
    this.signal.reason = reason ?? new DOMException("Aborted", "AbortError");
    // Call all registered abort listeners
    const abortListeners = this._listeners.get("abort");
    if (abortListeners) {
      abortListeners.forEach((listener) => listener());
    }
    // Call onabort handler if set
    if (this.signal.onabort) {
      this.signal.onabort.call(this.signal as AbortSignal, new Event("abort"));
    }
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
