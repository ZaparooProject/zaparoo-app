import { describe, it, expect, vi } from "vitest";
import {
  parseDuration,
  formatDuration,
  formatDurationDisplay,
  formatDurationAccessible,
} from "@/lib/utils";

describe("parseDuration", () => {
  it("returns zero for empty or zero input", () => {
    expect(parseDuration("")).toEqual({ hours: 0, minutes: 0 });
    expect(parseDuration("0")).toEqual({ hours: 0, minutes: 0 });
  });

  it("parses hours only", () => {
    expect(parseDuration("4h")).toEqual({ hours: 4, minutes: 0 });
    expect(parseDuration("1h")).toEqual({ hours: 1, minutes: 0 });
  });

  it("parses minutes only", () => {
    expect(parseDuration("30m")).toEqual({ hours: 0, minutes: 30 });
    expect(parseDuration("45m")).toEqual({ hours: 0, minutes: 45 });
  });

  it("parses hours and minutes", () => {
    expect(parseDuration("1h30m")).toEqual({ hours: 1, minutes: 30 });
    expect(parseDuration("2h45m")).toEqual({ hours: 2, minutes: 45 });
  });

  it("rounds up seconds to minutes", () => {
    expect(parseDuration("90s")).toEqual({ hours: 0, minutes: 2 });
    expect(parseDuration("39.945s")).toEqual({ hours: 0, minutes: 1 });
  });

  it("handles complex durations with seconds", () => {
    expect(parseDuration("2h0m48.945s")).toEqual({ hours: 2, minutes: 1 });
  });
});

describe("formatDuration", () => {
  it("returns 0 for zero values", () => {
    expect(formatDuration({ hours: 0, minutes: 0 })).toBe("0");
  });

  it("formats hours only", () => {
    expect(formatDuration({ hours: 4, minutes: 0 })).toBe("4h");
  });

  it("formats minutes only", () => {
    expect(formatDuration({ hours: 0, minutes: 45 })).toBe("45m");
  });

  it("formats hours and minutes", () => {
    expect(formatDuration({ hours: 1, minutes: 30 })).toBe("1h30m");
  });
});

describe("formatDurationDisplay", () => {
  it("returns dash for undefined/null", () => {
    expect(formatDurationDisplay(undefined)).toBe("-");
    expect(formatDurationDisplay(null)).toBe("-");
  });

  it("returns 0m for zero values", () => {
    expect(formatDurationDisplay("0")).toBe("0m");
    expect(formatDurationDisplay("0s")).toBe("0m");
    expect(formatDurationDisplay("")).toBe("0m");
  });

  it("formats hours only", () => {
    expect(formatDurationDisplay("4h")).toBe("4h");
  });

  it("formats minutes only", () => {
    expect(formatDurationDisplay("45m")).toBe("45m");
  });

  it("formats hours and minutes with space", () => {
    expect(formatDurationDisplay("1h30m")).toBe("1h 30m");
  });

  it("converts seconds to minutes", () => {
    expect(formatDurationDisplay("90s")).toBe("2m");
  });
});

describe("formatDurationAccessible", () => {
  // Mock translation function that simulates i18next pluralization
  const mockT = vi.fn((key: string, options?: { count: number }) => {
    const count = options?.count ?? 0;
    if (key === "duration.hours") {
      return count === 1 ? `${count} hour` : `${count} hours`;
    }
    if (key === "duration.minutes") {
      return count === 1 ? `${count} minute` : `${count} minutes`;
    }
    return key;
  });

  beforeEach(() => {
    mockT.mockClear();
  });

  it("returns empty string for undefined/null", () => {
    expect(formatDurationAccessible(undefined, mockT)).toBe("");
    expect(formatDurationAccessible(null, mockT)).toBe("");
  });

  it("returns 0 minutes for zero values", () => {
    expect(formatDurationAccessible("0", mockT)).toBe("0 minutes");
    expect(formatDurationAccessible("0s", mockT)).toBe("0 minutes");
    expect(formatDurationAccessible("", mockT)).toBe("0 minutes");
  });

  it("formats singular hour correctly", () => {
    expect(formatDurationAccessible("1h", mockT)).toBe("1 hour");
    expect(mockT).toHaveBeenCalledWith("duration.hours", { count: 1 });
  });

  it("formats plural hours correctly", () => {
    expect(formatDurationAccessible("4h", mockT)).toBe("4 hours");
    expect(mockT).toHaveBeenCalledWith("duration.hours", { count: 4 });
  });

  it("formats singular minute correctly", () => {
    expect(formatDurationAccessible("1m", mockT)).toBe("1 minute");
    expect(mockT).toHaveBeenCalledWith("duration.minutes", { count: 1 });
  });

  it("formats plural minutes correctly", () => {
    expect(formatDurationAccessible("45m", mockT)).toBe("45 minutes");
    expect(mockT).toHaveBeenCalledWith("duration.minutes", { count: 45 });
  });

  it("formats hours and minutes together", () => {
    expect(formatDurationAccessible("1h30m", mockT)).toBe("1 hour 30 minutes");
    expect(mockT).toHaveBeenCalledWith("duration.hours", { count: 1 });
    expect(mockT).toHaveBeenCalledWith("duration.minutes", { count: 30 });
  });

  it("formats 2h45m correctly", () => {
    expect(formatDurationAccessible("2h45m", mockT)).toBe("2 hours 45 minutes");
  });

  it("handles edge case of 2h1m (mixed plural/singular)", () => {
    expect(formatDurationAccessible("2h1m", mockT)).toBe("2 hours 1 minute");
  });

  it("handles edge case of 1h1m (all singular)", () => {
    expect(formatDurationAccessible("1h1m", mockT)).toBe("1 hour 1 minute");
  });

  it("converts seconds to minutes", () => {
    // 90s = 2 minutes (rounded up)
    expect(formatDurationAccessible("90s", mockT)).toBe("2 minutes");
  });
});
