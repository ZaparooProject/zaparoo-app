import {
  NdefRecord,
  NfcUtils,
  RecordTypeDefinition,
  TypeNameFormat,
} from "@capawesome-team/capacitor-nfc";

/**
 * Minimal shape of an NDEF record as delivered by the plugin's scan events or
 * parsed from raw Type 2 tag memory.
 */
export interface NdefRecordLike {
  tnf?: number;
  type?: number[];
  payload?: number[];
}

export function int2hex(v: number[]): string {
  let hexId = "";
  for (let i = 0; i < v.length; i++) {
    hexId += (v[i] ?? 0).toString(16).padStart(2, "0");
  }
  hexId = hexId.replace(/-/g, "");
  return hexId;
}

export function int2char(v: number[]): string {
  let charId = "";
  for (let i = 0; i < v.length; i++) {
    charId += String.fromCharCode(v[i] ?? 0);
  }
  return charId;
}

/**
 * Decode the human-readable text of an NDEF record: well-known Text records
 * yield their text, well-known URI records yield the full URI, anything else
 * falls back to a raw byte-to-char conversion of the payload.
 */
export function decodeNdefRecordText(record: NdefRecordLike): string {
  if (!record.payload) {
    return "";
  }

  const utils = new NfcUtils();

  if (record.tnf === TypeNameFormat.WellKnown) {
    const wellKnownRecord: NdefRecord = {
      ...record,
      tnf: TypeNameFormat.WellKnown,
    };
    const { type: recordType } = utils.mapBytesToRecordTypeDefinition({
      bytes: record.type ?? [],
    });

    if (recordType === RecordTypeDefinition.Text) {
      return (
        utils.getTextFromNdefTextRecord({ record: wellKnownRecord }).text ?? ""
      );
    } else if (recordType === RecordTypeDefinition.Uri) {
      const { identifierCode } = utils.getIdentifierCodeFromNdefUriRecord({
        record: wellKnownRecord,
      });
      const prefix =
        identifierCode === undefined
          ? ""
          : (utils.mapUriIdentifierCodeToString({ identifierCode })?.prefix ??
            "");
      const { uri } = utils.getUriFromNdefUriRecord({
        record: wellKnownRecord,
      });
      return prefix + (uri ?? "");
    }
    return int2char(record.payload);
  }
  return int2char(record.payload);
}

export type TlvExtractResult =
  | { kind: "found"; ndef: number[] }
  | { kind: "need-more"; minTotalBytes: number }
  | { kind: "no-ndef" }
  | { kind: "empty" };

const TLV_NULL = 0x00;
const TLV_LOCK_CONTROL = 0x01;
const TLV_MEMORY_CONTROL = 0x02;
const TLV_NDEF_MESSAGE = 0x03;
const TLV_TERMINATOR = 0xfe;

/**
 * Walk the TLV area of a Type 2 tag's user memory (starting at page 4, byte 0)
 * looking for the NDEF message TLV.
 *
 * Returns `need-more` with the minimum total byte count required when the
 * buffer ends before the current TLV completes, `no-ndef` when the terminator
 * TLV appears before any NDEF TLV, and `empty` for a zero-length NDEF TLV.
 */
export function extractNdefFromType2Tlv(bytes: number[]): TlvExtractResult {
  let offset = 0;

  while (offset < bytes.length) {
    const tag = bytes[offset] ?? 0;

    if (tag === TLV_NULL) {
      offset += 1;
      continue;
    }

    if (tag === TLV_TERMINATOR) {
      return { kind: "no-ndef" };
    }

    // All remaining TLV types carry a length field.
    if (offset + 1 >= bytes.length) {
      return { kind: "need-more", minTotalBytes: offset + 2 };
    }

    let length = bytes[offset + 1] ?? 0;
    let dataStart = offset + 2;
    if (length === 0xff) {
      // Three-byte length form: 0xFF followed by 16-bit big-endian length.
      if (offset + 3 >= bytes.length) {
        return { kind: "need-more", minTotalBytes: offset + 4 };
      }
      length = ((bytes[offset + 2] ?? 0) << 8) | (bytes[offset + 3] ?? 0);
      dataStart = offset + 4;
    }

    if (tag === TLV_NDEF_MESSAGE) {
      if (length === 0) {
        return { kind: "empty" };
      }
      if (dataStart + length > bytes.length) {
        return { kind: "need-more", minTotalBytes: dataStart + length };
      }
      return {
        kind: "found",
        ndef: bytes.slice(dataStart, dataStart + length),
      };
    }

    if (tag === TLV_LOCK_CONTROL || tag === TLV_MEMORY_CONTROL) {
      offset = dataStart + length;
      continue;
    }

    // Unknown proprietary TLV: skip it by its declared length.
    offset = dataStart + length;
  }

  return { kind: "need-more", minTotalBytes: bytes.length + 1 };
}

const NDEF_FLAG_SHORT_RECORD = 0x10;
const NDEF_FLAG_ID_LENGTH = 0x08;
const NDEF_TNF_MASK = 0x07;

/**
 * Parse the first record out of a raw NDEF message. Returns null when the
 * message is truncated or empty.
 */
export function parseFirstNdefRecord(ndef: number[]): NdefRecordLike | null {
  if (ndef.length < 3) {
    return null;
  }

  const flags = ndef[0] ?? 0;
  const tnf = flags & NDEF_TNF_MASK;
  const shortRecord = (flags & NDEF_FLAG_SHORT_RECORD) !== 0;
  const hasIdLength = (flags & NDEF_FLAG_ID_LENGTH) !== 0;

  let offset = 1;
  const typeLength = ndef[offset] ?? 0;
  offset += 1;

  let payloadLength: number;
  if (shortRecord) {
    payloadLength = ndef[offset] ?? 0;
    offset += 1;
  } else {
    if (offset + 4 > ndef.length) {
      return null;
    }
    payloadLength =
      ((ndef[offset] ?? 0) << 24) |
      ((ndef[offset + 1] ?? 0) << 16) |
      ((ndef[offset + 2] ?? 0) << 8) |
      (ndef[offset + 3] ?? 0);
    offset += 4;
  }

  let idLength = 0;
  if (hasIdLength) {
    idLength = ndef[offset] ?? 0;
    offset += 1;
  }

  if (offset + typeLength + idLength + payloadLength > ndef.length) {
    return null;
  }

  const type = ndef.slice(offset, offset + typeLength);
  offset += typeLength + idLength;
  const payload = ndef.slice(offset, offset + payloadLength);

  return { tnf, type, payload };
}

const NDEF_TYPE_TEXT = 0x54;

/**
 * Check that a raw NDEF message's first record is a well-known Text record
 * whose decoded text exactly matches the expected string.
 */
export function verifyNdefTextMatches(
  ndef: number[],
  expected: string,
): boolean {
  const record = parseFirstNdefRecord(ndef);
  if (!record) {
    return false;
  }
  if (
    record.tnf !== TypeNameFormat.WellKnown ||
    record.type?.length !== 1 ||
    record.type[0] !== NDEF_TYPE_TEXT
  ) {
    return false;
  }
  return decodeNdefRecordText(record) === expected;
}
