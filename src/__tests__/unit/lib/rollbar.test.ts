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
});
