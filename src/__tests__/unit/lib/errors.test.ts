/**
 * Unit tests for error classes and error wrapping utilities.
 *
 * Tests error class hierarchy, type guards, and wrapping functions
 * that convert native plugin errors into typed errors.
 */

import { describe, it, expect } from "vitest";
import {
  ZaparooError,
  NfcCancelledError,
  NfcUnformattedTagError,
  NfcFormatError,
  BarcodeScanCancelledError,
  PurchaseCancelledError,
  isCancellationError,
  isNfcError,
  wrapNfcError,
  wrapBarcodeScannerError,
  wrapPurchaseError,
} from "../../../lib/errors";

describe("errors", () => {
  describe("ZaparooError", () => {
    it("should extend Error", () => {
      const error = new ZaparooError("test message");

      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(ZaparooError);
    });

    it("should set correct name property", () => {
      const error = new ZaparooError("test message");

      expect(error.name).toBe("ZaparooError");
    });

    it("should set message correctly", () => {
      const error = new ZaparooError("custom message");

      expect(error.message).toBe("custom message");
    });

    it("should work with instanceof checks", () => {
      const error = new ZaparooError("test");

      expect(error instanceof ZaparooError).toBe(true);
      expect(error instanceof Error).toBe(true);
    });
  });

  describe("NfcCancelledError", () => {
    it("should extend ZaparooError", () => {
      const error = new NfcCancelledError();

      expect(error).toBeInstanceOf(ZaparooError);
      expect(error).toBeInstanceOf(Error);
    });

    it("should use default message when not provided", () => {
      const error = new NfcCancelledError();

      expect(error.message).toBe("NFC scan session was canceled by user");
    });

    it("should use custom message when provided", () => {
      const error = new NfcCancelledError("Custom cancel message");

      expect(error.message).toBe("Custom cancel message");
    });

    it("should set correct name property", () => {
      const error = new NfcCancelledError();

      expect(error.name).toBe("NfcCancelledError");
    });
  });

  describe("NfcUnformattedTagError", () => {
    it("should extend ZaparooError", () => {
      const error = new NfcUnformattedTagError();

      expect(error).toBeInstanceOf(ZaparooError);
      expect(error).toBeInstanceOf(Error);
    });

    it("should use default message when not provided", () => {
      const error = new NfcUnformattedTagError();

      expect(error.message).toBe("NFC tag is not NDEF formatted");
    });

    it("should use custom message when provided", () => {
      const error = new NfcUnformattedTagError("Tag not formatted");

      expect(error.message).toBe("Tag not formatted");
    });

    it("should store original error", () => {
      const originalError = new Error("Original NFC error");
      const error = new NfcUnformattedTagError("Wrapped error", originalError);

      expect(error.originalError).toBe(originalError);
    });

    it("should set correct name property", () => {
      const error = new NfcUnformattedTagError();

      expect(error.name).toBe("NfcUnformattedTagError");
    });
  });

  describe("NfcFormatError", () => {
    it("should extend ZaparooError", () => {
      const error = new NfcFormatError();

      expect(error).toBeInstanceOf(ZaparooError);
      expect(error).toBeInstanceOf(Error);
    });

    it("should use default message when not provided", () => {
      const error = new NfcFormatError();

      expect(error.message).toBe("NFC tag format operation failed");
    });

    it("should use custom message when provided", () => {
      const error = new NfcFormatError("Format failed");

      expect(error.message).toBe("Format failed");
    });

    it("should store original error", () => {
      const originalError = new Error("Native format error");
      const error = new NfcFormatError("Wrapped", originalError);

      expect(error.originalError).toBe(originalError);
    });

    it("should set correct name property", () => {
      const error = new NfcFormatError();

      expect(error.name).toBe("NfcFormatError");
    });
  });

  describe("BarcodeScanCancelledError", () => {
    it("should extend ZaparooError", () => {
      const error = new BarcodeScanCancelledError();

      expect(error).toBeInstanceOf(ZaparooError);
      expect(error).toBeInstanceOf(Error);
    });

    it("should use default message when not provided", () => {
      const error = new BarcodeScanCancelledError();

      expect(error.message).toBe("Barcode scan was canceled by user");
    });

    it("should use custom message when provided", () => {
      const error = new BarcodeScanCancelledError("User cancelled scan");

      expect(error.message).toBe("User cancelled scan");
    });

    it("should set correct name property", () => {
      const error = new BarcodeScanCancelledError();

      expect(error.name).toBe("BarcodeScanCancelledError");
    });
  });

  describe("PurchaseCancelledError", () => {
    it("should extend ZaparooError", () => {
      const error = new PurchaseCancelledError();

      expect(error).toBeInstanceOf(ZaparooError);
      expect(error).toBeInstanceOf(Error);
    });

    it("should use default message when not provided", () => {
      const error = new PurchaseCancelledError();

      expect(error.message).toBe("Purchase was canceled by user");
    });

    it("should use custom message when provided", () => {
      const error = new PurchaseCancelledError("User cancelled purchase");

      expect(error.message).toBe("User cancelled purchase");
    });

    it("should set correct name property", () => {
      const error = new PurchaseCancelledError();

      expect(error.name).toBe("PurchaseCancelledError");
    });
  });

  describe("isCancellationError", () => {
    it("should return true for NfcCancelledError", () => {
      expect(isCancellationError(new NfcCancelledError())).toBe(true);
    });

    it("should return true for BarcodeScanCancelledError", () => {
      expect(isCancellationError(new BarcodeScanCancelledError())).toBe(true);
    });

    it("should return true for PurchaseCancelledError", () => {
      expect(isCancellationError(new PurchaseCancelledError())).toBe(true);
    });

    it("should return false for other ZaparooErrors", () => {
      expect(isCancellationError(new ZaparooError("test"))).toBe(false);
      expect(isCancellationError(new NfcUnformattedTagError())).toBe(false);
      expect(isCancellationError(new NfcFormatError())).toBe(false);
    });

    it("should return false for standard Error", () => {
      expect(isCancellationError(new Error("test"))).toBe(false);
    });

    it("should return false for non-error values", () => {
      expect(isCancellationError(null)).toBe(false);
      expect(isCancellationError(undefined)).toBe(false);
      expect(isCancellationError("error string")).toBe(false);
      expect(isCancellationError(123)).toBe(false);
      expect(isCancellationError({})).toBe(false);
    });
  });

  describe("isNfcError", () => {
    it("should return true for NfcCancelledError", () => {
      expect(isNfcError(new NfcCancelledError())).toBe(true);
    });

    it("should return true for NfcUnformattedTagError", () => {
      expect(isNfcError(new NfcUnformattedTagError())).toBe(true);
    });

    it("should return true for NfcFormatError", () => {
      expect(isNfcError(new NfcFormatError())).toBe(true);
    });

    it("should return false for non-NFC errors", () => {
      expect(isNfcError(new ZaparooError("test"))).toBe(false);
      expect(isNfcError(new BarcodeScanCancelledError())).toBe(false);
      expect(isNfcError(new PurchaseCancelledError())).toBe(false);
    });

    it("should return false for standard Error", () => {
      expect(isNfcError(new Error("test"))).toBe(false);
    });

    it("should return false for non-error values", () => {
      expect(isNfcError(null)).toBe(false);
      expect(isNfcError(undefined)).toBe(false);
      expect(isNfcError("error string")).toBe(false);
    });
  });

  describe("wrapNfcError", () => {
    it("should wrap unformatted tag error with 'not yet been formatted as ndef'", () => {
      const originalError = new Error(
        "The NFC tag has not yet been formatted as NDEF.",
      );

      const wrapped = wrapNfcError(originalError);

      expect(wrapped).toBeInstanceOf(NfcUnformattedTagError);
      expect((wrapped as NfcUnformattedTagError).originalError).toBe(
        originalError,
      );
    });

    it("should wrap unformatted tag error with 'tag is not ndef'", () => {
      const originalError = new Error("Tag is not NDEF compatible");

      const wrapped = wrapNfcError(originalError);

      expect(wrapped).toBeInstanceOf(NfcUnformattedTagError);
    });

    it("should wrap unformatted tag error with 'not ndef formatted'", () => {
      const originalError = new Error("The tag is not NDEF formatted");

      const wrapped = wrapNfcError(originalError);

      expect(wrapped).toBeInstanceOf(NfcUnformattedTagError);
    });

    it("should wrap format error with 'unknown error'", () => {
      const originalError = new Error("An unknown error has occurred.");

      const wrapped = wrapNfcError(originalError);

      expect(wrapped).toBeInstanceOf(NfcFormatError);
      expect((wrapped as NfcFormatError).originalError).toBe(originalError);
    });

    it("should wrap format error with 'only one tagtechnology'", () => {
      const originalError = new Error(
        "Only one TagTechnology can be connected at a time.",
      );

      const wrapped = wrapNfcError(originalError);

      expect(wrapped).toBeInstanceOf(NfcFormatError);
    });

    it("should wrap format error containing 'format' keyword", () => {
      const originalError = new Error("Failed to format the NFC tag");

      const wrapped = wrapNfcError(originalError);

      expect(wrapped).toBeInstanceOf(NfcFormatError);
    });

    it("should return original error for unrecognized errors", () => {
      const originalError = new Error("Some other NFC error");

      const wrapped = wrapNfcError(originalError);

      expect(wrapped).toBe(originalError);
      expect(wrapped).not.toBeInstanceOf(NfcUnformattedTagError);
      expect(wrapped).not.toBeInstanceOf(NfcFormatError);
    });

    it("should convert non-Error values to Error", () => {
      const result = wrapNfcError("string error");

      expect(result).toBeInstanceOf(Error);
      expect(result.message).toBe("string error");
    });

    it("should convert number to Error", () => {
      const result = wrapNfcError(404);

      expect(result).toBeInstanceOf(Error);
      expect(result.message).toBe("404");
    });

    it("should handle null by converting to Error", () => {
      const result = wrapNfcError(null);

      expect(result).toBeInstanceOf(Error);
      expect(result.message).toBe("null");
    });

    it("should handle undefined by converting to Error", () => {
      const result = wrapNfcError(undefined);

      expect(result).toBeInstanceOf(Error);
      expect(result.message).toBe("undefined");
    });
  });

  describe("wrapBarcodeScannerError", () => {
    it("should wrap error with 'canceled' message", () => {
      const originalError = new Error("scan canceled.");

      const wrapped = wrapBarcodeScannerError(originalError);

      expect(wrapped).toBeInstanceOf(BarcodeScanCancelledError);
      expect(wrapped.message).toBe("scan canceled.");
    });

    it("should wrap error with 'cancelled' message (British spelling)", () => {
      const originalError = new Error("Scan was cancelled by user");

      const wrapped = wrapBarcodeScannerError(originalError);

      expect(wrapped).toBeInstanceOf(BarcodeScanCancelledError);
    });

    it("should be case insensitive for cancellation detection", () => {
      const upperCase = new Error("SCAN CANCELED");
      const mixedCase = new Error("Scan Cancelled");

      expect(wrapBarcodeScannerError(upperCase)).toBeInstanceOf(
        BarcodeScanCancelledError,
      );
      expect(wrapBarcodeScannerError(mixedCase)).toBeInstanceOf(
        BarcodeScanCancelledError,
      );
    });

    it("should return original error for non-cancellation errors", () => {
      const originalError = new Error("Camera permission denied");

      const wrapped = wrapBarcodeScannerError(originalError);

      expect(wrapped).toBe(originalError);
      expect(wrapped).not.toBeInstanceOf(BarcodeScanCancelledError);
    });

    it("should convert non-Error values to Error", () => {
      const result = wrapBarcodeScannerError("string error");

      expect(result).toBeInstanceOf(Error);
      expect(result.message).toBe("string error");
    });

    it("should handle null by converting to Error", () => {
      const result = wrapBarcodeScannerError(null);

      expect(result).toBeInstanceOf(Error);
      expect(result.message).toBe("null");
    });

    it("should handle undefined by converting to Error", () => {
      const result = wrapBarcodeScannerError(undefined);

      expect(result).toBeInstanceOf(Error);
      expect(result.message).toBe("undefined");
    });
  });

  describe("wrapPurchaseError", () => {
    it("should wrap error with 'purchase was cancelled'", () => {
      const originalError = new Error("Purchase was cancelled");

      const wrapped = wrapPurchaseError(originalError);

      expect(wrapped).toBeInstanceOf(PurchaseCancelledError);
      expect(wrapped.message).toBe("Purchase was cancelled");
    });

    it("should wrap error with 'purchase was canceled' (American spelling)", () => {
      const originalError = new Error("Purchase was canceled");

      const wrapped = wrapPurchaseError(originalError);

      expect(wrapped).toBeInstanceOf(PurchaseCancelledError);
    });

    it("should wrap error with 'user cancelled'", () => {
      const originalError = new Error("User cancelled the transaction");

      const wrapped = wrapPurchaseError(originalError);

      expect(wrapped).toBeInstanceOf(PurchaseCancelledError);
    });

    it("should wrap error with 'user canceled'", () => {
      const originalError = new Error("User canceled purchase");

      const wrapped = wrapPurchaseError(originalError);

      expect(wrapped).toBeInstanceOf(PurchaseCancelledError);
    });

    it("should be case insensitive for cancellation detection", () => {
      const upperCase = new Error("PURCHASE WAS CANCELLED");
      const mixedCase = new Error("User Canceled");

      expect(wrapPurchaseError(upperCase)).toBeInstanceOf(
        PurchaseCancelledError,
      );
      expect(wrapPurchaseError(mixedCase)).toBeInstanceOf(
        PurchaseCancelledError,
      );
    });

    it("should return original error for non-cancellation errors", () => {
      const originalError = new Error("Payment declined");

      const wrapped = wrapPurchaseError(originalError);

      expect(wrapped).toBe(originalError);
      expect(wrapped).not.toBeInstanceOf(PurchaseCancelledError);
    });

    it("should convert non-Error values to Error", () => {
      const result = wrapPurchaseError("string error");

      expect(result).toBeInstanceOf(Error);
      expect(result.message).toBe("string error");
    });

    it("should handle null by converting to Error", () => {
      const result = wrapPurchaseError(null);

      expect(result).toBeInstanceOf(Error);
      expect(result.message).toBe("null");
    });

    it("should handle undefined by converting to Error", () => {
      const result = wrapPurchaseError(undefined);

      expect(result).toBeInstanceOf(Error);
      expect(result.message).toBe("undefined");
    });
  });
});
