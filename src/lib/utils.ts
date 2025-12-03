import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Parse Go duration format string to hours and minutes
 * Examples: "4h" => {hours: 4, minutes: 0}, "1h30m" => {hours: 1, minutes: 30}, "45m" => {hours: 0, minutes: 45}
 * Also handles decimals: "39.945s" => {hours: 0, minutes: 1}, "2h0m48.945s" => {hours: 2, minutes: 1}
 */
export function parseDuration(duration: string): {
  hours: number;
  minutes: number;
} {
  if (!duration || duration === "0") {
    return { hours: 0, minutes: 0 };
  }

  let totalSeconds = 0;

  // Match hours (e.g., "4h", "2h")
  const hoursMatch = duration.match(/([\d.]+)h/);
  if (hoursMatch?.[1]) {
    totalSeconds += parseFloat(hoursMatch[1]) * 3600;
  }

  // Match minutes (e.g., "30m", "0m")
  const minutesMatch = duration.match(/([\d.]+)m/);
  if (minutesMatch?.[1]) {
    totalSeconds += parseFloat(minutesMatch[1]) * 60;
  }

  // Match seconds (e.g., "48.945s", "39s")
  const secondsMatch = duration.match(/([\d.]+)s/);
  if (secondsMatch?.[1]) {
    totalSeconds += parseFloat(secondsMatch[1]);
  }

  const totalMinutes = Math.ceil(totalSeconds / 60);

  return {
    hours: Math.floor(totalMinutes / 60),
    minutes: totalMinutes % 60,
  };
}

/**
 * Format hours and minutes to Go duration string
 * Examples: {hours: 4, minutes: 0} => "4h", {hours: 1, minutes: 30} => "1h30m", {hours: 0, minutes: 45} => "45m"
 */
export function formatDuration({
  hours,
  minutes,
}: {
  hours: number;
  minutes: number;
}): string {
  if (hours === 0 && minutes === 0) {
    return "0";
  }

  const parts: string[] = [];

  if (hours > 0) {
    parts.push(`${hours}h`);
  }

  if (minutes > 0) {
    parts.push(`${minutes}m`);
  }

  return parts.join("");
}

/**
 * Format Go duration string for human-readable display
 * Examples: "4h" => "4h", "1h30m" => "1h 30m", "45m" => "45m", "90s" => "2m"
 * Returns "-" for undefined/null values to indicate unavailable data
 */
export function formatDurationDisplay(
  duration: string | undefined | null,
): string {
  if (duration === undefined || duration === null) {
    return "-";
  }

  if (duration === "0" || duration === "0s" || duration === "") {
    return "0m";
  }

  const { hours, minutes } = parseDuration(duration);
  const parts: string[] = [];

  if (hours > 0) {
    parts.push(`${hours}h`);
  }

  if (minutes > 0) {
    parts.push(`${minutes}m`);
  }

  return parts.length > 0 ? parts.join(" ") : "0m";
}

/** Translation function type for formatDurationAccessible */
type TranslateFn = (key: string, options?: { count: number }) => string;

/**
 * Format Go duration string for screen reader accessibility
 * Uses full words instead of abbreviations to avoid TalkBack misreading "5m" as "5 metres"
 * Examples: "4h" => "4 hours", "1h30m" => "1 hour 30 minutes", "45m" => "45 minutes"
 * @param duration - Go duration string (e.g., "1h30m", "45m", "2h")
 * @param t - Translation function from useTranslation hook
 */
export function formatDurationAccessible(
  duration: string | undefined | null,
  t: TranslateFn,
): string {
  if (duration === undefined || duration === null) {
    return "";
  }

  if (duration === "0" || duration === "0s" || duration === "") {
    return t("duration.minutes", { count: 0 });
  }

  const { hours, minutes } = parseDuration(duration);
  const parts: string[] = [];

  if (hours > 0) {
    parts.push(t("duration.hours", { count: hours }));
  }

  if (minutes > 0) {
    parts.push(t("duration.minutes", { count: minutes }));
  }

  return parts.length > 0
    ? parts.join(" ")
    : t("duration.minutes", { count: 0 });
}
