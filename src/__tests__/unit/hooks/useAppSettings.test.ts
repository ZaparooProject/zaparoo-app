import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useAppSettings } from "../../../hooks/useAppSettings";
import { Preferences } from "@capacitor/preferences";
import { sessionManager } from "../../../lib/nfc";

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
          launcherAccess: "true"
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
    });
  });
});