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
 * Thrown when NFC tag/session loss is expected during normal tag interaction.
 */
export class NfcTransientError extends ZaparooError {
  constructor(
    message = "NFC tag was lost during operation",
    public readonly originalError?: Error,
  ) {
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

/**
 * Thrown when a post-write read-back of the tag shows the written data did not
 * stick (empty NDEF, mismatched text, or unparseable contents). A tag-quality
 * problem the user can fix by retrying, not a production monitoring event.
 */
export class NfcVerificationError extends ZaparooError {
  constructor(
    message = "NFC write verification failed: tag data does not match written data",
    public readonly reason?: "empty" | "mismatch" | "no-ndef" | "unparseable",
  ) {
    super(message);
  }
}

/**
 * Thrown when an NFC session is requested while another session is active.
 * Callers decide whether to cancel the active session and retry.
 */
export class NfcSessionBusyError extends ZaparooError {
  constructor(message = "Another NFC operation is already in progress") {
    super(message);
  }
}

// =============================================================================
// API Errors
// =============================================================================

/**
 * Thrown when a JSON-RPC request is cancelled before completion, e.g. dropped
 * from the offline queue or aborted on connection reset. Not a user-facing
 * error condition in itself; callers surface their own feedback.
 */
export class RequestCancelledError extends ZaparooError {
  constructor(message = "Request was cancelled") {
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

/**
 * Returned when store checkout is awaiting external approval or payment.
 */
export class PurchasePendingError extends ZaparooError {
  constructor(message = "Purchase is pending") {
    super(message);
  }
}

/**
 * Returned when RevenueCat cannot safely associate the store operation with
 * the expected app account.
 */
export class PurchaseIdentityError extends ZaparooError {
  constructor(message = "Purchase account identity is invalid") {
    super(message);
  }
}

// =============================================================================
// Auth and RevenueCat State Errors
// =============================================================================

const EXPECTED_EMAIL_AUTH_TOKENS = [
  "auth/invalid-credential",
  "invalid-credential",
  "auth/wrong-password",
  "wrong-password",
  "auth/user-not-found",
  "user-not-found",
  "auth/invalid-email",
  "invalid-email",
  "auth/email-already-in-use",
  "email-already-in-use",
  "auth/weak-password",
  "weak-password",
];

const EXPECTED_REVENUECAT_LOGOUT_TOKENS = [
  "already anonymous",
  "current user is anonymous",
  "anonymous app user",
  "cannot log out anonymous",
  "can't log out anonymous",
  "cannot logout anonymous",
  "can't logout anonymous",
  "no current user",
  "credentials unavailable",
  "credentials_unavailable",
  "credential unavailable",
  "credential_unavailable",
  "missing credentials",
  "no credentials",
];

export function collectErrorSearchStrings(error: unknown): string[] {
  const strings: string[] = [];
  const visited = new Set<unknown>();

  const collect = (value: unknown): void => {
    if (value == null || visited.has(value)) return;

    if (typeof value === "string") {
      strings.push(value.toLowerCase());
      return;
    }

    if (typeof value !== "object") return;

    visited.add(value);
    if (value instanceof Error) {
      strings.push(value.name.toLowerCase(), value.message.toLowerCase());
    }

    const record = value as Record<string, unknown>;
    for (const key of [
      "code",
      "name",
      "message",
      "readableErrorCode",
      "underlyingErrorMessage",
      "localizedDescription",
      "domain",
      "userInfo",
      "error",
    ]) {
      collect(record[key]);
    }
  };

  collect(error);
  return strings;
}

function includesAnyToken(error: unknown, tokens: readonly string[]): boolean {
  const searchStrings = collectErrorSearchStrings(error);
  return tokens.some((token) =>
    searchStrings.some((searchString) => searchString.includes(token)),
  );
}

/**
 * Check if Firebase email auth failed for expected user-facing reasons.
 * These are login/signup states, not production monitoring events.
 */
export function isExpectedEmailAuthError(error: unknown): boolean {
  return includesAnyToken(error, EXPECTED_EMAIL_AUTH_TOKENS);
}

/**
 * Check if RevenueCat logout failed because auth state already moved anonymous.
 * These races are expected during sign-out and should not report to monitoring.
 */
export function isExpectedRevenueCatLogoutError(error: unknown): boolean {
  return includesAnyToken(error, EXPECTED_REVENUECAT_LOGOUT_TOKENS);
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
    error instanceof PurchaseCancelledError ||
    error instanceof RequestCancelledError
  );
}

/**
 * Check if error is NFC-related.
 */
export function isNfcError(error: unknown): boolean {
  return (
    error instanceof NfcCancelledError ||
    error instanceof NfcTransientError ||
    error instanceof NfcUnformattedTagError ||
    error instanceof NfcFormatError ||
    error instanceof NfcVerificationError
  );
}

/**
 * Check if error is an expected transient NFC failure.
 */
export function isTransientNfcError(error: unknown): boolean {
  return error instanceof NfcTransientError;
}

/**
 * Check if NFC error should surface user feedback without production reporting.
 */
export function isExpectedNfcError(error: unknown): boolean {
  const wrappedError = wrapNfcError(error);
  return (
    wrappedError instanceof NfcCancelledError ||
    wrappedError instanceof NfcTransientError ||
    wrappedError instanceof NfcUnformattedTagError ||
    wrappedError instanceof NfcFormatError ||
    wrappedError instanceof NfcVerificationError
  );
}

// =============================================================================
// Error Wrapping Utilities
// =============================================================================

function normalizeError(error: unknown): Error {
  if (error instanceof Error) {
    return error;
  }

  if (
    error !== null &&
    typeof error === "object" &&
    "message" in error &&
    typeof error.message === "string"
  ) {
    return new Error(error.message);
  }

  return new Error(String(error));
}

/**
 * Wraps native NFC plugin errors into typed errors.
 * Call this at the boundary where native plugin errors are caught.
 *
 * @param error - The error from the native NFC plugin
 * @returns A typed error if recognized, otherwise the original error
 */
export function wrapNfcError(error: unknown): Error {
  const normalizedError = normalizeError(error);

  if (
    normalizedError instanceof NfcCancelledError ||
    normalizedError instanceof NfcTransientError ||
    normalizedError instanceof NfcUnformattedTagError ||
    normalizedError instanceof NfcFormatError ||
    normalizedError instanceof NfcVerificationError
  ) {
    return normalizedError;
  }

  const msg = normalizedError.message.toLowerCase();

  // Check for unformatted tag errors
  if (
    msg.includes("not yet been formatted as ndef") ||
    msg.includes("tag is not ndef") ||
    msg.includes("not ndef formatted")
  ) {
    return new NfcUnformattedTagError(normalizedError.message, normalizedError);
  }

  // Check for transient tag/session loss during normal NFC operations
  if (
    msg.includes("no nfc tag was detected") ||
    msg.includes("the tag is not connected") ||
    msg.includes("tag was lost") ||
    msg.includes("taglostexception") ||
    msg.includes("tag is out of date") ||
    msg.includes("stale tag") ||
    msg.includes("could not connect to tag") ||
    msg.includes("session invalidated unexpectedly") ||
    msg.includes("reader session invalidated") ||
    msg.includes("connection lost")
  ) {
    return new NfcTransientError(normalizedError.message, normalizedError);
  }

  // Check for format-related errors (used for user-friendly messages)
  if (
    msg.includes("unknown error") ||
    msg.includes("an unknown error has occurred") ||
    msg.includes("only one tagtechnology") ||
    msg.includes("format")
  ) {
    return new NfcFormatError(normalizedError.message, normalizedError);
  }

  return normalizedError;
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
  const record =
    typeof error === "object" && error !== null
      ? (error as Record<string, unknown>)
      : null;
  const message =
    error instanceof Error
      ? error.message
      : typeof record?.message === "string"
        ? record.message
        : String(error);
  const msg = message.toLowerCase();
  const code = typeof record?.code === "string" ? record.code : null;
  const userInfo =
    typeof record?.userInfo === "object" && record.userInfo !== null
      ? (record.userInfo as Record<string, unknown>)
      : null;
  const readableCode = (
    typeof userInfo?.readableErrorCode === "string"
      ? userInfo.readableErrorCode
      : typeof record?.readableErrorCode === "string"
        ? record.readableErrorCode
        : ""
  ).toLowerCase();

  if (
    record?.userCancelled === true ||
    code === "1" ||
    readableCode.includes("purchase_cancelled") ||
    msg.includes("purchase was cancelled") ||
    msg.includes("purchase was canceled") ||
    msg.includes("user cancelled") ||
    msg.includes("user canceled")
  ) {
    return new PurchaseCancelledError(message);
  }

  if (
    code === "20" ||
    readableCode.includes("payment_pending") ||
    msg.includes("payment pending") ||
    msg.includes("purchase is pending")
  ) {
    return new PurchasePendingError(message);
  }

  if (
    code === "14" ||
    code === "22" ||
    readableCode.includes("invalid_app_user_id") ||
    readableCode.includes("log_out_anonymous_user")
  ) {
    return new PurchaseIdentityError(message);
  }

  return error instanceof Error ? error : new Error(message);
}
