import { vi } from "vitest";

// Registered plugin listeners, so tests can emit scanner events.
type BarcodeEventCallback = (event: unknown) => void;
const listeners: Map<string, BarcodeEventCallback[]> = new Map();

export const BarcodeScanner = {
  isSupported: vi.fn().mockResolvedValue({ supported: false }),
  isGoogleBarcodeScannerModuleAvailable: vi
    .fn()
    .mockResolvedValue({ available: false }),
  installGoogleBarcodeScannerModule: vi.fn().mockResolvedValue(undefined),
  checkPermissions: vi.fn().mockResolvedValue({ camera: "granted" }),
  requestPermissions: vi.fn().mockResolvedValue({ camera: "granted" }),
  addListener: vi
    .fn()
    .mockImplementation(
      async (eventName: string, callback: BarcodeEventCallback) => {
        listeners.set(eventName, [
          ...(listeners.get(eventName) ?? []),
          callback,
        ]);
        return {
          remove: vi.fn().mockImplementation(async () => {
            listeners.set(
              eventName,
              (listeners.get(eventName) ?? []).filter((cb) => cb !== callback),
            );
          }),
        };
      },
    ),
  removeAllListeners: vi.fn().mockImplementation(async () => {
    listeners.clear();
  }),
  scan: vi.fn().mockResolvedValue({ barcodes: [] }),
  startScan: vi.fn().mockResolvedValue(undefined),
  stopScan: vi.fn().mockResolvedValue(undefined),
  toggleTorch: vi.fn().mockResolvedValue(undefined),
  isTorchEnabled: vi.fn().mockResolvedValue({ enabled: false }),
  isTorchAvailable: vi.fn().mockResolvedValue({ available: false }),
  readBarcodesFromImage: vi.fn().mockResolvedValue({ barcodes: [] }),
  openSettings: vi.fn().mockResolvedValue(undefined),
};

/** Emit a `barcodesScanned` event to the registered listeners. */
export function __emitBarcodesScanned(barcodes: unknown[]): void {
  for (const callback of listeners.get("barcodesScanned") ?? []) {
    callback({ barcodes });
  }
}

/** Number of listeners currently registered for an event. */
export function __barcodeListenerCount(eventName: string): number {
  return listeners.get(eventName)?.length ?? 0;
}

/** Drop registered listeners between tests. */
export function __resetBarcodeScannerMock(): void {
  listeners.clear();
}

export const BarcodeFormat = {
  QrCode: "QR_CODE",
  Aztec: "AZTEC",
  Codabar: "CODABAR",
  Code39: "CODE_39",
  Code93: "CODE_93",
  Code128: "CODE_128",
  DataMatrix: "DATA_MATRIX",
  Ean8: "EAN_8",
  Ean13: "EAN_13",
  Itf: "ITF",
  Pdf417: "PDF_417",
  UpcA: "UPC_A",
  UpcE: "UPC_E",
};

export const BarcodeValueType = {
  CalendarEvent: "CALENDAR_EVENT",
  ContactInfo: "CONTACT_INFO",
  DriversLicense: "DRIVERS_LICENSE",
  Email: "EMAIL",
  Geo: "GEO",
  Isbn: "ISBN",
  Phone: "PHONE",
  Product: "PRODUCT",
  Sms: "SMS",
  Text: "TEXT",
  Unknown: "UNKNOWN",
  Url: "URL",
  Wifi: "WIFI",
};

export const LensFacing = {
  Front: "FRONT",
  Back: "BACK",
};
