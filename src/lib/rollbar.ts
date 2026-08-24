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
          "unclassified";
        dataObj.fingerprint = `purchase:${custom.action}:${errorCode}`;
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
