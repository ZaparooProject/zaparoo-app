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
});
