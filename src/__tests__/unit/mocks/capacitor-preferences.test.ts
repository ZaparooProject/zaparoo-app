import { describe, it, expect, beforeEach } from "vitest";
import { Preferences } from "@capacitor/preferences";
import { __resetPreferencesStorage } from "../../../../__mocks__/@capacitor/preferences";

// Capacitor preferences mock is provided by global test-setup.ts
// These tests verify the mock correctly simulates storage behavior

describe("Capacitor Preferences Mock", () => {
  beforeEach(() => {
    __resetPreferencesStorage();
  });

  it("should return null for missing keys", async () => {
    const result = await Preferences.get({ key: "nonexistent" });
    expect(result).toEqual({ value: null });
  });

  it("should persist and retrieve values", async () => {
    // Set a value
    await Preferences.set({ key: "testKey", value: "testValue" });

    // Verify the value can be retrieved
    const result = await Preferences.get({ key: "testKey" });
    expect(result).toEqual({ value: "testValue" });
  });

  it("should overwrite existing values", async () => {
    await Preferences.set({ key: "testKey", value: "firstValue" });
    await Preferences.set({ key: "testKey", value: "secondValue" });

    const result = await Preferences.get({ key: "testKey" });
    expect(result).toEqual({ value: "secondValue" });
  });

  it("should remove values", async () => {
    await Preferences.set({ key: "testKey", value: "testValue" });
    await Preferences.remove({ key: "testKey" });

    const result = await Preferences.get({ key: "testKey" });
    expect(result).toEqual({ value: null });
  });

  it("should clear all values", async () => {
    await Preferences.set({ key: "key1", value: "value1" });
    await Preferences.set({ key: "key2", value: "value2" });
    await Preferences.clear();

    const result1 = await Preferences.get({ key: "key1" });
    const result2 = await Preferences.get({ key: "key2" });
    expect(result1).toEqual({ value: null });
    expect(result2).toEqual({ value: null });
  });

  it("should list all keys", async () => {
    await Preferences.set({ key: "alpha", value: "1" });
    await Preferences.set({ key: "beta", value: "2" });

    const result = await Preferences.keys();
    expect(result.keys).toContain("alpha");
    expect(result.keys).toContain("beta");
    expect(result.keys).toHaveLength(2);
  });
});
