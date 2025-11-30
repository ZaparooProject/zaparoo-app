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
  // Firebase/Auth related
  "idToken",
  "id_token",
  "firebaseToken",
  "firebase_token",
  // App-specific token fields (from error metadata)
  "tokenValue",
  "textPrefix"
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
    connectivity: true // Track online/offline status
  },
  maxTelemetryEvents: 20,

  // Payload configuration
  payload: {
    client: {
      javascript: {
        code_version: import.meta.env.VITE_VERSION || "unknown",
        source_map_enabled: false
      }
    },
    platform: Capacitor.getPlatform(),
    isNative: Capacitor.isNativePlatform()
  },

  // Transform payload before sending - extra safety check for PII
  transform: (payload: Record<string, unknown>) => {
    // Remove any person data that might have leaked through
    const data = payload.data;
    if (data && typeof data === "object" && !Array.isArray(data)) {
      const dataObj = data as Record<string, unknown>;
      if ("person" in dataObj) {
        delete dataObj.person;
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

  // Ignore user-initiated cancellations
  checkIgnore: (_isUncaught, args) => {
    const msg = String(args[0] || "");
    return msg.includes("cancelled") || msg.includes("aborted");
  },

  // Only transmit on native + production
  transmit: shouldEnable,
  verbose: !isProduction
};

// Create and export the Rollbar instance
export const rollbar = new Rollbar(rollbarConfig);
export default rollbar;
