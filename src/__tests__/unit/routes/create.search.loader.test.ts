import { describe, it, expect, vi, beforeEach } from "vitest";
import { Preferences } from "@capacitor/preferences";
import { CoreAPI } from "@/lib/coreApi";
import { Route } from "@/routes/create.search";

vi.mock("@capacitor/preferences", () => ({
  Preferences: {
    get: vi.fn().mockResolvedValue({ value: null }),
    set: vi.fn().mockResolvedValue(undefined),
  },
}));

const runLoader = () =>
  (Route.options.loader as (context: unknown) => Promise<unknown>)({});

describe("Create Search Route Loader", () => {
  const mockPreferencesGet = vi.mocked(Preferences.get);

  beforeEach(() => {
    vi.clearAllMocks();
    mockPreferencesGet.mockResolvedValue({ value: null });
  });

  it("should load the saved system and tag filters", async () => {
    mockPreferencesGet
      .mockResolvedValueOnce({ value: "snes" }) // searchSystem
      .mockResolvedValueOnce({ value: '["genre:rpg"]' }); // searchTags

    await expect(runLoader()).resolves.toEqual({
      systemQuery: "snes",
      tagQuery: ["genre:rpg"],
    });
    expect(mockPreferencesGet).toHaveBeenCalledWith({ key: "searchSystem" });
    expect(mockPreferencesGet).toHaveBeenCalledWith({ key: "searchTags" });
  });

  it("should default to all systems and no tags when nothing is saved", async () => {
    await expect(runLoader()).resolves.toEqual({
      systemQuery: "all",
      tagQuery: [],
    });
  });

  it("should treat an empty saved system as all systems", async () => {
    mockPreferencesGet
      .mockResolvedValueOnce({ value: "" })
      .mockResolvedValueOnce({ value: null });

    await expect(runLoader()).resolves.toMatchObject({ systemQuery: "all" });
  });

  it("should ignore unparseable saved tags", async () => {
    mockPreferencesGet
      .mockResolvedValueOnce({ value: "snes" })
      .mockResolvedValueOnce({ value: "{not json" });

    await expect(runLoader()).resolves.toEqual({
      systemQuery: "snes",
      tagQuery: [],
    });
  });

  it("should reject when preferences cannot be read", async () => {
    mockPreferencesGet.mockRejectedValue(new Error("Preferences failed"));

    await expect(runLoader()).rejects.toThrow("Preferences failed");
  });

  it("should not wait on Core, so navigation is not blocked while disconnected", async () => {
    // A request made while disconnected is queued and may not settle for 30s.
    const systems = vi
      .spyOn(CoreAPI, "systems")
      .mockReturnValue(new Promise(() => {}));

    await expect(runLoader()).resolves.toEqual({
      systemQuery: "all",
      tagQuery: [],
    });
    expect(systems).not.toHaveBeenCalled();
  });
});
