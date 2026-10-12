import { describe, expect, it, vi } from "vitest";
import { formatAppDate, formatAppDateTime } from "@/lib/formatDate";

const { language } = vi.hoisted(() => ({ language: { current: "de-DE" } }));

vi.mock("i18next", () => ({
  default: {
    get resolvedLanguage() {
      return language.current;
    },
    language: "en-US",
  },
}));

describe("formatDate", () => {
  const value = "2030-01-15T12:00:00Z";

  it("should format dates in the app language rather than the device locale", () => {
    language.current = "de-DE";
    expect(formatAppDate(value)).toBe(
      new Intl.DateTimeFormat("de-DE", { dateStyle: "medium" }).format(
        new Date(value),
      ),
    );

    language.current = "ja-JP";
    expect(formatAppDate(value)).toBe(
      new Intl.DateTimeFormat("ja-JP", { dateStyle: "medium" }).format(
        new Date(value),
      ),
    );
  });

  it("should include the time when asked", () => {
    language.current = "en-US";
    expect(formatAppDateTime(value)).toBe(
      new Intl.DateTimeFormat("en-US", {
        dateStyle: "medium",
        timeStyle: "medium",
      }).format(new Date(value)),
    );
  });

  it("should accept epoch milliseconds and Date values", () => {
    language.current = "en-US";
    const date = new Date(value);
    expect(formatAppDate(date.getTime())).toBe(formatAppDate(date));
  });

  it("should return null for a missing or invalid date", () => {
    expect(formatAppDate(undefined)).toBeNull();
    expect(formatAppDate(null)).toBeNull();
    expect(formatAppDate("")).toBeNull();
    expect(formatAppDate("not a date")).toBeNull();
  });

  it("should fall back to the device locale for an unsupported language tag", () => {
    language.current = "not_a_locale!";
    expect(formatAppDate(value)).toBe(
      new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(
        new Date(value),
      ),
    );
  });
});
