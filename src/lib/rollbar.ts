/**
 * Rollbar error tracking configuration.
 *
 * Key constraints:
 * - Native only: Rollbar only enabled on iOS/Android (not web build)
 * - Production only: No error reporting in development mode
 * - No PII: Strict scrubbing of all personally identifiable information
 */

import Rollbar from "rollbar";
import { Capacitor } from "@capacitor/core";
import { isCancellationError } from "./errors";
import { resolveRuntimeReleaseIdentity } from "./whatsNew";

// Extended list of fields to scrub for PII protection
const scrubFields = [
  // Auth
  "password",
  "passwd",
  "pw",
  "secret",
  "token",
  "accessToken",
  "access_token",
  "refreshToken",
  "refresh_token",
  "apiKey",
  "api_key",
  "authorization",
  "bearer",
  "credential",
  "credentials",
  // Personal
  "email",
  "emailAddress",
  "email_address",
  "mail",
  "phone",
  "phoneNumber",
  "phone_number",
  "mobile",
  "cell",
  "firstName",
  "first_name",
  "lastName",
  "last_name",
  "fullName",
  "displayName",
  "username",
  "user_name",
  "userId",
  "user_id",
  "uid",
  "ssn",
  "socialSecurity",
  "dob",
  "dateOfBirth",
  "birthday",
  "address",
  "street",
  "city",
  "zip",
  "zipCode",
  "postalCode",
  // Financial
  "creditCard",
  "credit_card",
  "ccNumber",
  "cardNumber",
  "cvv",
  "cvc",
  "expiry",
  "bankAccount",
  "routingNumber",
  // Device identifiers (extra safety)
  "deviceId",
  "device_id",
  "deviceAddress",
  "device_address",
  "macAddress",
  "mac_address",
  "imei",
  "udid",
  // Device registry fields — these name a device on the user's network
  "host",
  "hostname",
  "wsUrl",
  "recordId",
  "endpointId",
  "legacyCredentialKey",
  // Firebase/Auth related
  "idToken",
  "id_token",
  "firebaseToken",
  "firebase_token",
  // App-specific token fields (from error metadata)
  "tokenValue",
  "textPrefix",
];

// Only enable on native platforms (iOS/Android) in production
const isNative = Capacitor.isNativePlatform();
const isProduction = import.meta.env.PROD;
const shouldEnable =
  isNative && isProduction && !!import.meta.env.VITE_ROLLBAR_ACCESS_TOKEN;

export const isRollbarEnabled = shouldEnable;

const MAX_FINGERPRINT_DETAIL_LENGTH = 120;
const MAX_TITLE_LENGTH = 255;

/**
 * Reduce an error message to its stable shape so variable values such as
 * paths, IDs, and embedded data don't split one failure into many items.
 * Short numbers are kept because status codes distinguish real failures.
 */
export function normalizeFingerprintDetail(detail: string): string {
  return detail
    .toLowerCase()
    .replace(/\{[\s\S]*\}|\[[\s\S]*\]/g, "<data>")
    .replace(/"[^"]*"|'[^']*'|`[^`]*`/g, "<str>")
    .replace(/\S*[\\/]\S*/g, "<path>")
    .replace(/\b\d{1,3}(?:\.\d{1,3}){3}(?::\d+)?\b/g, "<ip>")
    .replace(/\b(?=[a-z0-9_-]*\d)[a-z0-9_-]{16,}\b/g, "<id>")
    .replace(/\d{4,}/g, "<n>")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_FINGERPRINT_DETAIL_LENGTH);
}

function buildReportTitle(
  custom: Record<string, unknown> | null,
): string | null {
  if (!custom || typeof custom.errorMessage !== "string") return null;

  const errorName =
    typeof custom.errorName === "string" && custom.errorName !== "Error"
      ? custom.errorName
      : null;
  const errorText = errorName
    ? `${errorName}: ${custom.errorMessage}`
    : custom.errorMessage;
  const message =
    typeof custom.message === "string"
      ? custom.message.replace(/[\s:]+$/, "")
      : "";
  const title =
    message && message !== custom.errorMessage
      ? `${message}: ${errorText}`
      : errorText;

  return title.slice(0, MAX_TITLE_LENGTH);
}

export const rollbarConfig: Rollbar.Configuration = {
  accessToken: import.meta.env.VITE_ROLLBAR_ACCESS_TOKEN || "",
  environment: isProduction ? "production" : "development",
  enabled: shouldEnable,

  // Capture uncaught errors and unhandled promise rejections
  captureUncaught: true,
  captureUnhandledRejections: true,

  // PII Prevention - don't capture any identifying information
  captureIp: false,
  captureUsername: false,
  captureEmail: false,
  scrubFields,
  scrubTelemetryInputs: true,

  // Telemetry configuration - minimal collection
  autoInstrument: {
    network: true, // Track network requests (URLs only, no body)
    log: false, // Don't capture console logs
    dom: false, // Don't track DOM interactions (could capture PII)
    navigation: true, // Track page/route navigation
    connectivity: true, // Track online/offline status
  },
  maxTelemetryEvents: 20,

  // Payload configuration
  payload: {
    client: {
      javascript: {
        code_version: import.meta.env.VITE_VERSION || "unknown",
        source_map_enabled: false,
      },
    },
    platform: Capacitor.getPlatform(),
    isNative: Capacitor.isNativePlatform(),
  },

  // Transform payload before sending - extra safety check for PII
  transform: (payload: Record<string, unknown>) => {
    const data = payload.data;
    if (data && typeof data === "object" && !Array.isArray(data)) {
      const dataObj = data as Record<string, unknown>;
      const custom =
        dataObj.custom &&
        typeof dataObj.custom === "object" &&
        !Array.isArray(dataObj.custom)
          ? (dataObj.custom as Record<string, unknown>)
          : null;

      // Remove arbitrary person data, then add only RevenueCat's generated
      // anonymous alias for billing support correlation. Never forward custom
      // app user IDs because they may map to an authenticated account.
      delete dataObj.person;
      if (
        custom?.category === "purchase" &&
        typeof custom.billingSupportProfileID === "string" &&
        custom.billingSupportProfileID.startsWith("$RCAnonymousID:")
      ) {
        dataObj.person = { id: custom.billingSupportProfileID };
      }

      // Native bridge stacks are nearly identical, so default Rollbar grouping
      // can merge unrelated store errors. Split purchase items by operation and
      // RevenueCat's stable structured error code.
      if (
        custom?.category === "purchase" &&
        typeof custom.action === "string"
      ) {
        const purchaseError =
          custom.purchaseError &&
          typeof custom.purchaseError === "object" &&
          !Array.isArray(custom.purchaseError)
            ? (custom.purchaseError as Record<string, unknown>)
            : null;
        const readableErrorCode =
          typeof purchaseError?.readableErrorCode === "string"
            ? purchaseError.readableErrorCode
            : null;
        const errorCode =
          readableErrorCode
            ?.replace(/([a-z0-9])([A-Z])/g, "$1_$2")
            .replace(/[^a-zA-Z0-9]+/g, "_")
            .toUpperCase() ||
          (typeof purchaseError?.code === "string" && purchaseError.code) ||
          (typeof custom.errorMessage === "string"
            ? `unclassified:${normalizeFingerprintDetail(custom.errorMessage)}`
            : "unclassified");
        dataObj.fingerprint = `purchase:${custom.action}:${errorCode}`;
      } else if (
        typeof custom?.category === "string" &&
        typeof custom.action === "string" &&
        typeof custom.errorMessage === "string"
      ) {
        // Core API and native plugin errors share the same few stack frames,
        // so stack-based grouping merges unrelated failures. Reports that name
        // an action are grouped by that action and the error text instead.
        dataObj.fingerprint = `${custom.category}:${custom.action}:${normalizeFingerprintDetail(custom.errorMessage)}`;
      }

      const title = buildReportTitle(custom);
      if (title) {
        dataObj.title = title;
      }

      // Redact request body if present
      const request = dataObj.request;
      if (request && typeof request === "object" && !Array.isArray(request)) {
        const requestObj = request as Record<string, unknown>;
        if ("body" in requestObj) {
          requestObj.body = "[REDACTED]";
        }
      }
    }
  },

  // Ignore user-initiated cancellations and connection errors
  checkIgnore: (_isUncaught, args) => {
    const error = args[0];

    // Check typed cancellation errors first (preferred - type-safe)
    if (isCancellationError(error)) {
      return true;
    }

    // Fallback to string matching for external/uncontrolled errors
    const msg = String(error || "").toLowerCase();
    const errorMsg = error instanceof Error ? error.message.toLowerCase() : "";

    // Patterns to ignore - these are expected operational errors, not bugs
    const ignorePatterns = [
      // User-initiated (fallback for external libraries)
      "canceled",
      "cancelled",
      "scan canceled", // MLKit barcode scanner cancellation message
      "aborted",
      // Connection/network errors - expected when device is off/unreachable
      "websocket",
      "connection reset",
      "connection closed",
      "connection refused",
      "connection timeout",
      "request requires active connection",
      "request expired while waiting for connection",
      "failed to connect",
      "network error",
      "network request failed",
      "failed to fetch",
      "load failed",
      "timeout",
      "econnrefused",
      "econnreset",
      "etimedout",
      "enetunreach",
      "ehostunreach",
      // WebSocket specific
      "socket is not open",
      "socket is already closed",
      "readystate",
    ];

    const combinedMsg = `${msg} ${errorMsg}`;
    return ignorePatterns.some((pattern) => combinedMsg.includes(pattern));
  },

  // Only transmit on native + production
  transmit: shouldEnable,
  verbose: !isProduction,
};

// Create and export the Rollbar instance
export const rollbar = new Rollbar(rollbarConfig);

// code_version starts as the native app version (set synchronously above).
// Once the live-update bundle identity resolves, upgrade it to the full
// release key so a live-updated bundle can be told apart from the native
// build it shipped in - otherwise every OTA reports under the same version.
if (shouldEnable) {
  void resolveRuntimeReleaseIdentity()
    .then((identity) => {
      rollbar.configure({
        payload: {
          client: {
            javascript: {
              code_version: identity.releaseKey,
            },
          },
        },
      });
    })
    .catch(() => {
      // Keep the native-version fallback already set at construction.
    });
}

export default rollbar;
