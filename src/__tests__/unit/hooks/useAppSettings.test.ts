import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "../../../test-utils";
import { useAppSettings } from "../../../hooks/useAppSettings";
import { Preferences } from "@capacitor/preferences";

// Mock sessionManager with the functions we need to test
vi.mock("../../../lib/nfc", () => ({
  sessionManager: {
    setShouldRestart: vi.fn(),
    setLaunchOnScan: vi.fn(),
    shouldRestart: false,
    launchOnScan: true,
  },
}));

import { sessionManager } from "../../../lib/nfc";

describe("useAppSettings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should initialize with provided initData", () => {
    const initData = {
      restartScan: true,
      launchOnScan: false,
      launcherAccess: false,
      preferRemoteWriter: false,
      shakeEnabled: false,
      shakeMode: "random" as const,
      shakeZapscript: "",
    };

    const { result } = renderHook(() => useAppSettings({ initData }));

    expect(result.current.restartScan).toBe(true);
    expect(result.current.launchOnScan).toBe(false);
    expect(result.current.launcherAccess).toBe(false);
  });

  it("should initialize with all provided initData values", async () => {
    const initData = {
      restartScan: true,
      launchOnScan: false,
      launcherAccess: true,
      preferRemoteWriter: true,
      shakeEnabled: false,
      shakeMode: "random" as const,
      shakeZapscript: "test-script",
    };

    const { result } = renderHook(() => useAppSettings({ initData }));

    // Verify all 7 properties are initialized from initData
    expect(result.current.restartScan).toBe(true);
    expect(result.current.launchOnScan).toBe(false);
    expect(result.current.launcherAccess).toBe(true);
    expect(result.current.preferRemoteWriter).toBe(true);
    expect(result.current.shakeEnabled).toBe(false);
    expect(result.current.shakeMode).toBe("random");
    expect(result.current.shakeZapscript).toBe("test-script");
  });

  it("should persist restartScan setting when changed", async () => {
    const initData = {
      restartScan: false,
      launchOnScan: true,
      launcherAccess: false,
      preferRemoteWriter: false,
      shakeEnabled: false,
      shakeMode: "random" as const,
      shakeZapscript: "",
    };

    const { result } = renderHook(() => useAppSettings({ initData }));

    // Change the setting
    act(() => {
      result.current.setRestartScan(true);
    });

    expect(result.current.restartScan).toBe(true);
    expect(Preferences.set).toHaveBeenCalledWith({
      key: "restartScan",
      value: "true",
    });
  });

  it("should persist launchOnScan setting when changed", async () => {
    const initData = {
      restartScan: false,
      launchOnScan: true,
      launcherAccess: false,
      preferRemoteWriter: false,
      shakeEnabled: false,
      shakeMode: "random" as const,
      shakeZapscript: "",
    };

    const { result } = renderHook(() => useAppSettings({ initData }));

    // Change the setting
    act(() => {
      result.current.setLaunchOnScan(false);
    });

    expect(result.current.launchOnScan).toBe(false);
    expect(Preferences.set).toHaveBeenCalledWith({
      key: "launchOnScan",
      value: "false",
    });
  });

  it("should persist preferRemoteWriter setting when changed", async () => {
    const initData = {
      restartScan: false,
      launchOnScan: true,
      launcherAccess: false,
      preferRemoteWriter: false,
      shakeEnabled: false,
      shakeMode: "random" as const,
      shakeZapscript: "",
    };

    const { result } = renderHook(() => useAppSettings({ initData }));

    // Change the setting
    act(() => {
      result.current.setPreferRemoteWriter(true);
    });

    expect(result.current.preferRemoteWriter).toBe(true);
    expect(Preferences.set).toHaveBeenCalledWith({
      key: "preferRemoteWriter",
      value: "true",
    });
  });

  it("should persist shakeEnabled setting when changed", async () => {
    const initData = {
      restartScan: false,
      launchOnScan: false,
      launcherAccess: false,
      preferRemoteWriter: false,
      shakeEnabled: false,
      shakeMode: "random" as const,
      shakeZapscript: "",
    };

    const { result } = renderHook(() => useAppSettings({ initData }));

    act(() => {
      result.current.setShakeEnabled(true);
    });

    expect(result.current.shakeEnabled).toBe(true);
    expect(Preferences.set).toHaveBeenCalledWith({
      key: "shakeEnabled",
      value: "true",
    });
  });

  it("should persist shakeMode and clear zapscript when mode changes", async () => {
    const initData = {
      restartScan: false,
      launchOnScan: false,
      launcherAccess: false,
      preferRemoteWriter: false,
      shakeEnabled: true,
      shakeMode: "random" as const,
      shakeZapscript: "existing-script",
    };

    const { result } = renderHook(() => useAppSettings({ initData }));

    // Verify initial state
    expect(result.current.shakeZapscript).toBe("existing-script");

    act(() => {
      result.current.setShakeMode("custom");
    });

    expect(result.current.shakeMode).toBe("custom");
    // Should clear the zapscript when mode changes
    expect(result.current.shakeZapscript).toBe("");

    // Should persist both mode and cleared zapscript
    expect(Preferences.set).toHaveBeenCalledWith({
      key: "shakeMode",
      value: "custom",
    });
    expect(Preferences.set).toHaveBeenCalledWith({
      key: "shakeZapscript",
      value: "",
    });
  });

  it("should persist shakeZapscript when changed", async () => {
    const initData = {
      restartScan: false,
      launchOnScan: false,
      launcherAccess: false,
      preferRemoteWriter: false,
      shakeEnabled: true,
      shakeMode: "custom" as const,
      shakeZapscript: "",
    };

    const { result } = renderHook(() => useAppSettings({ initData }));

    act(() => {
      result.current.setShakeZapscript("**launch:snes/mario.sfc");
    });

    expect(result.current.shakeZapscript).toBe("**launch:snes/mario.sfc");
    expect(Preferences.set).toHaveBeenCalledWith({
      key: "shakeZapscript",
      value: "**launch:snes/mario.sfc",
    });
  });

  describe("sessionManager sync effects", () => {
    it("should sync restartScan to sessionManager on mount", async () => {
      const initData = {
        restartScan: true,
        launchOnScan: false,
        launcherAccess: false,
        preferRemoteWriter: false,
        shakeEnabled: false,
        shakeMode: "random" as const,
        shakeZapscript: "",
      };

      renderHook(() => useAppSettings({ initData }));

      await waitFor(() => {
        expect(sessionManager.setShouldRestart).toHaveBeenCalledWith(true);
      });
    });

    it("should sync launchOnScan to sessionManager on mount", async () => {
      const initData = {
        restartScan: false,
        launchOnScan: true,
        launcherAccess: false,
        preferRemoteWriter: false,
        shakeEnabled: false,
        shakeMode: "random" as const,
        shakeZapscript: "",
      };

      renderHook(() => useAppSettings({ initData }));

      await waitFor(() => {
        expect(sessionManager.setLaunchOnScan).toHaveBeenCalledWith(true);
      });
    });

    it("should sync restartScan to sessionManager when value changes", async () => {
      const initData = {
        restartScan: false,
        launchOnScan: false,
        launcherAccess: false,
        preferRemoteWriter: false,
        shakeEnabled: false,
        shakeMode: "random" as const,
        shakeZapscript: "",
      };

      const { result } = renderHook(() => useAppSettings({ initData }));

      // Initial sync with false
      await waitFor(() => {
        expect(sessionManager.setShouldRestart).toHaveBeenCalledWith(false);
      });

      // Change to true
      act(() => {
        result.current.setRestartScan(true);
      });

      await waitFor(() => {
        expect(sessionManager.setShouldRestart).toHaveBeenCalledWith(true);
      });
    });

    it("should sync launchOnScan to sessionManager when value changes", async () => {
      const initData = {
        restartScan: false,
        launchOnScan: false,
        launcherAccess: false,
        preferRemoteWriter: false,
        shakeEnabled: false,
        shakeMode: "random" as const,
        shakeZapscript: "",
      };

      const { result } = renderHook(() => useAppSettings({ initData }));

      // Initial sync with false
      await waitFor(() => {
        expect(sessionManager.setLaunchOnScan).toHaveBeenCalledWith(false);
      });

      // Change to true
      act(() => {
        result.current.setLaunchOnScan(true);
      });

      await waitFor(() => {
        expect(sessionManager.setLaunchOnScan).toHaveBeenCalledWith(true);
      });
    });
  });

  describe("error handling", () => {
    it("should handle Preferences.set error for restartScan gracefully", async () => {
      vi.mocked(Preferences.set).mockRejectedValueOnce(
        new Error("Storage error"),
      );

      const initData = {
        restartScan: false,
        launchOnScan: false,
        launcherAccess: false,
        preferRemoteWriter: false,
        shakeEnabled: false,
        shakeMode: "random" as const,
        shakeZapscript: "",
      };

      const { result } = renderHook(() => useAppSettings({ initData }));

      // Should not throw, state should still update locally
      act(() => {
        result.current.setRestartScan(true);
      });

      expect(result.current.restartScan).toBe(true);
    });

    it("should handle Preferences.set error for shakeMode gracefully", async () => {
      vi.mocked(Preferences.set).mockRejectedValueOnce(
        new Error("Storage error"),
      );

      const initData = {
        restartScan: false,
        launchOnScan: false,
        launcherAccess: false,
        preferRemoteWriter: false,
        shakeEnabled: true,
        shakeMode: "random" as const,
        shakeZapscript: "script",
      };

      const { result } = renderHook(() => useAppSettings({ initData }));

      // Should not throw, state should still update locally
      act(() => {
        result.current.setShakeMode("custom");
      });

      expect(result.current.shakeMode).toBe("custom");
      expect(result.current.shakeZapscript).toBe("");
    });
  });
});
