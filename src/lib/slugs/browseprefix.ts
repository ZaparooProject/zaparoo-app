/**
 * Detects list-numbering and date prefixes on filenames in a directory, so
 * titles drop them only when the directory as a whole is numbered. Ported
 * from go-slugs browseprefix/prefix.go.
 */
import { isSpace, trimSpace, utf8Len } from "./goStrings";

export const KindNone = "";
export const KindRank = "rank";
export const KindDate = "date";

export type Kind = typeof KindNone | typeof KindRank | typeof KindDate;

export const DefaultThreshold = 0.5;
export const DefaultMinFiles = 5;
/**
 * DefaultSampleLimit bounds how many paths are read to detect a directory's
 * prefix policy. The policy is a fraction-vs-threshold heuristic, so a sample
 * of this size estimates the ratio reliably without scanning directories that
 * can hold ~1M files on large libraries.
 */
export const DefaultSampleLimit = 2000;

export interface Prefix {
  kind: Kind;
  rest: string;
}

export interface Policy {
  kind: Kind;
  enabled: boolean;
}

const noPrefix = (): Prefix => ({ kind: KindNone, rest: "" });
const noPolicy = (): Policy => ({ kind: KindNone, enabled: false });

// Go's filepath.Base with Unix separators.
function filepathBase(path: string): string {
  if (path === "") {
    return ".";
  }
  let end = path.length;
  while (end > 0 && path.charAt(end - 1) === "/") {
    end--;
  }
  path = path.slice(0, end);
  path = path.slice(path.lastIndexOf("/") + 1);
  if (path === "") {
    return "/";
  }
  return path;
}

// Go's filepath.Ext with Unix separators.
function filepathExt(path: string): string {
  for (let i = path.length - 1; i >= 0 && path.charAt(i) !== "/"; i--) {
    if (path.charAt(i) === ".") {
      return path.slice(i);
    }
  }
  return "";
}

/** stemFromPath returns the file name of path without its extension. */
export function stemFromPath(path: string): string {
  let base = filepathBase(path);
  const idx = base.lastIndexOf("/");
  if (idx >= 0) {
    base = base.slice(idx + 1);
  }
  const ext = filepathExt(base);
  if (ext === "") {
    return base;
  }
  return base.endsWith(ext) ? base.slice(0, base.length - ext.length) : base;
}

/** parseStem reports the date or rank prefix on a file stem, if any. */
export function parseStem(stem: string): Prefix {
  const trimmed = trimSpace(stem);
  if (trimmed === "") {
    return noPrefix();
  }
  const prefix = parseDate(trimmed);
  if (prefix.kind !== KindNone) {
    return prefix;
  }
  return parseRank(trimmed);
}

/**
 * detectPolicyForPaths enables stripping for the prefix kind found on more
 * than threshold of the paths, given at least minFiles paths.
 */
export function detectPolicyForPaths(
  paths: string[],
  threshold: number,
  minFiles: number,
): Policy {
  if (paths.length < minFiles) {
    return noPolicy();
  }

  let dateCount = 0;
  let rankCount = 0;
  for (const path of paths) {
    const prefix = parseStem(stemFromPath(path));
    switch (prefix.kind) {
      case KindDate:
        dateCount++;
        break;
      case KindRank:
        rankCount++;
        break;
      case KindNone:
        break;
    }
  }

  const fileCount = paths.length;
  if (dateCount / fileCount > threshold) {
    return { kind: KindDate, enabled: true };
  }
  if (rankCount / fileCount > threshold) {
    return { kind: KindRank, enabled: true };
  }
  return noPolicy();
}

/**
 * stripWithPolicy removes the stem's prefix when it is of the policy's kind,
 * reporting whether it did.
 */
export function stripWithPolicy(
  stem: string,
  policy: Policy,
): [stem: string, stripped: boolean] {
  if (!policy.enabled) {
    return [stem, false];
  }
  const prefix = parseStem(stem);
  if (prefix.kind !== policy.kind || prefix.rest === "") {
    return [stem, false];
  }
  return [prefix.rest, true];
}

function parseRank(s: string): Prefix {
  let digitEnd = 0;
  while (digitEnd < s.length && isASCIIDigit(s.charCodeAt(digitEnd))) {
    digitEnd++;
  }
  if (digitEnd === 0 || digitEnd > 3 || digitEnd === s.length) {
    return noPrefix();
  }

  let sepEnd = digitEnd;
  while (sepEnd < s.length) {
    const ch = s.charAt(sepEnd);
    if (
      ch !== "." &&
      ch !== "-" &&
      ch !== ")" &&
      ch !== "_" &&
      !isSpaceByte(ch)
    ) {
      break;
    }
    sepEnd++;
  }
  if (
    sepEnd === digitEnd ||
    sepEnd === s.length ||
    !isListSeparator(s.slice(digitEnd, sepEnd))
  ) {
    return noPrefix();
  }

  const rest = trimSpace(s.slice(sepEnd));
  if (rest === "") {
    return noPrefix();
  }
  return { kind: KindRank, rest };
}

// isListSeparator reports whether sep, what follows a leading number or a
// bare leading year, marks list numbering ("001 - Sonic", "42. Contra",
// "7) Zelda", "1991 - Sonic") rather than being part of the title. A bare
// space or a hyphen with no space beside it is a title's own: "720 Degrees",
// "10-Yard Fight" and "3-D WorldRunner" lost their numbers to a folder that
// was mostly such titles.
function isListSeparator(sep: string): boolean {
  if (sep.includes(".") || sep.includes(")")) {
    return true;
  }
  if (!sep.includes("-")) {
    return false;
  }
  for (let i = 0; i < sep.length; i++) {
    if (isSpace(sep.charCodeAt(i))) {
      return true;
    }
  }
  return false;
}

function parseDate(s: string): Prefix {
  // Go measures the length in UTF-8 bytes.
  if (utf8Len(s) < 6 || !allDigits(s.slice(0, 4))) {
    return noPrefix();
  }
  const year = Number(s.slice(0, 4));
  if (year < 1900 || year > 2099) {
    return noPrefix();
  }

  // Comparing against the UTF-16 length is safe below: a shorter string
  // than Go's byte view only drops non-ASCII text, which fails allDigits in
  // Go as well.
  let pos = 4;
  if (
    pos < s.length &&
    isDatePartSeparator(s.charAt(pos)) &&
    pos + 3 <= s.length &&
    allDigits(s.slice(pos + 1, pos + 3))
  ) {
    const month = Number(s.slice(pos + 1, pos + 3));
    if (month < 1 || month > 12) {
      return noPrefix();
    }
    pos += 3;
    if (
      pos < s.length &&
      isDatePartSeparator(s.charAt(pos)) &&
      pos + 3 <= s.length &&
      allDigits(s.slice(pos + 1, pos + 3))
    ) {
      const day = Number(s.slice(pos + 1, pos + 3));
      if (day < 1 || day > daysInMonth(year, month)) {
        return noPrefix();
      }
      pos += 3;
    }
  }

  // Go tests the single byte here, so a non-ASCII character never counts.
  if (pos >= s.length || !isSeparatorByte(s.charCodeAt(pos))) {
    return noPrefix();
  }
  let restStart = pos;
  while (restStart < s.length && isSeparatorRune(s.charCodeAt(restStart))) {
    restStart++;
  }
  // A year alone is often the title's own ("1943 The Battle of Midway",
  // "2020 Super Baseball"), so it is a date prefix only when set off the
  // way a list number is. A month or day already marks a date.
  if (pos === 4 && !isListSeparator(s.slice(pos, restStart))) {
    return noPrefix();
  }
  const rest = trimSpace(s.slice(restStart));
  if (rest === "") {
    return noPrefix();
  }
  return { kind: KindDate, rest };
}

function allDigits(s: string): boolean {
  if (s === "") {
    return false;
  }
  for (let i = 0; i < s.length; i++) {
    if (!isASCIIDigit(s.charCodeAt(i))) {
      return false;
    }
  }
  return true;
}

function isASCIIDigit(ch: number): boolean {
  return ch >= 0x30 && ch <= 0x39;
}

function isSpaceByte(ch: string): boolean {
  return ch === " " || ch === "\t" || ch === "\n" || ch === "\r";
}

function isDatePartSeparator(ch: string): boolean {
  return ch === "-" || ch === "." || ch === "_";
}

function isSeparatorByte(ch: number): boolean {
  return ch < 0x80 && isSeparatorRune(ch);
}

// Every unicode.IsSpace code point is in the BMP, so testing UTF-16 code
// units matches Go's rune test.
function isSeparatorRune(r: number): boolean {
  return r === 0x2d || r === 0x2e || r === 0x5f || r === 0x29 || isSpace(r);
}

function daysInMonth(year: number, month: number): number {
  switch (month) {
    case 4:
    case 6:
    case 9:
    case 11:
      return 30;
    case 2:
      if (year % 400 === 0 || (year % 4 === 0 && year % 100 !== 0)) {
        return 29;
      }
      return 28;
    default:
      return 31;
  }
}
