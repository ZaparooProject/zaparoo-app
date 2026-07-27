import { vi } from "vitest";

// Store event listeners for simulating NFC events in tests
type NfcEventCallback = (event?: unknown) => void;
const listeners: Map<string, NfcEventCallback[]> = new Map();

export const Nfc = {
  isSupported: vi.fn().mockResolvedValue({ nfc: true }),
  isAvailable: vi.fn().mockResolvedValue({ nfc: true }),
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

export enum TypeNameFormat {
  Empty = 0,
  WellKnown = 1,
  MimeMedia = 2,
  AbsoluteUri = 3,
  External = 4,
  Unknown = 5,
  Unchanged = 6,
}

export enum RecordTypeDefinition {
  AndroidApp = "android.com:pkg",
  AlternativeCarrier = "ac",
  HandoverCarrier = "Hc",
  HandoverRequest = "Hr",
  HandoverSelect = "Hs",
  SmartPoster = "Sp",
  Text = "T",
  Uri = "U",
}

const URI_PREFIXES: Record<number, string> = {
  0x00: "",
  0x01: "http://www.",
  0x02: "https://www.",
  0x03: "http://",
  0x04: "https://",
  0x05: "tel:",
  0x06: "mailto:",
  0x07: "ftp://anonymous:anonymous@",
  0x08: "ftp://ftp.",
  0x09: "ftps://",
  0x0a: "sftp://",
  0x0b: "smb://",
  0x0c: "nfs://",
  0x0d: "ftp://",
  0x0e: "dav://",
  0x0f: "news:",
  0x10: "telnet://",
  0x11: "imap:",
  0x12: "rtsp://",
  0x13: "urn:",
  0x14: "pop:",
  0x15: "sip:",
  0x16: "sips:",
  0x17: "tftp:",
  0x18: "btspp://",
  0x19: "btl2cap://",
  0x1a: "btgoep://",
  0x1b: "tcpobex://",
  0x1c: "irdaobex://",
  0x1d: "file://",
  0x1e: "urn:epc:id:",
  0x1f: "urn:epc:tag:",
  0x20: "urn:epc:pat:",
  0x21: "urn:epc:raw:",
  0x22: "urn:epc:",
  0x23: "urn:nfc:",
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

  mapBytesToRecordTypeDefinition({ bytes }: { bytes: number[] }) {
    if (bytes.length === 1) {
      if (bytes[0] === 84) return { type: RecordTypeDefinition.Text };
      if (bytes[0] === 85) return { type: RecordTypeDefinition.Uri };
    }
    return { type: undefined };
  }

  getTextFromNdefTextRecord({ record }: { record: { payload?: number[] } }) {
    const payload = record.payload;
    if (!payload) return { text: undefined };
    const langLen = payload[0] ?? 0;
    const decoder = new TextDecoder();
    const text = decoder.decode(new Uint8Array(payload)).substring(langLen + 1);
    return { text };
  }

  getIdentifierCodeFromNdefUriRecord({
    record,
  }: {
    record: { payload?: number[] };
  }) {
    const payload = record.payload;
    if (!payload || payload.length === 0) return { identifierCode: undefined };
    const code = payload[0] as number;
    return {
      identifierCode: code in URI_PREFIXES ? code : undefined,
    };
  }

  getUriFromNdefUriRecord({ record }: { record: { payload?: number[] } }) {
    const payload = record.payload;
    if (!payload || payload.length === 0) return { uri: undefined };
    const decoder = new TextDecoder();
    const uri = decoder.decode(new Uint8Array(payload.slice(1)));
    return { uri };
  }

  mapUriIdentifierCodeToString({ identifierCode }: { identifierCode: number }) {
    return { prefix: URI_PREFIXES[identifierCode] ?? "" };
  }
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
    techTypes: [NfcTagTechType.Ndef],
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

// Enum exports for tests that import enums
export enum NfcTagTechType {
  NfcA = "NFC_A",
  NfcB = "NFC_B",
  NfcF = "NFC_F",
  NfcV = "NFC_V",
  IsoDep = "ISO_DEP",
  Ndef = "NDEF",
  MifareClassic = "MIFARE_CLASSIC",
  MifareDesfire = "MIFARE_DESFIRE",
  MifarePlus = "MIFARE_PLUS",
  MifareUltralight = "MIFARE_ULTRALIGHT",
  NdefFormatable = "NDEF_FORMATABLE",
}

// Type exports for tests that import types
export type NfcTag = {
  id: number[];
  techTypes?: NfcTagTechType[];
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
