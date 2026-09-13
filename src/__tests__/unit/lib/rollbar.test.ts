import { describe, expect, it, vi } from "vitest";
import { RequestCancelledError } from "@/lib/errors";

vi.mock("@capacitor/core", () => ({
  Capacitor: {
    getPlatform: () => "web",
    isNativePlatform: () => false,
  },
}));

import { rollbarConfig } from "@/lib/rollbar";

function shouldIgnore(error: Error): boolean {
  return rollbarConfig.checkIgnore?.(false, [error], {}) ?? false;
}

function transformPayload(data: Record<string, unknown>) {
  const payload = { data };
  if (typeof rollbarConfig.transform === "function") {
    rollbarConfig.transform(payload, {});
  }
  return data;
}

describe("Rollbar error filtering", () => {
  it("should ignore typed request cancellations", () => {
    expect(shouldIgnore(new RequestCancelledError())).toBe(true);
  });

  it.each([
    "Request requires active connection",
    "Request expired while waiting for connection",
  ])("should ignore expected disconnected request error: %s", (message) => {
    expect(shouldIgnore(new Error(message))).toBe(true);
  });

  it.each([
    "ResizeObserver loop limit exceeded",
    "ResizeObserver loop completed with undelivered notifications.",
  ])("should ignore benign ResizeObserver notices: %s", (message) => {
    expect(shouldIgnore(new Error(message))).toBe(true);
  });

  it("should keep unexpected request failures", () => {
    expect(shouldIgnore(new Error("Core returned invalid media data"))).toBe(
      false,
    );
  });

  it("should correlate purchase reports with a RevenueCat anonymous alias", () => {
    const data = transformPayload({
      person: { id: "leaked", email: "private@example.com" },
      custom: {
        category: "purchase",
        billingSupportProfileID: "$RCAnonymousID:support-id",
      },
    });

    expect(data.person).toEqual({ id: "$RCAnonymousID:support-id" });
  });

  it("should reject a custom app user ID as a billing support profile", () => {
    const data = transformPayload({
      person: { id: "leaked", email: "private@example.com" },
      custom: {
        category: "purchase",
        billingSupportProfileID: "firebase-user-id",
      },
    });

    expect(data.person).toBeUndefined();
  });

  it("should not attach a person identifier to non-purchase reports", () => {
    const data = transformPayload({
      person: { id: "leaked", email: "private@example.com" },
      custom: {
        category: "nfc",
        billingSupportProfileID: "$RCAnonymousID:support-id",
      },
    });

    expect(data.person).toBeUndefined();
  });

  it("should fingerprint native purchase bridge errors by action and code", () => {
    const notAllowed = transformPayload({
      custom: {
        category: "purchase",
        action: "getOfferings",
        purchaseError: {
          code: "3",
          readableErrorCode: "PurchaseNotAllowedError",
        },
      },
    });
    const alreadyOwned = transformPayload({
      custom: {
        category: "purchase",
        action: "purchasePackage",
        purchaseError: {
          code: "6",
          readableErrorCode: "ProductAlreadyPurchasedError",
        },
      },
    });

    expect(notAllowed.fingerprint).toBe(
      "purchase:getOfferings:PURCHASE_NOT_ALLOWED_ERROR",
    );
    expect(alreadyOwned.fingerprint).toBe(
      "purchase:purchasePackage:PRODUCT_ALREADY_PURCHASED_ERROR",
    );
  });

  it("should split uncoded purchase errors by their message", () => {
    const forbidden = transformPayload({
      custom: {
        category: "purchase",
        action: "loadSubscription",
        errorMessage: "Request failed with status code 403",
      },
    });
    const serverError = transformPayload({
      custom: {
        category: "purchase",
        action: "loadSubscription",
        errorMessage: "Request failed with status code 502",
      },
    });

    expect(forbidden.fingerprint).toBe(
      "purchase:loadSubscription:unclassified:request failed with status code 403",
    );
    expect(serverError.fingerprint).not.toBe(forbidden.fingerprint);
  });

  it("should group action reports by error text instead of the shared stack", () => {
    const zapScriptInvalid = transformPayload({
      custom: {
        category: "api",
        action: "run",
        errorName: "CoreApiError",
        errorMessage: "ZapScript is invalid",
      },
    });
    const systemNotFound = transformPayload({
      custom: {
        category: "api",
        action: "run",
        errorName: "CoreApiError",
        errorMessage: "system not found: PC",
      },
    });

    expect(zapScriptInvalid.fingerprint).toBe("api:run:zapscript is invalid");
    expect(systemNotFound.fingerprint).toBe("api:run:system not found: pc");
  });

  it("should keep variable values out of action fingerprints", () => {
    const first = transformPayload({
      custom: {
        category: "api",
        action: "launch",
        errorMessage:
          'media not found: C64//userdata/roms/c64/fix_it_felix_64.d64 at 192.168.1.20:7497 id "abc"',
      },
    });
    const second = transformPayload({
      custom: {
        category: "api",
        action: "launch",
        errorMessage:
          'media not found: SNES//media/fat/games/SNES/Mario World.sfc at 10.0.0.5:7497 id "xyz"',
      },
    });
    const unknownSystem = transformPayload({
      custom: {
        category: "api",
        action: "systems",
        errorMessage:
          'error getting system "t6gd5x6t4fjrrlrseon2pnjf4m": unknown system: t6gd5x6t4fjrrlrseon2pnjf4m',
      },
    });

    expect(first.fingerprint).toBe(
      "api:launch:media not found: <path> at <ip> id <str>",
    );
    expect(second.fingerprint).not.toContain("snes");
    expect(unknownSystem.fingerprint).toBe(
      "api:systems:error getting system <str>: unknown system: <id>",
    );
  });

  it("should leave crash grouping to the stack when no action is named", () => {
    const data = transformPayload({
      custom: {
        category: "general",
        context: "route-error-boundary",
        errorName: "TypeError",
        errorMessage: "Cannot read properties of undefined (reading 'filter')",
      },
    });

    expect(data.fingerprint).toBeUndefined();
  });

  it("should title reports with the full, unstripped error message", () => {
    const data = transformPayload({
      custom: {
        category: "api",
        action: "readersWriteCancel",
        message: "Failed to send write cancel command:",
        errorName: "CoreApiError",
        errorMessage: "invalid params: missing params",
      },
    });
    const messageOnly = transformPayload({
      custom: {
        category: "storage",
        action: "hydratePreferences",
        errorName: "Error",
        errorMessage: "Preferences read timed out",
      },
    });

    expect(data.title).toBe(
      "Failed to send write cancel command: CoreApiError: invalid params: missing params",
    );
    expect(messageOnly.title).toBe("Preferences read timed out");
  });
});
