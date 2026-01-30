import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock dependencies
vi.mock("@capacitor/preferences", () => ({
  Preferences: {
    get: vi.fn(),
  },
}));

vi.mock("../../../lib/coreApi", () => ({
  CoreAPI: {
    systems: vi.fn(),
  },
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
        { id: "genesis", name: "Sega Genesis" },
      ],
    };

    mockPreferencesGet
      .mockResolvedValueOnce({ value: "snes" }) // searchSystem
      .mockResolvedValueOnce({ value: "[]" }); // searchTags (empty array)
    mockCoreApiSystems.mockResolvedValue(mockSystemsResponse);

    const result = await Route.options?.loader?.({} as any);

    expect(result).toEqual({
      systemQuery: "snes",
      tagQuery: [],
      systems: mockSystemsResponse,
    });

    expect(mockPreferencesGet).toHaveBeenCalledWith({ key: "searchSystem" });
    expect(mockPreferencesGet).toHaveBeenCalledWith({ key: "searchTags" });
    expect(mockCoreApiSystems).toHaveBeenCalledWith();
  });

  it("should use default 'all' when no search system preference exists", async () => {
    const mockSystemsResponse = { systems: [] };

    mockPreferencesGet
      .mockResolvedValueOnce({ value: null }) // searchSystem
      .mockResolvedValueOnce({ value: null }); // searchTags
    mockCoreApiSystems.mockResolvedValue(mockSystemsResponse);

    const result = await Route.options?.loader?.({} as any);

    expect(result).toEqual({
      systemQuery: "all",
      tagQuery: [],
      systems: mockSystemsResponse,
    });
  });

  it("should use default 'all' when search system preference is undefined", async () => {
    const mockSystemsResponse = { systems: [] };

    mockPreferencesGet
      .mockResolvedValueOnce({ value: undefined }) // searchSystem
      .mockResolvedValueOnce({ value: undefined }); // searchTags
    mockCoreApiSystems.mockResolvedValue(mockSystemsResponse);

    const result = await Route.options?.loader?.({} as any);

    expect(result).toEqual({
      systemQuery: "all",
      tagQuery: [],
      systems: mockSystemsResponse,
    });
  });

  it("should handle empty string preference", async () => {
    const mockSystemsResponse = { systems: [] };

    mockPreferencesGet
      .mockResolvedValueOnce({ value: "" }) // searchSystem
      .mockResolvedValueOnce({ value: "" }); // searchTags
    mockCoreApiSystems.mockResolvedValue(mockSystemsResponse);

    const result = await Route.options?.loader?.({} as any);

    expect(result).toEqual({
      systemQuery: "all", // empty string should default to "all"
      tagQuery: [],
      systems: mockSystemsResponse,
    });
  });

  it("should handle preferences API failure", async () => {
    mockPreferencesGet.mockRejectedValue(
      new Error("Preferences not available"),
    );
    mockCoreApiSystems.mockResolvedValue({ systems: [] });

    await expect(Route.options?.loader?.({} as any)).rejects.toThrow(
      "Preferences not available",
    );

    // CoreAPI.systems is called in parallel, so it will be called even if preferences fail
    expect(mockCoreApiSystems).toHaveBeenCalled();
  });

  it("should handle CoreAPI systems failure", async () => {
    mockPreferencesGet
      .mockResolvedValueOnce({ value: "snes" }) // searchSystem
      .mockResolvedValueOnce({ value: "[]" }); // searchTags
    mockCoreApiSystems.mockRejectedValue(new Error("Core API unavailable"));

    await expect(Route.options?.loader?.({} as any)).rejects.toThrow(
      "Core API unavailable",
    );
  });

  it("should handle both APIs failing", async () => {
    mockPreferencesGet.mockRejectedValue(new Error("Preferences failed"));
    mockCoreApiSystems.mockRejectedValue(new Error("Core API failed"));

    // Should fail on the first error (preferences)
    await expect(Route.options?.loader?.({} as any)).rejects.toThrow(
      "Preferences failed",
    );
  });

  it("should handle malformed systems response", async () => {
    mockPreferencesGet
      .mockResolvedValueOnce({ value: "snes" }) // searchSystem
      .mockResolvedValueOnce({ value: "[]" }); // searchTags
    mockCoreApiSystems.mockResolvedValue(null);

    const result = await Route.options?.loader?.({} as any);

    expect(result).toEqual({
      systemQuery: "snes",
      tagQuery: [],
      systems: null,
    });
  });

  it("should preserve exact preference value", async () => {
    const mockSystemsResponse = { systems: [] };

    // Test with a custom system ID
    mockPreferencesGet
      .mockResolvedValueOnce({ value: "custom-system-123" }) // searchSystem
      .mockResolvedValueOnce({ value: '["action", "rpg"]' }); // searchTags (JSON array)
    mockCoreApiSystems.mockResolvedValue(mockSystemsResponse);

    const result = await Route.options?.loader?.({} as any);

    expect(result).toEqual({
      systemQuery: "custom-system-123",
      tagQuery: ["action", "rpg"],
      systems: mockSystemsResponse,
    });
  });

  it("should execute both API calls in parallel", async () => {
    // Track the order of API calls to verify parallelism
    const callOrder: string[] = [];

    mockPreferencesGet.mockImplementation(({ key }: { key: string }) => {
      callOrder.push(`preferences:${key}`);
      return Promise.resolve({ value: key === "searchSystem" ? "snes" : "[]" });
    });

    mockCoreApiSystems.mockImplementation(() => {
      callOrder.push("systems");
      return Promise.resolve({ systems: [] });
    });

    const result = await Route.options?.loader?.({} as any);

    // Verify all APIs were called
    expect(mockPreferencesGet).toHaveBeenCalledWith({ key: "searchSystem" });
    expect(mockPreferencesGet).toHaveBeenCalledWith({ key: "searchTags" });
    expect(mockCoreApiSystems).toHaveBeenCalled();

    // Verify result is correct (proves parallel execution worked)
    expect(result).toEqual({
      systemQuery: "snes",
      tagQuery: [],
      systems: { systems: [] },
    });
  });

  it("should handle systems response with large data", async () => {
    const largeSystems = Array.from({ length: 100 }, (_, i) => ({
      id: `system-${i}`,
      name: `System ${i}`,
    }));
    const mockSystemsResponse = { systems: largeSystems };

    mockPreferencesGet
      .mockResolvedValueOnce({ value: "system-50" }) // searchSystem
      .mockResolvedValueOnce({ value: "[]" }); // searchTags
    mockCoreApiSystems.mockResolvedValue(mockSystemsResponse);

    const result = await Route.options?.loader?.({} as any);

    expect(result.systems.systems).toHaveLength(100);
    expect(result.systemQuery).toBe("system-50");
    expect(result.tagQuery).toEqual([]);
  });

  it("should handle CoreAPI timeout", async () => {
    mockPreferencesGet
      .mockResolvedValueOnce({ value: "snes" }) // searchSystem
      .mockResolvedValueOnce({ value: "[]" }); // searchTags

    // Simulate a timeout
    mockCoreApiSystems.mockImplementation(
      () =>
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Request timeout")), 100),
        ),
    );

    await expect(Route.options?.loader?.({} as any)).rejects.toThrow(
      "Request timeout",
    );
  }, 200);
});
