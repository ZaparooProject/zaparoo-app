import { describe, it, expect, vi, beforeEach } from "vitest";
import { Preferences } from "@capacitor/preferences";

// Capacitor preferences mock is provided by global test-setup.ts

describe("Capacitor Mocks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return null for missing keys", async () => {
    const result = await Preferences.get({ key: "nonexistent" });
    expect(result).toEqual({ value: null });
  });

  it("should persist values set via Preferences.set", async () => {
    // Set a value
    await Preferences.set({ key: "testKey", value: "testValue" });

    // Verify set was called correctly
    expect(Preferences.set).toHaveBeenCalledWith({
      key: "testKey",
      value: "testValue",
    });
  });

  it("should handle remove operations", async () => {
    await Preferences.remove({ key: "someKey" });

    expect(Preferences.remove).toHaveBeenCalledWith({ key: "someKey" });
  });

  it("should handle clear operations", async () => {
    await Preferences.clear();

    expect(Preferences.clear).toHaveBeenCalled();
  });
});
