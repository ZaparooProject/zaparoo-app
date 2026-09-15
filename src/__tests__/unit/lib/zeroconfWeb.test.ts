import { describe, expect, it, vi } from "vitest";

// The web fallback extends the real WebPlugin class.
vi.unmock("@capacitor/core");

describe("capacitor-zeroconf web fallback", () => {
  it("should reject calls without an unhandled rejection when loaded", async () => {
    const onUnhandledRejection = vi.fn();
    process.on("unhandledRejection", onUnhandledRejection);

    try {
      const { ZeroConfWeb } =
        await import("capacitor-zeroconf/dist/esm/web.js");
      await new Promise((resolve) => setImmediate(resolve));

      expect(onUnhandledRejection).not.toHaveBeenCalled();
      await expect(
        new ZeroConfWeb().watch(
          { type: "_zaparoo._tcp.", domain: "local." },
          vi.fn(),
        ),
      ).rejects.toBe("The plugin is not available on this platform");
    } finally {
      process.off("unhandledRejection", onUnhandledRejection);
    }
  });
});
