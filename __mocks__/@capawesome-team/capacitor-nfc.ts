import { vi } from "vitest";

export const Nfc = {
  isSupported: vi.fn().mockResolvedValue({ nfc: true }),
  isEnabled: vi.fn().mockResolvedValue({ isEnabled: true }),
  openSettings: vi.fn().mockResolvedValue(undefined),
  checkPermissions: vi.fn().mockResolvedValue({ nfc: "granted" }),
  requestPermissions: vi.fn().mockResolvedValue({ nfc: "granted" }),
  addListener: vi.fn().mockResolvedValue({ remove: vi.fn() }),
  removeAllListeners: vi.fn().mockResolvedValue(undefined),
  startScanSession: vi.fn().mockResolvedValue(undefined),
  stopScanSession: vi.fn().mockResolvedValue(undefined),
  write: vi.fn().mockResolvedValue(undefined),
  format: vi.fn().mockResolvedValue(undefined),
  erase: vi.fn().mockResolvedValue(undefined),
  close: vi.fn().mockResolvedValue(undefined),
  makeReadOnly: vi.fn().mockResolvedValue(undefined),
};

export class NfcUtils {
  createNdefTextRecord = vi.fn().mockReturnValue({
    record: {
      id: [],
      payload: [],
      tnf: 1,
      type: [84], // 'T' for text
    },
  });
}

// Type exports for tests that import types
export type NfcTag = {
  id: number[];
  techTypes?: string[];
  message?: {
    records: Array<{
      id?: number[];
      payload?: number[];
      tnf?: number;
      type?: number[];
    }>;
  };
};

export type NfcTagScannedEvent = {
  nfcTag: NfcTag;
};
