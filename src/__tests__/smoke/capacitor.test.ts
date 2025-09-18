import { describe, it, expect, vi } from "vitest";
import { Preferences } from "@capacitor/preferences";

// Explicitly mock the Capacitor preferences to test our mock factory
vi.mock("@capacitor/preferences", () => import("../../__mocks__/@capacitor/preferences"));

describe("Capacitor Mocks", () => {
  it("should use our custom Preferences mock", async () => {
    const result = await Preferences.get({ key: "test" });
    expect(result).toEqual({ value: null });
    expect(vi.isMockFunction(Preferences.get)).toBe(true);
  });
});