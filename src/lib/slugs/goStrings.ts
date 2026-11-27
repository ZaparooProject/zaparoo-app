/**
 * Go standard library string and unicode semantics the slug port depends on.
 *
 * JavaScript's built-ins differ from Go's in small ways that change slugs:
 * `String.prototype.trim` and `\s` use a different whitespace set,
 * `toLowerCase` applies final-sigma and full (length-changing) mappings, and
 * string lengths count UTF-16 code units instead of UTF-8 bytes. These helpers
 * reproduce Go's behavior so the ported code can stay line-for-line with Go.
 */

/** Go's unicode.IsSpace. Every member is in the BMP. */
export function isSpace(c: number): boolean {
  switch (c) {
    case 0x09:
    case 0x0a:
    case 0x0b:
    case 0x0c:
    case 0x0d:
    case 0x20:
    case 0x85:
    case 0xa0:
    case 0x1680:
    case 0x2028:
    case 0x2029:
    case 0x202f:
    case 0x205f:
    case 0x3000:
      return true;
    default:
      return c >= 0x2000 && c <= 0x200a;
  }
}

/** Go's strings.TrimSpace. */
export function trimSpace(s: string): string {
  let start = 0;
  let end = s.length;
  while (start < end && isSpace(s.charCodeAt(start))) start++;
  while (end > start && isSpace(s.charCodeAt(end - 1))) end--;
  return start === 0 && end === s.length ? s : s.slice(start, end);
}

/** Go's strings.Fields: splits around runs of unicode.IsSpace. */
export function fields(s: string): string[] {
  const out: string[] = [];
  let start = -1;
  for (let i = 0; i < s.length; i++) {
    if (isSpace(s.charCodeAt(i))) {
      if (start >= 0) {
        out.push(s.slice(start, i));
        start = -1;
      }
    } else if (start < 0) {
      start = i;
    }
  }
  if (start >= 0) out.push(s.slice(start));
  return out;
}

// Every cutset in the port is ASCII, so code-unit membership equals Go's
// rune membership.

/** Go's strings.Trim with an ASCII cutset. */
export function trim(s: string, cutset: string): string {
  return trimLeft(trimRight(s, cutset), cutset);
}

/** Go's strings.TrimLeft with an ASCII cutset. */
export function trimLeft(s: string, cutset: string): string {
  let start = 0;
  while (start < s.length && cutset.includes(s.charAt(start))) start++;
  return s.slice(start);
}

/** Go's strings.TrimRight with an ASCII cutset. */
export function trimRight(s: string, cutset: string): string {
  let end = s.length;
  while (end > 0 && cutset.includes(s.charAt(end - 1))) end--;
  return s.slice(0, end);
}

/** Go's strings.ContainsAny with an ASCII char set. */
export function containsAny(s: string, chars: string): boolean {
  for (let i = 0; i < chars.length; i++) {
    if (s.includes(chars.charAt(i))) return true;
  }
  return false;
}

/** Go's unicode.ToLower for one code point, returned as a string. */
export function toLowerRune(cp: number): string {
  // U+0130 is the only code point whose full lowercase mapping (used by
  // toLowerCase) differs from its simple mapping (used by Go).
  if (cp === 0x130) return "i";
  return String.fromCodePoint(cp).toLowerCase();
}

/** Go's unicode.ToUpper for one code point, returned as a string. */
export function toUpperRune(cp: number): string {
  const ch = String.fromCodePoint(cp);
  const upper = ch.toUpperCase();
  // A full uppercase mapping that expands ("ß" → "SS") has no simple mapping
  // to a single different code point that this port compares against, so
  // keeping the rune unchanged matches Go for every comparison made here.
  return [...upper].length === 1 ? upper : ch;
}

// Strings containing these need per-rune lowercasing: capital sigma would get
// the context-dependent final form and U+0130 a combining dot.
const lowerContextChars = /[Σİ]/;

/** Go's strings.ToLower: per-rune simple lowercase mapping. */
export function toLower(s: string): string {
  if (!lowerContextChars.test(s)) return s.toLowerCase();
  let out = "";
  for (const ch of s) out += toLowerRune(ch.codePointAt(0)!);
  return out;
}

/** len(s) in Go: the UTF-8 byte length. */
export function utf8Len(s: string): number {
  let n = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < 0x80) n += 1;
    else if (c < 0x800) n += 2;
    else if (c >= 0xd800 && c <= 0xdbff) {
      // A surrogate pair is one 4-byte rune.
      n += 4;
      i++;
    } else n += 3;
  }
  return n;
}

const letterOrNumber = /[\p{L}\p{N}]/u;

/** Go's unicode.IsLetter(r) || unicode.IsNumber(r) for one code point. */
export function isLetterOrNumberRune(ch: string): boolean {
  return letterOrNumber.test(ch);
}

/**
 * Go's fmt.Sscanf(s, "%d", &n) followed by printing n with %0{width}d, for a
 * run of ASCII digits. A value that overflows int64 fails to scan and leaves
 * n at 0. Done on strings because Number loses precision past 2^53.
 */
export function formatScannedInt(digits: string, width: number): string {
  let n = digits.replace(/^0+/, "");
  if (n === "") n = "0";
  const maxInt64 = "9223372036854775807";
  if (
    n.length > maxInt64.length ||
    (n.length === maxInt64.length && n > maxInt64)
  ) {
    n = "0";
  }
  return n.padStart(width, "0");
}
