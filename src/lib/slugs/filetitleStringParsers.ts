/**
 * Hand-written replacements for simple filename regexes. Ported from go-slugs
 * filetitle/string_parsers.go.
 */
import { fields } from "./goStrings";

export function isDigit(b: number): boolean {
  return b >= 0x30 && b <= 0x39;
}

function isAlphanumeric(b: number): boolean {
  return isDigit(b) || (b >= 0x41 && b <= 0x5a) || (b >= 0x61 && b <= 0x7a);
}

function isWhitespace(b: number): boolean {
  return (
    b === 0x20 ||
    b === 0x09 ||
    b === 0x0a ||
    b === 0x0d ||
    b === 0x0c ||
    b === 0x0b
  );
}

// isWordBoundaryBefore checks for a word boundary between a regexp word char
// and a non-word char (or the start) before position i.
function isWordBoundaryBefore(s: string, i: number): boolean {
  if (i === 0) {
    return true;
  }
  return !isRegexWordByte(s.charCodeAt(i - 1));
}

function isWordBoundaryAfter(s: string, i: number): boolean {
  if (i >= s.length) {
    return true;
  }
  return !isRegexWordByte(s.charCodeAt(i));
}

// isRegexWordByte matches Go regexp's ASCII `\w` class used by `\b`.
function isRegexWordByte(b: number): boolean {
  return isAlphanumeric(b) || b === 0x5f;
}

/**
 * collapseSpaces replaces runs of whitespace with a single space and trims
 * the ends. Callers always trim afterward, so this matches the `\s+` regex it
 * replaces.
 */
export function collapseSpaces(s: string): string {
  return fields(s).join(" ");
}

/**
 * stripLeadingNumberPrefix removes a leading number followed by separators.
 * Replaces: `^\d+[.\s\-]+` with ""
 */
export function stripLeadingNumberPrefix(s: string): string {
  let i = 0;
  while (i < s.length && isDigit(s.charCodeAt(i))) {
    i++;
  }
  if (i === 0) {
    return s;
  }
  let j = i;
  while (
    j < s.length &&
    (s.charAt(j) === "." ||
      s.charAt(j) === "-" ||
      isWhitespace(s.charCodeAt(j)))
  ) {
    j++;
  }
  if (j === i) {
    return s;
  }
  return s.slice(j);
}

// isYearValue checks if a 4-character string is a year in range 1970-2099.
function isYearValue(s: string): boolean {
  if (
    s.length !== 4 ||
    !isDigit(s.charCodeAt(0)) ||
    !isDigit(s.charCodeAt(1)) ||
    !isDigit(s.charCodeAt(2)) ||
    !isDigit(s.charCodeAt(3))
  ) {
    return false;
  }
  if (s.charAt(0) === "1" && s.charAt(1) === "9" && s.charAt(2) >= "7") {
    return true;
  }
  return s.charAt(0) === "2" && s.charAt(1) === "0";
}

/** A string-based pattern match; indices are into the original string. */
export interface ParseMatch {
  start: number;
  end: number;
  cap1s: number;
  cap1e: number;
  ok: boolean;
}

/**
 * removeSeasonEpisode replaces every S##E### pattern with a space.
 * Replaces: reSeasonEpisode.ReplaceAllString(title, " ")
 */
export function removeSeasonEpisode(s: string): string {
  let b = "";
  let i = 0;
  let changed = false;
  while (i < s.length) {
    const c = s.charAt(i);
    // Any match spans at least four ASCII characters, so comparing against the
    // UTF-16 length accepts exactly the matches Go's byte length does.
    if ((c === "S" || c === "s") && i + 3 < s.length) {
      let pos = i + 1;
      const dStart = pos;
      while (pos < s.length && pos - dStart < 2 && isDigit(s.charCodeAt(pos))) {
        pos++;
      }
      if (
        pos > dStart &&
        pos < s.length &&
        (s.charAt(pos) === "E" || s.charAt(pos) === "e")
      ) {
        pos++;
        const eStart = pos;
        while (
          pos < s.length &&
          pos - eStart < 3 &&
          isDigit(s.charCodeAt(pos))
        ) {
          pos++;
        }
        if (pos > eStart) {
          if (!changed) {
            b = s.slice(0, i);
            changed = true;
          }
          b += " ";
          i = pos;
          continue;
        }
      }
    }
    if (changed) {
      b += c;
    }
    i++;
  }
  if (!changed) {
    return s;
  }
  return b;
}

/**
 * findUnbracketedYear finds a year (1970-2099) at word boundaries.
 * Replaces: `\b(19[789]\d|20\d{2})\b`
 */
export function findUnbracketedYear(s: string): ParseMatch {
  for (let i = 0; i <= s.length - 4; i++) {
    if (!isWordBoundaryBefore(s, i)) {
      continue;
    }
    if (!isYearValue(s.slice(i, i + 4))) {
      continue;
    }
    if (!isWordBoundaryAfter(s, i + 4)) {
      continue;
    }
    return { start: i, end: i + 4, cap1s: i, cap1e: i + 4, ok: true };
  }
  return { start: 0, end: 0, cap1s: 0, cap1e: 0, ok: false };
}
