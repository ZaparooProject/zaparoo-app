import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the preferences store
vi.mock("../../../lib/preferencesStore", () => ({
  usePreferencesStore: {
    getState: vi.fn(),
  },
  selectAppSettings: vi.fn(),
  selectShakeSettings: vi.fn(),
}));

describe("Index Route Loader", () => {
  let mockGetState: any;
  let Route: any;

  beforeEach(async () => {
    vi.clearAllMocks();

    // Get the mock function
    const { usePreferencesStore } =
      await import("../../../lib/preferencesStore");
    mockGetState = vi.mocked(usePreferencesStore.getState);

    // Import route after mocking
    const routeModule = await import("../../../routes/index");
    Route = routeModule.Route;
  });

  it("should load all preferences with default values", () => {
    // Mock store returning default values
    mockGetState.mockReturnValue({
      restartScan: false,
      launchOnScan: true,
      launcherAccess: false,
      preferRemoteWriter: false,
      shakeEnabled: false,
      shakeMode: "random",
      shakeZapscript: "",
      tourCompleted: false,
    });

    const result = Route.options?.loader?.();

    // Loader only returns specific fields, not all store state
    expect(result).toEqual({
      restartScan: false,
      launchOnScan: true,
      launcherAccess: false,
      preferRemoteWriter: false,
      shakeMode: "random",
      shakeZapscript: "",
    });

    expect(mockGetState).toHaveBeenCalledTimes(1);
  });

  it("should load preferences with true values", () => {
    mockGetState.mockReturnValue({
      restartScan: true,
      launchOnScan: true,
      launcherAccess: true,
      preferRemoteWriter: true,
      shakeEnabled: true,
      shakeMode: "custom",
      shakeZapscript: "**launch.system:snes",
      tourCompleted: true,
    });

    const result = Route.options?.loader?.();

    // Loader only returns specific fields, not all store state
    expect(result).toEqual({
      restartScan: true,
      launchOnScan: true,
      launcherAccess: true,
      preferRemoteWriter: true,
      shakeMode: "custom",
      shakeZapscript: "**launch.system:snes",
    });
  });

  it("should load preferences with false values", () => {
    mockGetState.mockReturnValue({
      restartScan: false,
      launchOnScan: false,
      launcherAccess: false,
      preferRemoteWriter: false,
      shakeEnabled: false,
      shakeMode: "random",
      shakeZapscript: "",
      tourCompleted: false,
    });

    const result = Route.options?.loader?.();

    // Loader only returns specific fields, not all store state
    expect(result).toEqual({
      restartScan: false,
      launchOnScan: false,
      launcherAccess: false,
      preferRemoteWriter: false,
      shakeMode: "random",
      shakeZapscript: "",
    });
  });

  it("should handle mixed preference values", () => {
    mockGetState.mockReturnValue({
      restartScan: true,
      launchOnScan: false,
      launcherAccess: true,
      preferRemoteWriter: false,
      shakeEnabled: true,
      shakeMode: "custom",
      shakeZapscript: "**some.command",
      tourCompleted: true,
    });

    const result = Route.options?.loader?.();

    // Loader only returns specific fields, not all store state
    expect(result).toEqual({
      restartScan: true,
      launchOnScan: false,
      launcherAccess: true,
      preferRemoteWriter: false,
      shakeMode: "custom",
      shakeZapscript: "**some.command",
    });
  });

  it("should be synchronous (not async)", () => {
    mockGetState.mockReturnValue({
      restartScan: false,
      launchOnScan: true,
      launcherAccess: false,
      preferRemoteWriter: false,
      shakeEnabled: false,
      shakeMode: "random",
      shakeZapscript: "",
      tourCompleted: false,
    });

    const result = Route.options?.loader?.();

    // Should return immediately, not a Promise
    expect(result).not.toBeInstanceOf(Promise);
    expect(typeof result).toBe("object");
  });

  it("should get state from store, not make async calls", () => {
    mockGetState.mockReturnValue({
      restartScan: false,
      launchOnScan: true,
      launcherAccess: false,
      preferRemoteWriter: false,
      shakeEnabled: false,
      shakeMode: "random",
      shakeZapscript: "",
      tourCompleted: false,
    });

    Route.options?.loader?.();

    // Should call getState, which is synchronous
    expect(mockGetState).toHaveBeenCalled();
  });
});
