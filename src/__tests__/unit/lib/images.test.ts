import { afterEach, describe, expect, it, vi } from "vitest";

describe("Zap logo preload", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("should decode and retain one shared logo image", async () => {
    const decode = vi.fn().mockResolvedValue(undefined);
    const instances: Array<{
      decoding: string;
      fetchPriority: string;
      height: number;
      src: string;
      width: number;
    }> = [];

    class MockImage {
      decoding = "auto";
      fetchPriority = "auto";
      src = "";
      decode = decode;

      constructor(
        public width: number,
        public height: number,
      ) {
        instances.push(this);
      }
    }

    vi.stubGlobal("Image", MockImage);
    const { preloadZapLogo, ZAP_LOGO_URL } = await import("@/lib/images");

    const first = preloadZapLogo();
    const second = preloadZapLogo();
    await first;

    expect(first).toBe(second);
    expect(instances).toHaveLength(1);
    expect(instances[0]).toMatchObject({
      decoding: "sync",
      fetchPriority: "high",
      height: 36,
      src: ZAP_LOGO_URL,
      width: 160,
    });
    expect(decode).toHaveBeenCalledOnce();
  });

  it("should not block navigation when decoding fails", async () => {
    class MockImage {
      decoding = "auto";
      fetchPriority = "auto";
      src = "";
      decode = vi.fn().mockRejectedValue(new Error("decode failed"));

      constructor(
        public width: number,
        public height: number,
      ) {}
    }

    vi.stubGlobal("Image", MockImage);
    const { preloadZapLogo } = await import("@/lib/images");

    await expect(preloadZapLogo()).resolves.toBeUndefined();
  });
});
