/**
 * Custom error classes for Zaparoo App.
 *
 * These provide type-safe error handling instead of fragile string matching.
 * Use instanceof checks to identify error types.
 */

/**
 * Base class for all Zaparoo-specific errors.
 * Extends Error with proper prototype chain for instanceof checks.
 */
export class ZaparooError extends Error {
  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
    // Fix prototype chain for instanceof to work correctly
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

// =============================================================================
// NFC Errors
// =============================================================================

/**
 * Thrown when user cancels an NFC scan/write session.
 * This is expected behavior, not an error to log.
 */
export class NfcCancelledError extends ZaparooError {
  constructor(message = "NFC scan session was canceled by user") {
    super(message);
  }
}

/**
 * Thrown when NFC tag is not NDEF formatted.
 * Can be recovered by formatting the tag first.
 */
export class NfcUnformattedTagError extends ZaparooError {
  constructor(
    message = "NFC tag is not NDEF formatted",
    public readonly originalError?: Error,
  ) {
    super(message);
  }
}

/**
 * Thrown when NFC format operation fails.
 */
export class NfcFormatError extends ZaparooError {
  constructor(
    message = "NFC tag format operation failed",
    public readonly originalError?: Error,
  ) {
    super(message);
  }
}

// =============================================================================
// Barcode Scanner Errors
// =============================================================================

/**
 * Thrown when user cancels a barcode scan.
 * This is expected behavior, not an error to log.
 */
export class BarcodeScanCancelledError extends ZaparooError {
  constructor(message = "Barcode scan was canceled by user") {
    super(message);
  }
}

// =============================================================================
// Purchase Errors
// =============================================================================

/**
 * Thrown when user cancels a purchase.
 * This is expected behavior, not an error to log.
 */
export class PurchaseCancelledError extends ZaparooError {
  constructor(message = "Purchase was canceled by user") {
    super(message);
  }
}

// =============================================================================
// Type Guards
// =============================================================================

/**
 * Check if error is a user-initiated cancellation (any type).
 * Use this to avoid logging user cancellations as errors.
 */
export function isCancellationError(error: unknown): boolean {
  return (
    error instanceof NfcCancelledError ||
    error instanceof BarcodeScanCancelledError ||
    error instanceof PurchaseCancelledError
  );
}

/**
 * Check if error is NFC-related.
 */
export function isNfcError(error: unknown): boolean {
  return (
    error instanceof NfcCancelledError ||
    error instanceof NfcUnformattedTagError ||
    error instanceof NfcFormatError
  );
}

// =============================================================================
// Error Wrapping Utilities
// =============================================================================

/**
 * Wraps native NFC plugin errors into typed errors.
 * Call this at the boundary where native plugin errors are caught.
 *
 * @param error - The error from the native NFC plugin
 * @returns A typed error if recognized, otherwise the original error
 */
export function wrapNfcError(error: unknown): Error {
  if (!(error instanceof Error)) {
    return error instanceof Error ? error : new Error(String(error));
  }

  const msg = error.message.toLowerCase();

  // Check for unformatted tag errors
  if (
    msg.includes("not yet been formatted as ndef") ||
    msg.includes("tag is not ndef") ||
    msg.includes("not ndef formatted")
  ) {
    return new NfcUnformattedTagError(error.message, error);
  }

  // Check for format-related errors (used for user-friendly messages)
  if (
    msg.includes("unknown error") ||
    msg.includes("an unknown error has occurred") ||
    msg.includes("only one tagtechnology") ||
    msg.includes("format")
  ) {
    return new NfcFormatError(error.message, error);
  }

  return error;
}

/**
 * Wraps barcode scanner plugin errors into typed errors.
 * The MLKit barcode scanner throws generic errors on cancellation.
 *
 * @param error - The error from the barcode scanner plugin
 * @returns A typed error if recognized, otherwise the original error
 */
export function wrapBarcodeScannerError(error: unknown): Error {
  if (!(error instanceof Error)) {
    return error instanceof Error ? error : new Error(String(error));
  }

  const msg = error.message.toLowerCase();

  // Check for cancellation (plugin uses both spellings)
  if (msg.includes("canceled") || msg.includes("cancelled")) {
    return new BarcodeScanCancelledError(error.message);
  }

  return error;
}

/**
 * Wraps RevenueCat purchase errors into typed errors.
 * RevenueCat doesn't expose typed errors, only string messages.
 *
 * @param error - The error from RevenueCat
 * @returns A typed error if recognized, otherwise the original error
 */
export function wrapPurchaseError(error: unknown): Error {
  if (!(error instanceof Error)) {
    return error instanceof Error ? error : new Error(String(error));
  }

  const msg = error.message.toLowerCase();

  // Check for purchase cancellation
  if (
    msg.includes("purchase was cancelled") ||
    msg.includes("purchase was canceled") ||
    msg.includes("user cancelled") ||
    msg.includes("user canceled")
  ) {
    return new PurchaseCancelledError(error.message);
  }

  return error;
}
