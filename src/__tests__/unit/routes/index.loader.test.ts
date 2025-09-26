import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock Capacitor Preferences
vi.mock("@capacitor/preferences", () => ({
  Preferences: {
    get: vi.fn()
  }
}));

describe("Index Route Loader", () => {
  let mockPreferencesGet: any;
  let Route: any;

  beforeEach(async () => {
    vi.clearAllMocks();

    // Get the mock function
    const { Preferences } = await import("@capacitor/preferences");
    mockPreferencesGet = vi.mocked(Preferences.get);

    // Import route after mocking
    const routeModule = await import("../../../routes/index");
    Route = routeModule.Route;
  });

  it("should load all preferences with default values", async () => {
    // Mock preferences returning default values
    mockPreferencesGet
      .mockResolvedValueOnce({ value: null }) // restartScan
      .mockResolvedValueOnce({ value: null }) // launchOnScan
      .mockResolvedValueOnce({ value: null }) // launcherAccess
      .mockResolvedValueOnce({ value: null }); // preferRemoteWriter

    const result = await Route.options?.loader?.();

    expect(result).toEqual({
      restartScan: false, // null converts to false
      launchOnScan: true, // null converts to true (default)
      launcherAccess: false, // null converts to false
      preferRemoteWriter: false // null converts to false
    });

    expect(mockPreferencesGet).toHaveBeenCalledTimes(4);
    expect(mockPreferencesGet).toHaveBeenCalledWith({ key: "restartScan" });
    expect(mockPreferencesGet).toHaveBeenCalledWith({ key: "launchOnScan" });
    expect(mockPreferencesGet).toHaveBeenCalledWith({ key: "launcherAccess" });
    expect(mockPreferencesGet).toHaveBeenCalledWith({ key: "preferRemoteWriter" });
  });

  it("should load preferences with true values", async () => {
    mockPreferencesGet
      .mockResolvedValueOnce({ value: "true" })
      .mockResolvedValueOnce({ value: "true" })
      .mockResolvedValueOnce({ value: "true" })
      .mockResolvedValueOnce({ value: "true" });

    const result = await Route.options?.loader?.();

    expect(result).toEqual({
      restartScan: true,
      launchOnScan: true,
      launcherAccess: true,
      preferRemoteWriter: true
    });
  });

  it("should load preferences with false values", async () => {
    mockPreferencesGet
      .mockResolvedValueOnce({ value: "false" })
      .mockResolvedValueOnce({ value: "false" })
      .mockResolvedValueOnce({ value: "false" })
      .mockResolvedValueOnce({ value: "false" });

    const result = await Route.options?.loader?.();

    expect(result).toEqual({
      restartScan: false,
      launchOnScan: false, // "false" string converts to false
      launcherAccess: false,
      preferRemoteWriter: false
    });
  });

  it("should handle mixed preference values", async () => {
    mockPreferencesGet
      .mockResolvedValueOnce({ value: "true" })
      .mockResolvedValueOnce({ value: "false" })
      .mockResolvedValueOnce({ value: null })
      .mockResolvedValueOnce({ value: "true" });

    const result = await Route.options?.loader?.();

    expect(result).toEqual({
      restartScan: true,
      launchOnScan: false,
      launcherAccess: false,
      preferRemoteWriter: true
    });
  });

  it("should handle preferences API failures gracefully", async () => {
    mockPreferencesGet
      .mockResolvedValueOnce({ value: "true" })
      .mockRejectedValueOnce(new Error("Preferences error"))
      .mockResolvedValueOnce({ value: "true" })
      .mockResolvedValueOnce({ value: "false" });

    await expect(Route.options?.loader?.()).rejects.toThrow("Preferences error");
  });

  it("should handle partial preferences API failures", async () => {
    // Test when some preferences fail but others succeed
    mockPreferencesGet
      .mockResolvedValueOnce({ value: "true" })
      .mockResolvedValueOnce({ value: "false" })
      .mockRejectedValueOnce(new Error("launcherAccess failed"))
      .mockResolvedValueOnce({ value: "true" });

    await expect(Route.options?.loader?.()).rejects.toThrow("launcherAccess failed");
  });

  it("should handle undefined preference values", async () => {
    mockPreferencesGet
      .mockResolvedValueOnce({ value: undefined })
      .mockResolvedValueOnce({ value: undefined })
      .mockResolvedValueOnce({ value: undefined })
      .mockResolvedValueOnce({ value: undefined });

    const result = await Route.options?.loader?.();

    expect(result).toEqual({
      restartScan: false,
      launchOnScan: true, // undefined should default to true for launchOnScan
      launcherAccess: false,
      preferRemoteWriter: false
    });
  });

  it("should handle non-boolean string values", async () => {
    // Test edge case with unexpected string values
    mockPreferencesGet
      .mockResolvedValueOnce({ value: "yes" })
      .mockResolvedValueOnce({ value: "no" })
      .mockResolvedValueOnce({ value: "1" })
      .mockResolvedValueOnce({ value: "0" });

    const result = await Route.options?.loader?.();

    // All non-"true" strings should be treated as false, except launchOnScan defaults to true
    expect(result).toEqual({
      restartScan: false, // "yes" !== "true"
      launchOnScan: true, // "no" !== "false" so defaults to true
      launcherAccess: false, // "1" !== "true"
      preferRemoteWriter: false // "0" !== "true"
    });
  });

  it("should call all preferences in parallel", async () => {
    const promises: Promise<any>[] = [];
    mockPreferencesGet.mockImplementation(() => {
      const promise = Promise.resolve({ value: "true" });
      promises.push(promise);
      return promise;
    });

    await Route.options?.loader?.();

    // All 4 promises should be created before any resolve
    expect(promises).toHaveLength(4);
  });
});