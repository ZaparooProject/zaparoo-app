import { vi } from "vitest";

/**
 * Mock AbortController for test environments that don't have native support.
 * Provides full signal handling with event listeners and abort functionality.
 */
export class MockAbortController {
  signal: {
    aborted: boolean;
    addEventListener: (type: string, listener: () => void, options?: any) => void;
    removeEventListener: (type: string, listener: () => void) => void;
  };

  private _listeners: (() => void)[] = [];

  constructor() {
    this.signal = {
      aborted: false,
      addEventListener: vi.fn((_type: string, listener: () => void) => {
        this._listeners.push(listener);
      }),
      removeEventListener: vi.fn()
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