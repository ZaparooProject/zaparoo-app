/**
 * Unit tests for pure NDEF/TLV parsing used by NFC write verification.
 */

import { describe, it, expect } from "vitest";
import {
  decodeNdefRecordText,
  extractNdefFromType2Tlv,
  parseFirstNdefRecord,
  verifyNdefTextMatches,
} from "@/lib/ndef";

/**
 * Build a raw short-record NDEF message containing a single well-known Text
 * record with an "en" language code.
 */
function ndefTextMessage(text: string): number[] {
  const payload = [2, ...Array.from("en" + text).map((c) => c.charCodeAt(0))];
  return [0xd1, 0x01, payload.length, 0x54, ...payload];
}

describe("ndef", () => {
  describe("extractNdefFromType2Tlv", () => {
    it("should find an NDEF message TLV", () => {
      const ndef = ndefTextMessage("hi");

      const result = extractNdefFromType2Tlv([
        0x03,
        ndef.length,
        ...ndef,
        0xfe,
      ]);

      expect(result).toEqual({ kind: "found", ndef });
    });

    it("should skip leading NULL TLVs", () => {
      const ndef = ndefTextMessage("hi");

      const result = extractNdefFromType2Tlv([
        0x00,
        0x00,
        0x03,
        ndef.length,
        ...ndef,
        0xfe,
      ]);

      expect(result).toEqual({ kind: "found", ndef });
    });

    it("should skip a lock control TLV honoring its length", () => {
      const ndef = ndefTextMessage("hi");

      const result = extractNdefFromType2Tlv([
        0x01,
        0x03,
        0xaa,
        0xbb,
        0xcc,
        0x03,
        ndef.length,
        ...ndef,
        0xfe,
      ]);

      expect(result).toEqual({ kind: "found", ndef });
    });

    it("should parse the three-byte length form", () => {
      const ndef = ndefTextMessage("hi");

      const result = extractNdefFromType2Tlv([
        0x03,
        0xff,
        ndef.length >> 8,
        ndef.length & 0xff,
        ...ndef,
        0xfe,
      ]);

      expect(result).toEqual({ kind: "found", ndef });
    });

    it("should report no-ndef when the terminator appears before any NDEF TLV", () => {
      const result = extractNdefFromType2Tlv([0x00, 0xfe, 0x00, 0x00]);

      expect(result).toEqual({ kind: "no-ndef" });
    });

    it("should report empty for a zero-length NDEF TLV", () => {
      const result = extractNdefFromType2Tlv([0x03, 0x00, 0xfe, 0x00]);

      expect(result).toEqual({ kind: "empty" });
    });

    it("should request more data when the NDEF TLV is truncated", () => {
      const ndef = ndefTextMessage("hello world");
      const bytes = [0x03, ndef.length, ...ndef.slice(0, 4)];

      const result = extractNdefFromType2Tlv(bytes);

      expect(result).toEqual({
        kind: "need-more",
        minTotalBytes: 2 + ndef.length,
      });
    });

    it("should request more data when the buffer ends before a length byte", () => {
      const result = extractNdefFromType2Tlv([0x00, 0x03]);

      expect(result).toEqual({ kind: "need-more", minTotalBytes: 3 });
    });

    it("should request more data for an all-null buffer", () => {
      const result = extractNdefFromType2Tlv([0x00, 0x00, 0x00, 0x00]);

      expect(result).toEqual({ kind: "need-more", minTotalBytes: 5 });
    });
  });

  describe("parseFirstNdefRecord", () => {
    it("should parse a short text record", () => {
      const ndef = ndefTextMessage("abc");

      const record = parseFirstNdefRecord(ndef);

      expect(record).toEqual({
        tnf: 1,
        type: [0x54],
        payload: [2, ...Array.from("enabc").map((c) => c.charCodeAt(0))],
      });
    });

    it("should parse a record with an ID field", () => {
      // Flags: MB|ME|SR|IL, TNF=1; typeLen=1, payloadLen=2, idLen=1
      const ndef = [0xd9, 0x01, 0x02, 0x01, 0x54, 0x42, 0xaa, 0xbb];

      const record = parseFirstNdefRecord(ndef);

      expect(record).toEqual({ tnf: 1, type: [0x54], payload: [0xaa, 0xbb] });
    });

    it("should parse a non-short record with a four-byte payload length", () => {
      // Flags: MB|ME, TNF=1 (no SR); typeLen=1, payloadLen=0x00000002
      const ndef = [0xc1, 0x01, 0x00, 0x00, 0x00, 0x02, 0x54, 0xaa, 0xbb];

      const record = parseFirstNdefRecord(ndef);

      expect(record).toEqual({ tnf: 1, type: [0x54], payload: [0xaa, 0xbb] });
    });

    it("should return null for a truncated record", () => {
      const ndef = ndefTextMessage("abc").slice(0, 3);

      expect(parseFirstNdefRecord(ndef)).toBeNull();
    });

    it("should return null for an empty message", () => {
      expect(parseFirstNdefRecord([])).toBeNull();
    });
  });

  describe("verifyNdefTextMatches", () => {
    it("should match when the text record equals the expected text", () => {
      expect(
        verifyNdefTextMatches(ndefTextMessage("**launch:foo"), "**launch:foo"),
      ).toBe(true);
    });

    it("should not match different text", () => {
      expect(verifyNdefTextMatches(ndefTextMessage("other"), "expected")).toBe(
        false,
      );
    });

    it("should not match a URI record", () => {
      const payload = [
        0x04,
        ...Array.from("zaparoo.org").map((c) => c.charCodeAt(0)),
      ];
      const uriNdef = [0xd1, 0x01, payload.length, 0x55, ...payload];

      expect(verifyNdefTextMatches(uriNdef, "https://zaparoo.org")).toBe(false);
    });

    it("should not match an unparseable message", () => {
      expect(verifyNdefTextMatches([0xd1], "anything")).toBe(false);
    });
  });

  describe("decodeNdefRecordText", () => {
    it("should decode a well-known text record", () => {
      const record = parseFirstNdefRecord(ndefTextMessage("hello"));

      expect(record).not.toBeNull();
      expect(decodeNdefRecordText(record!)).toBe("hello");
    });

    it("should return empty string for a record without payload", () => {
      expect(decodeNdefRecordText({ tnf: 1, type: [0x54] })).toBe("");
    });
  });
});
