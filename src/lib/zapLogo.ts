export const ZAP_LOGO_URL = `${__APP_BASE_PATH__}lockup.webp`;
export const ZAP_LOGO_WIDTH = 160;
export const ZAP_LOGO_HEIGHT = 36;

let zapLogoImage: HTMLImageElement | null = null;
let zapLogoReady: Promise<void> | null = null;

export function preloadZapLogo(): Promise<void> {
  if (typeof Image === "undefined") return Promise.resolve();

  if (!zapLogoReady) {
    zapLogoImage = new Image(ZAP_LOGO_WIDTH, ZAP_LOGO_HEIGHT);
    zapLogoImage.decoding = "sync";
    zapLogoImage.fetchPriority = "high";
    zapLogoImage.src = ZAP_LOGO_URL;
    zapLogoReady =
      typeof zapLogoImage.decode === "function"
        ? zapLogoImage.decode().catch(() => undefined)
        : Promise.resolve();
  }

  return zapLogoReady;
}

export function drawPreloadedZapLogo(
  canvas: HTMLCanvasElement,
  pixelRatio = window.devicePixelRatio || 1,
): boolean {
  if (!zapLogoImage?.complete || zapLogoImage.naturalWidth === 0) return false;

  const context = canvas.getContext("2d");
  if (!context) return false;

  const scale = Math.max(1, pixelRatio);
  canvas.width = Math.round(ZAP_LOGO_WIDTH * scale);
  canvas.height = Math.round(ZAP_LOGO_HEIGHT * scale);
  context.setTransform(scale, 0, 0, scale, 0, 0);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.clearRect(0, 0, ZAP_LOGO_WIDTH, ZAP_LOGO_HEIGHT);
  context.drawImage(zapLogoImage, 0, 0, ZAP_LOGO_WIDTH, ZAP_LOGO_HEIGHT);
  return true;
}
