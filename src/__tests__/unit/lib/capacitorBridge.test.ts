import { beforeEach, describe, expect, it, vi } from "vitest";
import { Capacitor } from "@capacitor/core";
import {
  isCapacitorPluginUnavailableError,
  isNativePluginAvailable,
  isPluginAvailable,
} from "@/lib/capacitorBridge";

describe("capacitorBridge", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("should report plugin availability safely", () => {
    vi.spyOn(Capacitor, "isPluginAvailable").mockReturnValue(true);

    expect(isPluginAvailable("Preferences")).toBe(true);

    vi.mocked(Capacitor.isPluginAvailable).mockReturnValue(false);

    expect(isPluginAvailable("Preferences")).toBe(false);
  });

  it("should return false when availability check throws", () => {
    vi.spyOn(Capacitor, "isPluginAvailable").mockImplementation(() => {
      throw new Error("bridge missing");
    });

    expect(isPluginAvailable("Preferences")).toBe(false);
  });

  it("should require native platform for native plugin availability", () => {
    vi.spyOn(Capacitor, "isNativePlatform").mockReturnValue(false);
    vi.spyOn(Capacitor, "isPluginAvailable").mockReturnValue(true);
    vi.clearAllMocks();

    expect(isNativePluginAvailable("StatusBar")).toBe(false);
    expect(Capacitor.isPluginAvailable).not.toHaveBeenCalled();
  });

  it("should detect expected unavailable plugin errors", () => {
    expect(
      isCapacitorPluginUnavailableError(
        new Error('"Purchases" plugin is not implemented on android'),
      ),
    ).toBe(true);
    expect(isCapacitorPluginUnavailableError("plugin missing")).toBe(true);
    expect(isCapacitorPluginUnavailableError(new Error("network failed"))).toBe(
      false,
    );
  });
});
