/**
 * Unit tests for toastUtils
 *
 * Tests the rate-limited toast utility that prevents toast spam
 * when many errors occur simultaneously.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  showRateLimitedErrorToast,
  resetToastRateLimiter,
} from "../../../lib/toastUtils";
import toast from "react-hot-toast";

// Mock react-hot-toast
vi.mock("react-hot-toast", () => ({
  default: {
    error: vi.fn(),
  },
}));

// Mock logger
vi.mock("../../../lib/logger", () => ({
  logger: {
    warn: vi.fn(),
    log: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

describe("toastUtils", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    resetToastRateLimiter();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("showRateLimitedErrorToast", () => {
    it("should show toast on first call", () => {
      showRateLimitedErrorToast("Error message");

      expect(toast.error).toHaveBeenCalledTimes(1);
      expect(toast.error).toHaveBeenCalledWith("Error message");
    });

    it("should suppress rapid consecutive calls", () => {
      showRateLimitedErrorToast("Error 1");
      showRateLimitedErrorToast("Error 2");
      showRateLimitedErrorToast("Error 3");

      // Only first call should show toast
      expect(toast.error).toHaveBeenCalledTimes(1);
      expect(toast.error).toHaveBeenCalledWith("Error 1");
    });

    it("should allow toast after cooldown period", () => {
      showRateLimitedErrorToast("Error 1");
      expect(toast.error).toHaveBeenCalledTimes(1);

      // Advance past cooldown (2000ms)
      vi.advanceTimersByTime(2100);

      showRateLimitedErrorToast("Error 2");
      expect(toast.error).toHaveBeenCalledTimes(2);
      expect(toast.error).toHaveBeenLastCalledWith("Error 2");
    });

    it("should suppress toast within cooldown period", () => {
      showRateLimitedErrorToast("Error 1");

      // Advance less than cooldown (2000ms)
      vi.advanceTimersByTime(1500);

      showRateLimitedErrorToast("Error 2");
      expect(toast.error).toHaveBeenCalledTimes(1);
    });

    it("should handle many rapid calls without crashing", () => {
      // Simulate toast bomb scenario
      for (let i = 0; i < 1000; i++) {
        showRateLimitedErrorToast(`Error ${i}`);
      }

      // Only first toast should show
      expect(toast.error).toHaveBeenCalledTimes(1);
    });
  });

  describe("resetToastRateLimiter", () => {
    it("should allow immediate toast after reset", () => {
      showRateLimitedErrorToast("Error 1");
      expect(toast.error).toHaveBeenCalledTimes(1);

      // Without advancing time, second call would be suppressed
      showRateLimitedErrorToast("Error 2");
      expect(toast.error).toHaveBeenCalledTimes(1);

      // Reset and try again
      resetToastRateLimiter();
      showRateLimitedErrorToast("Error 3");
      expect(toast.error).toHaveBeenCalledTimes(2);
    });
  });
});
