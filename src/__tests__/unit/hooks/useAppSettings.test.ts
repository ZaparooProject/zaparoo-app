import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useAppSettings } from "../../../hooks/useAppSettings";
import { Preferences } from "@capacitor/preferences";
// sessionManager is mocked in nfc mock

vi.mock("@capacitor/preferences", () => import("../../../__mocks__/@capacitor/preferences"));
vi.mock("../../../lib/nfc");

describe("useAppSettings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should initialize with provided initData", () => {
    const initData = { restartScan: true, launchOnScan: false, launcherAccess: false, preferRemoteWriter: false };

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
      preferRemoteWriter: true
    };

    const { result } = renderHook(() => useAppSettings({ initData }));

    // Values should be initialized from initData, not loaded asynchronously
    expect(result.current.restartScan).toBe(true);
    expect(result.current.launchOnScan).toBe(false);
    expect(result.current.launcherAccess).toBe(true);
    expect(result.current.preferRemoteWriter).toBe(true);
  });

  it("should persist restartScan setting when changed", async () => {
    const initData = { restartScan: false, launchOnScan: true, launcherAccess: false, preferRemoteWriter: false };

    const { result } = renderHook(() => useAppSettings({ initData }));

    // Change the setting
    act(() => {
      result.current.setRestartScan(true);
    });

    expect(result.current.restartScan).toBe(true);
    expect(Preferences.set).toHaveBeenCalledWith({
      key: "restartScan",
      value: "true"
    });
  });

  it("should persist launchOnScan setting when changed", async () => {
    const initData = { restartScan: false, launchOnScan: true, launcherAccess: false, preferRemoteWriter: false };

    const { result } = renderHook(() => useAppSettings({ initData }));

    // Change the setting
    act(() => {
      result.current.setLaunchOnScan(false);
    });

    expect(result.current.launchOnScan).toBe(false);
    expect(Preferences.set).toHaveBeenCalledWith({
      key: "launchOnScan",
      value: "false"
    });
  });

  it("should persist preferRemoteWriter setting when changed", async () => {
    const initData = { restartScan: false, launchOnScan: true, launcherAccess: false, preferRemoteWriter: false };

    const { result } = renderHook(() => useAppSettings({ initData }));

    // Change the setting
    act(() => {
      result.current.setPreferRemoteWriter(true);
    });

    expect(result.current.preferRemoteWriter).toBe(true);
    expect(Preferences.set).toHaveBeenCalledWith({
      key: "preferRemoteWriter",
      value: "true"
    });
  });
});