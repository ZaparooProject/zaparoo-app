/**
 * Unit Tests: NFC Pure Functions
 *
 * Tests for pure utility functions in the NFC module.
 * These functions don't require mocking NFC hardware.
 */

import { describe, it, expect } from "vitest";
import {
  int2hex,
  int2char,
  readNfcEvent,
  isFormatRelatedError,
} from "@/lib/nfc";
import { NfcTagScannedEvent } from "@capawesome-team/capacitor-nfc";

describe("NFC Pure Functions", () => {
  describe("int2hex", () => {
    it("should convert empty array to empty string", () => {
      expect(int2hex([])).toBe("");
    });

    it("should convert single byte to two-char hex", () => {
      expect(int2hex([0])).toBe("00");
      expect(int2hex([255])).toBe("ff");
      expect(int2hex([16])).toBe("10");
    });

    it("should convert multiple bytes to hex string", () => {
      expect(int2hex([1, 2, 3])).toBe("010203");
      expect(int2hex([171, 205, 239])).toBe("abcdef");
    });

    it("should pad single-digit hex values with leading zero", () => {
      expect(int2hex([1, 10, 15])).toBe("010a0f");
    });

    it("should handle typical NFC UID bytes", () => {
      // 7-byte UID example
      expect(int2hex([4, 123, 45, 67, 89, 171, 128])).toBe("047b2d4359ab80");
    });

    it("should handle undefined values in array as 0", () => {
      const arr = [1, undefined, 3] as number[];
      expect(int2hex(arr)).toBe("010003");
    });
  });

  describe("int2char", () => {
    it("should convert empty array to empty string", () => {
      expect(int2char([])).toBe("");
    });

    it("should convert ASCII codes to characters", () => {
      expect(int2char([65])).toBe("A");
      expect(int2char([97])).toBe("a");
      expect(int2char([48])).toBe("0");
    });

    it("should convert multiple bytes to string", () => {
      expect(int2char([72, 101, 108, 108, 111])).toBe("Hello");
    });

    it("should handle null character", () => {
      expect(int2char([0])).toBe("\0");
    });

    it("should handle special characters", () => {
      expect(int2char([33, 64, 35])).toBe("!@#");
    });

    it("should handle undefined values in array as null character", () => {
      const arr = [65, undefined, 66] as number[];
      expect(int2char(arr)).toBe("A\0B");
    });
  });

  describe("readNfcEvent", () => {
    it("should return null for event with no nfcTag", () => {
      const event = {} as NfcTagScannedEvent;
      expect(readNfcEvent(event)).toBeNull();
    });

    it("should return null for event with no id", () => {
      const event = {
        nfcTag: {},
      } as NfcTagScannedEvent;
      expect(readNfcEvent(event)).toBeNull();
    });

    it("should return tag with UID and empty text when no NDEF message", () => {
      const event: NfcTagScannedEvent = {
        nfcTag: {
          id: [4, 123, 45, 67, 89, 171, 128],
        },
      };

      const result = readNfcEvent(event);
      expect(result).toEqual({
        uid: "047b2d4359ab80",
        text: "",
      });
    });

    it("should return tag with UID and empty text when NDEF has no records", () => {
      const event: NfcTagScannedEvent = {
        nfcTag: {
          id: [4, 123, 45, 67],
          message: {
            records: [],
          },
        },
      };

      const result = readNfcEvent(event);
      expect(result).toEqual({
        uid: "047b2d43",
        text: "",
      });
    });

    it("should extract text from NDEF text record with language code prefix", () => {
      // NDEF text record format: [encoding byte, lang code bytes, text bytes]
      // encoding byte = 2 means UTF-8 with 2-byte language code
      const event: NfcTagScannedEvent = {
        nfcTag: {
          id: [4, 123, 45, 67],
          message: {
            records: [
              {
                tnf: 1, // NFC Forum well-known type
                payload: [2, 101, 110, 72, 101, 108, 108, 111], // 2, "en", "Hello"
              },
            ],
          },
        },
      };

      const result = readNfcEvent(event);
      expect(result).toEqual({
        uid: "047b2d43",
        text: "Hello",
      });
    });

    it("should handle NDEF record without language code prefix", () => {
      // Payload that doesn't start with 2 (language code byte)
      const event: NfcTagScannedEvent = {
        nfcTag: {
          id: [1, 2, 3, 4],
          message: {
            records: [
              {
                tnf: 1, // NFC Forum well-known type
                payload: [84, 101, 115, 116], // "Test" without prefix
              },
            ],
          },
        },
      };

      const result = readNfcEvent(event);
      expect(result).toEqual({
        uid: "01020304",
        text: "Test",
      });
    });

    it("should handle short payload gracefully", () => {
      const event: NfcTagScannedEvent = {
        nfcTag: {
          id: [1, 2],
          message: {
            records: [
              {
                tnf: 1, // NFC Forum well-known type
                payload: [2], // Only encoding byte, no text
              },
            ],
          },
        },
      };

      const result = readNfcEvent(event);
      expect(result).toEqual({
        uid: "0102",
        text: "\u0002", // Single byte as char
      });
    });
  });

  describe("isFormatRelatedError", () => {
    it("should return false for non-Error values", () => {
      expect(isFormatRelatedError(null)).toBe(false);
      expect(isFormatRelatedError(undefined)).toBe(false);
      expect(isFormatRelatedError("error")).toBe(false);
      expect(isFormatRelatedError(42)).toBe(false);
    });

    it("should return false for unrelated errors", () => {
      expect(isFormatRelatedError(new Error("Network error"))).toBe(false);
      expect(isFormatRelatedError(new Error("Connection timeout"))).toBe(false);
      expect(isFormatRelatedError(new Error("Permission denied"))).toBe(false);
    });

    it("should return true for format-related error messages", () => {
      expect(isFormatRelatedError(new Error("unknown error"))).toBe(true);
      expect(
        isFormatRelatedError(new Error("An unknown error has occurred")),
      ).toBe(true);
      expect(isFormatRelatedError(new Error("Format failed"))).toBe(true);
      expect(
        isFormatRelatedError(new Error("only one tagtechnology allowed")),
      ).toBe(true);
    });

    it("should be case insensitive", () => {
      expect(isFormatRelatedError(new Error("UNKNOWN ERROR"))).toBe(true);
      expect(isFormatRelatedError(new Error("FORMAT FAILED"))).toBe(true);
    });

    it("should match partial strings", () => {
      expect(
        isFormatRelatedError(new Error("Tag formatting error occurred")),
      ).toBe(true);
      expect(
        isFormatRelatedError(new Error("NFC: an unknown error occurred")),
      ).toBe(true);
    });
  });
});
