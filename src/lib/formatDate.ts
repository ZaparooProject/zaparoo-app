import i18next from "i18next";

type DateInput = string | number | Date | null | undefined;

function appLanguage(): string | undefined {
  return i18next.resolvedLanguage ?? i18next.language ?? undefined;
}

function toValidDate(value: DateInput): Date | null {
  if (value === null || value === undefined || value === "") return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function format(
  value: DateInput,
  options: Intl.DateTimeFormatOptions,
): string | null {
  const date = toValidDate(value);
  if (!date) return null;
  try {
    return new Intl.DateTimeFormat(appLanguage(), options).format(date);
  } catch {
    // An unsupported language tag falls back to the device locale.
    return new Intl.DateTimeFormat(undefined, options).format(date);
  }
}

/** A calendar date in the app language, or null when the value is not a date. */
export function formatAppDate(value: DateInput): string | null {
  return format(value, { dateStyle: "medium" });
}

/** A date and time in the app language, or null when the value is not a date. */
export function formatAppDateTime(value: DateInput): string | null {
  return format(value, { dateStyle: "medium", timeStyle: "medium" });
}
