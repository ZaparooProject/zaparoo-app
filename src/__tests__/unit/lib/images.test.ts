import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@/test-utils";

describe("Zap logo preload", () => {
  afterEach(() => {
    vi.restoreAllMocks();
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

  it("should synchronously paint the decoded logo into a canvas", async () => {
    const imageInstances: MockImage[] = [];

    class MockImage {
      complete = true;
      decoding = "auto";
      fetchPriority = "auto";
      naturalWidth = 1200;
      src = "";
      decode = vi.fn().mockResolvedValue(undefined);

      constructor(
        public width: number,
        public height: number,
      ) {
        imageInstances.push(this);
      }
    }

    const context = {
      clearRect: vi.fn(),
      drawImage: vi.fn(),
      imageSmoothingEnabled: false,
      imageSmoothingQuality: "low",
      setTransform: vi.fn(),
    };
    vi.stubGlobal("Image", MockImage);
    vi.stubGlobal("CanvasRenderingContext2D", class {});
    vi.stubGlobal("devicePixelRatio", 2);
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
      context as unknown as CanvasRenderingContext2D,
    );
    const { preloadZapLogo, ZapLogo } = await import("@/lib/images");
    await preloadZapLogo();

    render(createElement(ZapLogo));

    const canvas = screen.getByRole("img", { name: "accessibility.logo" });
    expect(canvas).toHaveAttribute("width", "320");
    expect(canvas).toHaveAttribute("height", "72");
    expect(context.setTransform).toHaveBeenCalledWith(2, 0, 0, 2, 0, 0);
    expect(context.drawImage).toHaveBeenCalledWith(
      imageInstances[0],
      0,
      0,
      160,
      36,
    );
  });

  it("should start logo preload without blocking root navigation", async () => {
    const decode = vi.fn(() => new Promise<void>(() => undefined));

    class MockImage {
      decoding = "auto";
      fetchPriority = "auto";
      src = "";
      decode = decode;

      constructor(
        public width: number,
        public height: number,
      ) {}
    }

    vi.stubGlobal("Image", MockImage);
    vi.doMock("@/routes/-pages/Index", () => ({ Index: () => null }));
    const { Route } = await import("@/routes/index");
    const beforeLoad = Route.options.beforeLoad as () => unknown;

    expect(beforeLoad()).toBeUndefined();
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
