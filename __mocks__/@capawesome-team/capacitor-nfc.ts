import { vi } from "vitest";

// Store event listeners for simulating NFC events in tests
type NfcEventCallback = (event: any) => void;
const listeners: Map<string, NfcEventCallback[]> = new Map();

export const Nfc = {
  isSupported: vi.fn().mockResolvedValue({ nfc: true }),
  isEnabled: vi.fn().mockResolvedValue({ isEnabled: true }),
  openSettings: vi.fn().mockResolvedValue(undefined),
  checkPermissions: vi.fn().mockResolvedValue({ nfc: "granted" }),
  requestPermissions: vi.fn().mockResolvedValue({ nfc: "granted" }),
  addListener: vi
    .fn()
    .mockImplementation(
      async (eventName: string, callback: NfcEventCallback) => {
        const eventListeners = listeners.get(eventName) || [];
        eventListeners.push(callback);
        listeners.set(eventName, eventListeners);

        return {
          remove: vi.fn().mockImplementation(async () => {
            const current = listeners.get(eventName) || [];
            const index = current.indexOf(callback);
            if (index > -1) {
              current.splice(index, 1);
            }
          }),
        };
      },
    ),
  removeAllListeners: vi.fn().mockImplementation(async () => {
    listeners.clear();
  }),
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

/**
 * Simulate an NFC tag being scanned.
 * Call this after startScanSession is called to simulate a tag read.
 */
export function __simulateTagScanned(tag: NfcTag): void {
  const callbacks = listeners.get("nfcTagScanned") || [];
  const event: NfcTagScannedEvent = { nfcTag: tag };
  callbacks.forEach((cb) => cb(event));
}

/**
 * Simulate the NFC scan session being canceled.
 */
export function __simulateScanCanceled(): void {
  const callbacks = listeners.get("scanSessionCanceled") || [];
  callbacks.forEach((cb) => cb());
}

/**
 * Simulate an NFC scan session error.
 */
export function __simulateScanError(error: { message: string }): void {
  const callbacks = listeners.get("scanSessionError") || [];
  callbacks.forEach((cb) => cb(error));
}

/**
 * Create a mock NFC tag for testing.
 */
export function __createMockNfcTag(uid: string, text: string): NfcTag {
  // Convert hex UID to number array
  const uidBytes: number[] = [];
  for (let i = 0; i < uid.length; i += 2) {
    uidBytes.push(parseInt(uid.substring(i, i + 2), 16));
  }

  // Convert text to payload with NDEF text record format
  const textBytes = [2, ...Array.from("en").map((c) => c.charCodeAt(0))];
  for (let i = 0; i < text.length; i++) {
    textBytes.push(text.charCodeAt(i));
  }

  return {
    id: uidBytes,
    techTypes: ["NDEF"],
    message: {
      records: [
        {
          id: [],
          payload: textBytes,
          tnf: 1,
          type: [84], // 'T' for text
        },
      ],
    },
  };
}

/**
 * Reset the mock state between tests.
 */
export function __resetNfcMock(): void {
  listeners.clear();
  vi.mocked(Nfc.addListener).mockClear();
  vi.mocked(Nfc.startScanSession).mockClear();
  vi.mocked(Nfc.stopScanSession).mockClear();
  vi.mocked(Nfc.write).mockClear();
  vi.mocked(Nfc.format).mockClear();
  vi.mocked(Nfc.erase).mockClear();
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
