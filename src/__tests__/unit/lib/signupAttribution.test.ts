import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockState } = vi.hoisted(() => ({
  mockState: { platform: "web" as string },
}));

vi.mock("@capacitor/core", () => ({
  Capacitor: {
    getPlatform: () => mockState.platform,
  },
}));

import { signupAttribution } from "@/lib/signupAttribution";

describe("signupAttribution", () => {
  beforeEach(() => {
    mockState.platform = "web";
  });

  it("names the App and its platform, nothing else", () => {
    mockState.platform = "ios";
    expect(signupAttribution()).toEqual({
      source: "zaparoo-app",
      medium: "app",
      content: "ios",
    });
  });

  it("reports the web build as web", () => {
    expect(signupAttribution()).toEqual({
      source: "zaparoo-app",
      medium: "app",
      content: "web",
    });
  });

  it("carries no identifier or free text", () => {
    const values = Object.values(signupAttribution());
    for (const value of values) {
      expect(value).toMatch(/^[a-z][a-z-]*$/);
    }
  });
});
