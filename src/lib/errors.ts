import { PURCHASES_ERROR_CODE } from "@revenuecat/purchases-capacitor";

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

/**
 * Returned when camera access was denied for a barcode scan.
 * User settings can resolve this; it is not an application defect.
 */
export class BarcodePermissionDeniedError extends ZaparooError {
  constructor(message = "Camera permission was denied") {
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
 * Returned when the store confirms that the user already owns the product.
 * The caller can use this as a trusted store-ownership signal when RevenueCat
 * has lost the corresponding entitlement association.
 */
export class PurchaseAlreadyOwnedError extends ZaparooError {
  constructor(message = "Purchase is already owned") {
    super(message);
  }
}

/**
 * Returned when the native store does not permit this account or device to
 * make purchases. This happens before checkout and is distinct from a declined
 * payment method.
 */
export class PurchaseNotAllowedError extends ZaparooError {
  constructor(message = "Purchase is not allowed") {
    super(message);
  }
}

/**
 * Returned when the store reports the product itself cannot be purchased,
 * for example a country or account where the product is not offered. This is
 * store-account/region state, not something a live update can fix.
 */
export class PurchaseProductUnavailableError extends ZaparooError {
  constructor(message = "Product is not available for purchase") {
    super(message);
  }
}

/**
 * Returned when RevenueCat itself is misconfigured for this build (missing or
 * invalid API key, product not set up in the RevenueCat dashboard). Distinct
 * from a per-user store restriction: this affects every purchase attempt.
 */
export class PurchaseConfigurationError extends ZaparooError {
  constructor(message = "Purchases are misconfigured for this app build") {
    super(message);
  }
}

export interface PurchaseErrorDiagnostics {
  code?: string;
  readableErrorCode?: string;
  underlyingErrorMessage?: string;
  userCancelled?: boolean;
}

/**
 * Preserve safe RevenueCat error fields that would otherwise be lost when a
 * Capacitor bridge rejection is normalized to a JavaScript Error.
 */
export function getPurchaseErrorDiagnostics(
  error: unknown,
): PurchaseErrorDiagnostics {
  const records: Record<string, unknown>[] = [];
  const visited = new Set<unknown>();

  const collect = (value: unknown, depth: number): void => {
    if (
      depth > 2 ||
      value === null ||
      typeof value !== "object" ||
      visited.has(value)
    ) {
      return;
    }

    visited.add(value);
    const record = value as Record<string, unknown>;
    records.push(record);
    for (const key of ["data", "userInfo", "error"]) {
      collect(record[key], depth + 1);
    }
  };

  collect(error, 0);

  const firstString = (key: string): string | undefined => {
    for (const record of records) {
      const value = record[key];
      if (typeof value === "string" && value.length > 0) return value;
      if (typeof value === "number") return String(value);
    }
    return undefined;
  };
  const firstBoolean = (key: string): boolean | undefined => {
    for (const record of records) {
      const value = record[key];
      if (typeof value === "boolean") return value;
    }
    return undefined;
  };

  const message = firstString("message")?.toLowerCase() ?? "";
  const inferredReadableErrorCode = message.includes(
    "device or user is not allowed to make the purchase",
  )
    ? "PurchaseNotAllowedError"
    : message.includes("already active for the user") ||
        message.includes("already own this") ||
        message.includes("already purchased")
      ? "ProductAlreadyPurchasedError"
      : undefined;

  const code = firstString("code");
  const readableErrorCode =
    firstString("readableErrorCode") ?? inferredReadableErrorCode;
  const underlyingErrorMessage = firstString("underlyingErrorMessage");
  const userCancelled = firstBoolean("userCancelled");

  return {
    ...(code !== undefined ? { code } : {}),
    ...(readableErrorCode !== undefined ? { readableErrorCode } : {}),
    ...(underlyingErrorMessage !== undefined ? { underlyingErrorMessage } : {}),
    ...(userCancelled !== undefined ? { userCancelled } : {}),
  };
}

function normalizePurchaseErrorName(value: string | undefined): string {
  return (value ?? "").replace(/[^a-z0-9]/gi, "").toLowerCase();
}

function matchesPurchaseErrorCode(
  diagnostics: PurchaseErrorDiagnostics,
  codeName: keyof typeof PURCHASES_ERROR_CODE,
): boolean {
  return (
    diagnostics.code === PURCHASES_ERROR_CODE[codeName] ||
    normalizePurchaseErrorName(diagnostics.readableErrorCode) ===
      normalizePurchaseErrorName(codeName)
  );
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
  return (
    matchesPurchaseErrorCode(
      getPurchaseErrorDiagnostics(error),
      "LOG_OUT_ANONYMOUS_USER_ERROR",
    ) || includesAnyToken(error, EXPECTED_REVENUECAT_LOGOUT_TOKENS)
  );
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
    msg.includes("tag is not connected") ||
    msg.includes("tag was lost") ||
    msg.includes("taglostexception") ||
    msg.includes("tag is out of date") ||
    msg.includes("stale tag") ||
    msg.includes("could not connect to tag") ||
    msg.includes("session invalidated unexpectedly") ||
    msg.includes("reader session invalidated") ||
    msg.includes("connection lost") ||
    msg === "stack error" ||
    msg.includes("system resource unavailable")
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

  if (
    msg.includes("denied access to camera") ||
    msg.includes("camera permission denied") ||
    msg.includes("camera access denied") ||
    msg.includes("not authorized to use camera")
  ) {
    return new BarcodePermissionDeniedError(error.message);
  }

  return error;
}

/**
 * Wraps RevenueCat purchase errors into app-specific typed errors.
 * Capacitor bridge failures may expose fields directly or under nested data.
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
  const diagnostics = getPurchaseErrorDiagnostics(error);

  if (
    diagnostics.userCancelled === true ||
    matchesPurchaseErrorCode(diagnostics, "PURCHASE_CANCELLED_ERROR") ||
    msg.includes("purchase was cancelled") ||
    msg.includes("purchase was canceled") ||
    msg.includes("user cancelled") ||
    msg.includes("user canceled")
  ) {
    return new PurchaseCancelledError(message);
  }

  if (
    matchesPurchaseErrorCode(diagnostics, "PAYMENT_PENDING_ERROR") ||
    msg.includes("payment pending") ||
    msg.includes("purchase is pending")
  ) {
    return new PurchasePendingError(message);
  }

  if (
    matchesPurchaseErrorCode(diagnostics, "PRODUCT_ALREADY_PURCHASED_ERROR") ||
    msg.includes("already active for the user") ||
    msg.includes("already own this") ||
    msg.includes("already owns this") ||
    msg.includes("already purchased")
  ) {
    return new PurchaseAlreadyOwnedError(message);
  }

  if (
    matchesPurchaseErrorCode(diagnostics, "PURCHASE_NOT_ALLOWED_ERROR") ||
    msg.includes("device or user is not allowed to make the purchase")
  ) {
    return new PurchaseNotAllowedError(message);
  }

  if (
    matchesPurchaseErrorCode(
      diagnostics,
      "PRODUCT_NOT_AVAILABLE_FOR_PURCHASE_ERROR",
    ) ||
    msg.includes("not available for purchase") ||
    msg.includes("item is not available in your country") ||
    msg.includes("item_unavailable")
  ) {
    return new PurchaseProductUnavailableError(message);
  }

  if (matchesPurchaseErrorCode(diagnostics, "CONFIGURATION_ERROR")) {
    return new PurchaseConfigurationError(message);
  }

  if (
    matchesPurchaseErrorCode(diagnostics, "INVALID_APP_USER_ID_ERROR") ||
    matchesPurchaseErrorCode(diagnostics, "LOG_OUT_ANONYMOUS_USER_ERROR")
  ) {
    return new PurchaseIdentityError(message);
  }

  return error instanceof Error ? error : new Error(message);
}
