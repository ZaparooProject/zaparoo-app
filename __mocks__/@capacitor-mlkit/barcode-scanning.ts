import { vi } from "vitest";

export const BarcodeScanner = {
  isSupported: vi.fn().mockResolvedValue({ supported: false }),
  isGoogleBarcodeScannerModuleAvailable: vi
    .fn()
    .mockResolvedValue({ available: false }),
  installGoogleBarcodeScannerModule: vi.fn().mockResolvedValue(undefined),
  checkPermissions: vi.fn().mockResolvedValue({ camera: "granted" }),
  requestPermissions: vi.fn().mockResolvedValue({ camera: "granted" }),
  addListener: vi.fn().mockReturnValue({ remove: vi.fn() }),
  removeAllListeners: vi.fn().mockResolvedValue(undefined),
  scan: vi.fn().mockResolvedValue({ barcodes: [] }),
  startScan: vi.fn().mockResolvedValue(undefined),
  stopScan: vi.fn().mockResolvedValue(undefined),
  readBarcodesFromImage: vi.fn().mockResolvedValue({ barcodes: [] }),
  openSettings: vi.fn().mockResolvedValue(undefined),
};

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

export const LensFacing = {
  Front: "FRONT",
  Back: "BACK",
};
