/**
 * Unit tests for tokenOperations
 *
 * Tests the runToken function including the canQueueCommands parameter
 * which controls whether commands are queued when disconnected.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { runToken } from "../../../lib/tokenOperations";

// Mock dependencies
vi.mock("react-hot-toast", () => ({
  default: {
    error: vi.fn(),
  },
}));

vi.mock("../../../lib/coreApi", () => ({
  CoreAPI: {
    run: vi.fn().mockResolvedValue({}),
  },
}));

vi.mock("../../../lib/nfc", () => ({
  sessionManager: {
    launchOnScan: true,
  },
}));

vi.mock("../../../lib/logger", () => ({
  logger: {
    log: vi.fn(),
    error: vi.fn(),
  },
}));

import { CoreAPI } from "../../../lib/coreApi";
import { sessionManager } from "../../../lib/nfc";
import { logger } from "../../../lib/logger";

describe("runToken", () => {
  const mockSetLastToken = vi.fn();
  const mockSetProPurchaseModalOpen = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    // Reset sessionManager.launchOnScan to true for each test
    (sessionManager as { launchOnScan: boolean }).launchOnScan = true;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("basic behavior", () => {
    it("should return false for empty uid and text", async () => {
      const result = await runToken(
        "",
        "",
        true,
        true,
        mockSetLastToken,
        mockSetProPurchaseModalOpen,
      );

      expect(result).toBe(false);
      expect(mockSetLastToken).not.toHaveBeenCalled();
    });

    it("should set last token with provided values", async () => {
      const result = runToken(
        "uid123",
        "token text",
        true,
        true,
        mockSetLastToken,
        mockSetProPurchaseModalOpen,
      );

      // Need to advance timers since connected=true runs immediately
      await vi.runAllTimersAsync();
      await result;

      expect(mockSetLastToken).toHaveBeenCalledWith(
        expect.objectContaining({
          uid: "uid123",
          text: "token text",
        }),
      );
    });

    it("should return true without launching when launchOnScan is false", async () => {
      (sessionManager as { launchOnScan: boolean }).launchOnScan = false;

      const result = await runToken(
        "uid123",
        "token text",
        true,
        true,
        mockSetLastToken,
        mockSetProPurchaseModalOpen,
      );

      expect(result).toBe(true);
      expect(CoreAPI.run).not.toHaveBeenCalled();
    });
  });

  describe("canQueueCommands parameter", () => {
    it("should queue launch when disconnected and canQueueCommands is true (default)", async () => {
      const resultPromise = runToken(
        "uid123",
        "https://zpr.au/test",
        true, // launcherAccess
        false, // connected = false
        mockSetLastToken,
        mockSetProPurchaseModalOpen,
        false, // unsafe
        false, // override
        true, // canQueueCommands = true (default)
      );

      // Should NOT log offline scan message
      expect(logger.log).not.toHaveBeenCalledWith(
        "Offline scan - storing token without queueing launch",
      );

      // Advance timers to trigger the delayed run
      await vi.advanceTimersByTimeAsync(600);
      await resultPromise;

      // Should call CoreAPI.run
      expect(CoreAPI.run).toHaveBeenCalledWith({
        uid: "uid123",
        text: "https://zpr.au/test",
        unsafe: false,
      });
    });

    it("should NOT queue launch when disconnected and canQueueCommands is false", async () => {
      const result = await runToken(
        "uid123",
        "https://zpr.au/test",
        true, // launcherAccess
        false, // connected = false
        mockSetLastToken,
        mockSetProPurchaseModalOpen,
        false, // unsafe
        false, // override
        false, // canQueueCommands = false
      );

      expect(result).toBe(true);
      expect(logger.log).toHaveBeenCalledWith(
        "Offline scan - storing token without queueing launch",
      );
      expect(CoreAPI.run).not.toHaveBeenCalled();
    });

    it("should still set lastToken when canQueueCommands is false", async () => {
      await runToken(
        "uid123",
        "https://zpr.au/test",
        true,
        false, // disconnected
        mockSetLastToken,
        mockSetProPurchaseModalOpen,
        false,
        false,
        false, // canQueueCommands = false
      );

      expect(mockSetLastToken).toHaveBeenCalledWith(
        expect.objectContaining({
          uid: "uid123",
          text: "https://zpr.au/test",
        }),
      );
    });

    it("should run immediately when connected regardless of canQueueCommands", async () => {
      const resultPromise = runToken(
        "uid123",
        "https://zpr.au/test",
        true,
        true, // connected
        mockSetLastToken,
        mockSetProPurchaseModalOpen,
        false,
        false,
        false, // canQueueCommands = false, but connected so irrelevant
      );

      await vi.runAllTimersAsync();
      await resultPromise;

      expect(CoreAPI.run).toHaveBeenCalled();
      expect(logger.log).not.toHaveBeenCalledWith(
        "Offline scan - storing token without queueing launch",
      );
    });
  });

  describe("Zap URL handling", () => {
    it("should allow launch for zpr.au URLs without Pro access", async () => {
      const resultPromise = runToken(
        "",
        "https://zpr.au/sometoken",
        false, // no launcher access
        true,
        mockSetLastToken,
        mockSetProPurchaseModalOpen,
      );

      await vi.runAllTimersAsync();
      await resultPromise;

      expect(CoreAPI.run).toHaveBeenCalled();
      expect(mockSetProPurchaseModalOpen).not.toHaveBeenCalled();
    });

    it("should allow launch for zaparoo.link URLs without Pro access", async () => {
      const resultPromise = runToken(
        "",
        "https://zaparoo.link/token",
        false,
        true,
        mockSetLastToken,
        mockSetProPurchaseModalOpen,
      );

      await vi.runAllTimersAsync();
      await resultPromise;

      expect(CoreAPI.run).toHaveBeenCalled();
    });

    it("should show Pro purchase modal for non-Zap URLs without Pro access", async () => {
      const result = await runToken(
        "uid123",
        "regular token",
        false, // no launcher access
        true,
        mockSetLastToken,
        mockSetProPurchaseModalOpen,
      );

      expect(result).toBe(false);
      expect(mockSetProPurchaseModalOpen).toHaveBeenCalledWith(true);
      expect(CoreAPI.run).not.toHaveBeenCalled();
    });
  });

  describe("override parameter", () => {
    it("should allow launch with override even without Pro access", async () => {
      const resultPromise = runToken(
        "uid123",
        "regular token",
        false, // no launcher access
        true,
        mockSetLastToken,
        mockSetProPurchaseModalOpen,
        false, // unsafe
        true, // override
      );

      await vi.runAllTimersAsync();
      await resultPromise;

      expect(CoreAPI.run).toHaveBeenCalled();
      expect(mockSetProPurchaseModalOpen).not.toHaveBeenCalled();
    });
  });

  /**
   * REGRESSION TESTS: Pro Feature Gating
   *
   * These tests ensure the Pro purchase flow works correctly:
   * - launchOnScan defaults to ON
   * - Non-Pro users see purchase modal when trying to launch
   * - NFC/camera scans can work as read-only when launchOnScan is OFF
   * - Shake to launch always requires Pro check (no read-only fallback)
   * - Zap URLs bypass Pro check entirely
   */
  describe("requiresLaunch parameter (Pro feature gating)", () => {
    describe("when requiresLaunch is FALSE (NFC/camera scans)", () => {
      it("should return true without launching when launchOnScan is OFF (read-only mode)", async () => {
        (sessionManager as { launchOnScan: boolean }).launchOnScan = false;

        const result = await runToken(
          "uid123",
          "regular token",
          false, // no Pro access
          true, // connected
          mockSetLastToken,
          mockSetProPurchaseModalOpen,
          false, // unsafe
          false, // override
          true, // canQueueCommands
          false, // requiresLaunch = false (NFC/camera behavior)
        );

        expect(result).toBe(true);
        expect(mockSetLastToken).toHaveBeenCalled(); // Token still stored
        expect(mockSetProPurchaseModalOpen).not.toHaveBeenCalled(); // NO Pro modal
        expect(CoreAPI.run).not.toHaveBeenCalled(); // NO launch
      });

      it("should show Pro modal when launchOnScan is ON without Pro access", async () => {
        (sessionManager as { launchOnScan: boolean }).launchOnScan = true;

        const result = await runToken(
          "uid123",
          "regular token",
          false, // no Pro access
          true, // connected
          mockSetLastToken,
          mockSetProPurchaseModalOpen,
          false, // unsafe
          false, // override
          true, // canQueueCommands
          false, // requiresLaunch = false (NFC/camera behavior)
        );

        expect(result).toBe(false);
        expect(mockSetLastToken).toHaveBeenCalled(); // Token stored before check
        expect(mockSetProPurchaseModalOpen).toHaveBeenCalledWith(true); // Pro modal shown
        expect(CoreAPI.run).not.toHaveBeenCalled(); // NO launch
      });

      it("should launch when launchOnScan is ON with Pro access", async () => {
        (sessionManager as { launchOnScan: boolean }).launchOnScan = true;

        const resultPromise = runToken(
          "uid123",
          "regular token",
          true, // has Pro access
          true, // connected
          mockSetLastToken,
          mockSetProPurchaseModalOpen,
          false, // unsafe
          false, // override
          true, // canQueueCommands
          false, // requiresLaunch = false (NFC/camera behavior)
        );

        await vi.runAllTimersAsync();
        const result = await resultPromise;

        expect(result).toBe(true);
        expect(mockSetProPurchaseModalOpen).not.toHaveBeenCalled();
        expect(CoreAPI.run).toHaveBeenCalled(); // Launch happens
      });
    });

    describe("when requiresLaunch is TRUE (shake to launch)", () => {
      it("should show Pro modal even when launchOnScan is OFF (no read-only fallback)", async () => {
        (sessionManager as { launchOnScan: boolean }).launchOnScan = false;

        const result = await runToken(
          "uid123",
          "regular token",
          false, // no Pro access
          true, // connected
          mockSetLastToken,
          mockSetProPurchaseModalOpen,
          false, // unsafe
          false, // override
          true, // canQueueCommands
          true, // requiresLaunch = true (shake behavior)
        );

        expect(result).toBe(false);
        expect(mockSetLastToken).toHaveBeenCalled(); // Token stored
        expect(mockSetProPurchaseModalOpen).toHaveBeenCalledWith(true); // Pro modal SHOWN
        expect(CoreAPI.run).not.toHaveBeenCalled();
      });

      it("should show Pro modal when launchOnScan is ON without Pro access", async () => {
        (sessionManager as { launchOnScan: boolean }).launchOnScan = true;

        const result = await runToken(
          "uid123",
          "regular token",
          false, // no Pro access
          true, // connected
          mockSetLastToken,
          mockSetProPurchaseModalOpen,
          false, // unsafe
          false, // override
          true, // canQueueCommands
          true, // requiresLaunch = true (shake behavior)
        );

        expect(result).toBe(false);
        expect(mockSetProPurchaseModalOpen).toHaveBeenCalledWith(true);
        expect(CoreAPI.run).not.toHaveBeenCalled();
      });

      it("should launch with Pro access regardless of launchOnScan setting", async () => {
        (sessionManager as { launchOnScan: boolean }).launchOnScan = false;

        const resultPromise = runToken(
          "uid123",
          "regular token",
          true, // has Pro access
          true, // connected
          mockSetLastToken,
          mockSetProPurchaseModalOpen,
          false, // unsafe
          false, // override
          true, // canQueueCommands
          true, // requiresLaunch = true (shake behavior)
        );

        await vi.runAllTimersAsync();
        const result = await resultPromise;

        expect(result).toBe(true);
        expect(mockSetProPurchaseModalOpen).not.toHaveBeenCalled();
        expect(CoreAPI.run).toHaveBeenCalled();
      });

      it("should bypass Pro check for Zap URLs even with requiresLaunch=true", async () => {
        const resultPromise = runToken(
          "",
          "https://zpr.au/test",
          false, // no Pro access
          true, // connected
          mockSetLastToken,
          mockSetProPurchaseModalOpen,
          false, // unsafe
          false, // override
          true, // canQueueCommands
          true, // requiresLaunch = true
        );

        await vi.runAllTimersAsync();
        const result = await resultPromise;

        expect(result).toBe(true);
        expect(mockSetProPurchaseModalOpen).not.toHaveBeenCalled(); // NO Pro modal
        expect(CoreAPI.run).toHaveBeenCalled(); // Launch happens
      });
    });

    describe("Zap URL handling with Pro gating", () => {
      const zapUrls = [
        "https://zpr.au/token123",
        "https://zaparoo.link/mytoken",
        "https://go.tapto.life/abc",
        "HTTPS://ZPR.AU/UPPERCASE", // Case insensitive
      ];

      zapUrls.forEach((url) => {
        it(`should bypass Pro check for ${url.split("/")[2]}`, async () => {
          (sessionManager as { launchOnScan: boolean }).launchOnScan = true;

          const resultPromise = runToken(
            "",
            url,
            false, // no Pro access
            true,
            mockSetLastToken,
            mockSetProPurchaseModalOpen,
            false,
            false,
            true,
            false, // NFC/camera scan behavior
          );

          await vi.runAllTimersAsync();
          const result = await resultPromise;

          expect(result).toBe(true);
          expect(mockSetProPurchaseModalOpen).not.toHaveBeenCalled();
          expect(CoreAPI.run).toHaveBeenCalled();
        });
      });

      it("should NOT bypass Pro check for similar but different URLs", async () => {
        (sessionManager as { launchOnScan: boolean }).launchOnScan = true;

        const result = await runToken(
          "",
          "https://zpr.fake/token", // NOT a valid Zap URL
          false, // no Pro access
          true,
          mockSetLastToken,
          mockSetProPurchaseModalOpen,
        );

        expect(result).toBe(false);
        expect(mockSetProPurchaseModalOpen).toHaveBeenCalledWith(true);
        expect(CoreAPI.run).not.toHaveBeenCalled();
      });
    });
  });
});
