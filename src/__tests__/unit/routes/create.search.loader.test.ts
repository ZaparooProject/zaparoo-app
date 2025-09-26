import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock dependencies
vi.mock("@capacitor/preferences", () => ({
  Preferences: {
    get: vi.fn()
  }
}));

vi.mock("../../../lib/coreApi", () => ({
  CoreAPI: {
    systems: vi.fn()
  }
}));

describe("Create Search Route Loader", () => {
  let mockPreferencesGet: any;
  let mockCoreApiSystems: any;
  let Route: any;

  beforeEach(async () => {
    vi.clearAllMocks();

    // Get the mock functions
    const { Preferences } = await import("@capacitor/preferences");
    mockPreferencesGet = vi.mocked(Preferences.get);

    const { CoreAPI } = await import("../../../lib/coreApi");
    mockCoreApiSystems = vi.mocked(CoreAPI.systems);

    // Import route after mocking
    const routeModule = await import("../../../routes/create.search");
    Route = routeModule.Route;
  });

  it("should load search system preference and systems data", async () => {
    const mockSystemsResponse = {
      systems: [
        { id: "snes", name: "Super Nintendo" },
        { id: "genesis", name: "Sega Genesis" }
      ]
    };

    mockPreferencesGet.mockResolvedValue({ value: "snes" });
    mockCoreApiSystems.mockResolvedValue(mockSystemsResponse);

    const result = await Route.options?.loader?.({} as any);

    expect(result).toEqual({
      systemQuery: "snes",
      systems: mockSystemsResponse
    });

    expect(mockPreferencesGet).toHaveBeenCalledWith({ key: "searchSystem" });
    expect(mockCoreApiSystems).toHaveBeenCalledWith();
  });

  it("should use default 'all' when no search system preference exists", async () => {
    const mockSystemsResponse = { systems: [] };

    mockPreferencesGet.mockResolvedValue({ value: null });
    mockCoreApiSystems.mockResolvedValue(mockSystemsResponse);

    const result = await Route.options?.loader?.({} as any);

    expect(result).toEqual({
      systemQuery: "all",
      systems: mockSystemsResponse
    });
  });

  it("should use default 'all' when search system preference is undefined", async () => {
    const mockSystemsResponse = { systems: [] };

    mockPreferencesGet.mockResolvedValue({ value: undefined });
    mockCoreApiSystems.mockResolvedValue(mockSystemsResponse);

    const result = await Route.options?.loader?.({} as any);

    expect(result).toEqual({
      systemQuery: "all",
      systems: mockSystemsResponse
    });
  });

  it("should handle empty string preference", async () => {
    const mockSystemsResponse = { systems: [] };

    mockPreferencesGet.mockResolvedValue({ value: "" });
    mockCoreApiSystems.mockResolvedValue(mockSystemsResponse);

    const result = await Route.options?.loader?.({} as any);

    expect(result).toEqual({
      systemQuery: "all", // empty string should default to "all"
      systems: mockSystemsResponse
    });
  });

  it("should handle preferences API failure", async () => {
    mockPreferencesGet.mockRejectedValue(new Error("Preferences not available"));
    mockCoreApiSystems.mockResolvedValue({ systems: [] });

    await expect(Route.options?.loader?.({} as any)).rejects.toThrow("Preferences not available");

    // CoreAPI.systems is called in parallel, so it will be called even if preferences fail
    expect(mockCoreApiSystems).toHaveBeenCalled();
  });

  it("should handle CoreAPI systems failure", async () => {
    mockPreferencesGet.mockResolvedValue({ value: "snes" });
    mockCoreApiSystems.mockRejectedValue(new Error("Core API unavailable"));

    await expect(Route.options?.loader?.({} as any)).rejects.toThrow("Core API unavailable");
  });

  it("should handle both APIs failing", async () => {
    mockPreferencesGet.mockRejectedValue(new Error("Preferences failed"));
    mockCoreApiSystems.mockRejectedValue(new Error("Core API failed"));

    // Should fail on the first error (preferences)
    await expect(Route.options?.loader?.({} as any)).rejects.toThrow("Preferences failed");
  });

  it("should handle malformed systems response", async () => {
    mockPreferencesGet.mockResolvedValue({ value: "snes" });
    mockCoreApiSystems.mockResolvedValue(null);

    const result = await Route.options?.loader?.({} as any);

    expect(result).toEqual({
      systemQuery: "snes",
      systems: null
    });
  });

  it("should preserve exact preference value", async () => {
    const mockSystemsResponse = { systems: [] };

    // Test with a custom system ID
    mockPreferencesGet.mockResolvedValue({ value: "custom-system-123" });
    mockCoreApiSystems.mockResolvedValue(mockSystemsResponse);

    const result = await Route.options?.loader?.({} as any);

    expect(result).toEqual({
      systemQuery: "custom-system-123",
      systems: mockSystemsResponse
    });
  });

  it("should execute both API calls in parallel", async () => {
    const preferencesPromise = new Promise(resolve =>
      setTimeout(() => resolve({ value: "snes" }), 10)
    );
    const systemsPromise = new Promise(resolve =>
      setTimeout(() => resolve({ systems: [] }), 10)
    );

    mockPreferencesGet.mockReturnValue(preferencesPromise);
    mockCoreApiSystems.mockReturnValue(systemsPromise);

    const startTime = Date.now();
    await Route.options?.loader?.({} as any);
    const endTime = Date.now();

    // Should complete in roughly 10ms if parallel, not 20ms if sequential
    expect(endTime - startTime).toBeLessThan(20);
  });

  it("should handle systems response with large data", async () => {
    const largeSystems = Array.from({ length: 100 }, (_, i) => ({
      id: `system-${i}`,
      name: `System ${i}`
    }));
    const mockSystemsResponse = { systems: largeSystems };

    mockPreferencesGet.mockResolvedValue({ value: "system-50" });
    mockCoreApiSystems.mockResolvedValue(mockSystemsResponse);

    const result = await Route.options?.loader?.({} as any);

    expect(result.systems.systems).toHaveLength(100);
    expect(result.systemQuery).toBe("system-50");
  });

  it("should handle CoreAPI timeout", async () => {
    mockPreferencesGet.mockResolvedValue({ value: "snes" });

    // Simulate a timeout
    mockCoreApiSystems.mockImplementation(() =>
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Request timeout")), 100)
      )
    );

    await expect(Route.options?.loader?.({} as any)).rejects.toThrow("Request timeout");
  }, 200);
});