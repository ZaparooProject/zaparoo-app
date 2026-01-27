import { describe, it, expect, vi } from "vitest";
import { Preferences } from "@capacitor/preferences";

// Capacitor preferences mock is provided by global test-setup.ts

describe("Capacitor Mocks", () => {
  it("should use our custom Preferences mock", async () => {
    const result = await Preferences.get({ key: "test" });
    expect(result).toEqual({ value: null });
    expect(vi.isMockFunction(Preferences.get)).toBe(true);
  });
});
