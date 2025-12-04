import { describe, it, expect, vi, beforeEach } from "vitest";
import { Capacitor } from "@capacitor/core";
import { SafeArea } from "capacitor-plugin-safe-area";

// Mock dependencies
vi.mock("@capacitor/core", () => ({
  Capacitor: {
    isNativePlatform: vi.fn(),
    getPlatform: vi.fn(),
  },
}));

vi.mock("capacitor-plugin-safe-area", () => ({
  SafeArea: {
    getSafeAreaInsets: vi.fn(),
    addListener: vi.fn(),
  },
}));

vi.mock("@/lib/logger", () => ({
  logger: {
    error: vi.fn(),
  },
}));

describe("safeArea", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  describe("initSafeAreaInsets", () => {
    it("should use env() values for web platform and return early", async () => {
      vi.mocked(Capacitor.isNativePlatform).mockReturnValue(false);

      const { initSafeAreaInsets } = await import("@/lib/safeArea");
      const setInsets = vi.fn();

      await initSafeAreaInsets(setInsets);

      expect(setInsets).toHaveBeenCalledWith({
        top: "env(safe-area-inset-top, 0px)",
        bottom: "env(safe-area-inset-bottom, 0px)",
        left: "env(safe-area-inset-left, 0px)",
        right: "env(safe-area-inset-right, 0px)",
      });

      // Should NOT call the native plugin on web
      expect(SafeArea.getSafeAreaInsets).not.toHaveBeenCalled();
    });

    it("should use SafeArea plugin values on native platform", async () => {
      vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);
      vi.mocked(Capacitor.getPlatform).mockReturnValue("ios");
      vi.mocked(SafeArea.getSafeAreaInsets).mockResolvedValue({
        insets: { top: 47, bottom: 34, left: 0, right: 0 },
      });
      vi.mocked(SafeArea.addListener).mockResolvedValue({ remove: vi.fn() });

      const { initSafeAreaInsets } = await import("@/lib/safeArea");
      const setInsets = vi.fn();

      await initSafeAreaInsets(setInsets);

      expect(SafeArea.getSafeAreaInsets).toHaveBeenCalled();
      expect(setInsets).toHaveBeenCalledWith({
        top: "47px",
        bottom: "34px",
        left: "0px",
        right: "0px",
      });
    });

    it("should register listener for safe area changes on native when listen=true", async () => {
      vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);
      vi.mocked(SafeArea.getSafeAreaInsets).mockResolvedValue({
        insets: { top: 47, bottom: 34, left: 0, right: 0 },
      });
      vi.mocked(SafeArea.addListener).mockResolvedValue({ remove: vi.fn() });

      const { initSafeAreaInsets } = await import("@/lib/safeArea");
      const setInsets = vi.fn();

      await initSafeAreaInsets(setInsets, true);

      expect(SafeArea.addListener).toHaveBeenCalledWith(
        "safeAreaChanged",
        expect.any(Function),
      );
    });

    it("should NOT register listener when listen=false", async () => {
      vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);
      vi.mocked(SafeArea.getSafeAreaInsets).mockResolvedValue({
        insets: { top: 47, bottom: 34, left: 0, right: 0 },
      });

      const { initSafeAreaInsets } = await import("@/lib/safeArea");
      const setInsets = vi.fn();

      await initSafeAreaInsets(setInsets, false);

      expect(SafeArea.addListener).not.toHaveBeenCalled();
    });

    it("should handle SafeArea plugin errors gracefully", async () => {
      vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);
      vi.mocked(SafeArea.getSafeAreaInsets).mockRejectedValue(
        new Error("Plugin not available"),
      );

      const { initSafeAreaInsets } = await import("@/lib/safeArea");
      const setInsets = vi.fn();

      // Should not throw
      await expect(initSafeAreaInsets(setInsets)).resolves.toBeUndefined();
    });

    it("should update insets when safeAreaChanged event fires", async () => {
      vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);
      vi.mocked(SafeArea.getSafeAreaInsets).mockResolvedValue({
        insets: { top: 47, bottom: 34, left: 0, right: 0 },
      });

      let listenerCallback: ((data: { insets: any }) => void) | null = null;
      vi.mocked(SafeArea.addListener).mockImplementation(
        async (_event, callback) => {
          listenerCallback = callback;
          return { remove: vi.fn() };
        },
      );

      const { initSafeAreaInsets } = await import("@/lib/safeArea");
      const setInsets = vi.fn();

      await initSafeAreaInsets(setInsets);

      // Simulate orientation change
      listenerCallback!({
        insets: { top: 0, bottom: 34, left: 47, right: 47 },
      });

      expect(setInsets).toHaveBeenLastCalledWith({
        top: "0px",
        bottom: "34px",
        left: "47px",
        right: "47px",
      });
    });
  });

  describe("defaultSafeAreaInsets", () => {
    it("should have zero values as defaults", async () => {
      const { defaultSafeAreaInsets } = await import("@/lib/safeArea");

      expect(defaultSafeAreaInsets).toEqual({
        top: "0px",
        bottom: "0px",
        left: "0px",
        right: "0px",
      });
    });
  });
});
