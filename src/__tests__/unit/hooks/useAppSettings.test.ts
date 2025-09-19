import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
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
    const initData = { restartScan: true, launchOnScan: false };
    
    const { result } = renderHook(() => useAppSettings({ initData }));
    
    expect(result.current.restartScan).toBe(true);
    expect(result.current.launchOnScan).toBe(false);
    expect(result.current.launcherAccess).toBe(false);
  });

  it("should load settings from Preferences and update state", async () => {
    // Mock preferences to return specific values
    vi.mocked(Preferences.get)
      .mockImplementation(({ key }) => {
        const values: Record<string, string> = {
          restartScan: "false",
          launchOnScan: "true",
          launcherAccess: "true",
          preferRemoteWriter: "true"
        };
        return Promise.resolve({ value: values[key] });
      });

    const initData = { restartScan: true, launchOnScan: false };

    const { result } = renderHook(() => useAppSettings({ initData }));

    // Wait for preferences to load
    await waitFor(() => {
      expect(result.current.restartScan).toBe(false);
      expect(result.current.launchOnScan).toBe(true);
      expect(result.current.launcherAccess).toBe(true);
      expect(result.current.preferRemoteWriter).toBe(true);
    });
  });

  it("should persist restartScan setting when changed", async () => {
    const initData = { restartScan: false, launchOnScan: true };

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
    const initData = { restartScan: false, launchOnScan: true };

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
    const initData = { restartScan: false, launchOnScan: true };

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