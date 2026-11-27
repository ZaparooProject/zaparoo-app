/**
 * Shared helpers for media-specific parsing. Ported from go-slugs
 * slug_helpers.go.
 */
import { goRegExp } from "./goRegexp";
import {
  containsAny,
  fields,
  toLower,
  toLowerRune,
  toUpperRune,
  trimSpace,
} from "./goStrings";

const trailingArticleRegex = goRegExp(
  String.raw`(?i),\s*the\s*($|[\s:\-\(\[])`,
  true,
);

// Scene release tag patterns for TV shows
export const sceneQualityRegex = goRegExp(
  String.raw`(?i)\b(480p|576p|720p|1080p|2160p|4k|hd|sd|uhd)\b`,
  true,
);
export const sceneSourceRegex = goRegExp(
  String.raw`(?i)\b(bluray|bdrip|brrip|webrip|web-dl|webdl|hdtv|dvdrip|bdremux|remux|hdcam|cam|telesync|ts|tc)\b`,
  true,
);
export const sceneCodecRegex = goRegExp(
  String.raw`(?i)\b(x264|x265|h\.?264|h\.?265|hevc|xvid|avc|vc-1|10bit|8bit)\b`,
  true,
);
export const sceneAudioRegex = goRegExp(
  String.raw`(?i)\b(` +
    String.raw`dts-hd\.?ma\.?[257]\.[01]|dts-hd\.?ma|` + // DTS-HD MA with optional channels
    String.raw`dts-hd\.?hra\.?[257]\.[01]|dts-hd\.?hra|` + // DTS-HD HRA with optional channels
    String.raw`dts-hd|dts-es|dts-x|dts\.?[257]\.[01]|dts|` + // DTS variants
    String.raw`truehd\.?[257]\.[01]|truehd|` + // TrueHD with optional channels
    String.raw`ddp?[257]\.[01]|dd\+?|ddp|` + // Dolby Digital Plus (DDP5.1, DD5.1, DD+)
    String.raw`aac[257]\.[01]|aac|ac3|` + // AAC with optional channels (AAC2.0)
    String.raw`flac|pcm|lpcm|` +
    String.raw`atmos|ma|hra|es|` + // Audio descriptors
    String.raw`[257]\.[01]|5\.1|7\.1|2\.0)\b`, // Standalone channel configs
  true,
);
const sceneTagsRegex = goRegExp(
  String.raw`(?i)\b(proper|repack|internal|limited|extended|unrated|directors?\.?cut|remastered|multi|korsub)\b`,
  true,
);
// Scene group regex: matches trailing groups like "-GROUP", "-RELEASE", etc.
// Requires at least 2 consecutive letters (case-insensitive) to avoid matching:
//   - Dates like "-15" (starts with digit)
//   - Episode markers like "-S01E02" or "-E001" (second char is digit)
export const sceneGroupRegex = goRegExp(
  String.raw`-(?i)[A-Z]{2}[A-Z0-9]*$`,
  true,
);

const episodeDotRegex = goRegExp(String.raw`(?i)(S\d+)(\.)(E\d+)`, true);
const dateDotRegex = goRegExp(
  String.raw`(\d{2,4})(\.(\d{2})\.(\d{2,4}))`,
  true,
);

// Movie-specific scene release tag patterns
// HDR tags: HDR, HDR10, HDR10+, Dolby Vision, HLG
export const sceneHDRRegex = goRegExp(
  String.raw`(?i)\b(hdr|hdr10|hdr10plus|hdr10\+|dv|dolby\.?vision|hlg)\b`,
  true,
);
// 3D tags: 3D, HSBS (Half Side-by-Side), HOU (Half Over-Under), SBS, OU
export const scene3DRegex = goRegExp(
  String.raw`(?i)\b(3d|hsbs|hou|half-sbs|half-ou|sbs|ou)\b`,
  true,
);

// Matches 2+ consecutive single-letter-plus-period sequences at a word
// boundary. Targets dotted initialisms like "T.V.", "U.S.A.", "M.A.S.K." while
// leaving multi-letter abbreviations like "Bros." and "Dr." untouched.
const dottedInitialismRegex = goRegExp(String.raw`\b(?:[A-Za-z]\.){2,}`, true);

const periodRequiredAbbreviations = new Map<string, string>([
  ["feat.", "featuring"], // "feat" alone is a real word (achievement)
  ["no.", "number"], // "no" alone is a word
  ["st.", "saint"], // "st" usually means "street"
]);

const withOrWithoutPeriodAbbreviations = new Map<string, string>([
  ["vs", "versus"], // Strong evidence: fighting games, crossovers
  ["bros", "brothers"], // Strong evidence: Super Mario Bros/Brothers
  ["dr", "doctor"], // Moderate evidence: Dr. Mario / Doctor Mario
  ["mr", "mister"], // Similar pattern to dr
  ["vol", "volume"], // Serialized content: Vol. 2 / Volume 2
  ["pt", "part"], // Episodic titles: Pt. 2 / Part 2
  ["ft", "featuring"], // Music: ft. Artist / featuring Artist
  ["jr", "junior"], // Common in game titles: Donkey Kong Jr. / Junior
  ["sr", "senior"], // Less common but follows same pattern as jr
]);

// X is intentionally omitted to avoid conversions like "Mega Man X" →
// "Mega Man 10".
const romanNumeralReplacementTable: { pattern: string; replacement: string }[] =
  [
    { pattern: "XIX", replacement: "19" },
    { pattern: "XVIII", replacement: "18" },
    { pattern: "XVII", replacement: "17" },
    { pattern: "XVI", replacement: "16" },
    { pattern: "XIV", replacement: "14" },
    { pattern: "XV", replacement: "15" },
    { pattern: "XIII", replacement: "13" },
    { pattern: "XII", replacement: "12" },
    { pattern: "XI", replacement: "11" },
    { pattern: "IX", replacement: "9" },
    { pattern: "VIII", replacement: "8" },
    { pattern: "VII", replacement: "7" },
    { pattern: "VI", replacement: "6" },
    { pattern: "IV", replacement: "4" },
    { pattern: "V", replacement: "5" },
    { pattern: "III", replacement: "3" },
    { pattern: "II", replacement: "2" },
    { pattern: "I", replacement: "1" },
  ];

// Number words (1-20)
const numberWords = new Map<string, string>([
  ["one", "1"],
  ["two", "2"],
  ["three", "3"],
  ["four", "4"],
  ["five", "5"],
  ["six", "6"],
  ["seven", "7"],
  ["eight", "8"],
  ["nine", "9"],
  ["ten", "10"],
  ["eleven", "11"],
  ["twelve", "12"],
  ["thirteen", "13"],
  ["fourteen", "14"],
  ["fifteen", "15"],
  ["sixteen", "16"],
  ["seventeen", "17"],
  ["eighteen", "18"],
  ["nineteen", "19"],
  ["twenty", "20"],
]);

/**
 * stripMetadataBrackets removes all bracket types (parentheses, square
 * brackets, braces, angle brackets) and their contents, tracking nesting
 * depth per bracket type.
 *
 * Examples:
 *   - "Game (USA) [!]" → "Game"
 *   - "Title {Europe} <Beta>" → "Title"
 *   - "Game ((nested)) [test]" → "Game"
 */
export function stripMetadataBrackets(s: string): string {
  let result = "";
  let parenDepth = 0;
  let bracketDepth = 0;
  let braceDepth = 0;
  let angleDepth = 0;

  // Brackets are ASCII, so walking code units keeps surrogate pairs intact.
  for (let i = 0; i < s.length; i++) {
    const r = s.charAt(i);
    switch (r) {
      case "(":
        parenDepth++;
        break;
      case ")":
        if (parenDepth > 0) parenDepth--;
        break;
      case "[":
        bracketDepth++;
        break;
      case "]":
        if (bracketDepth > 0) bracketDepth--;
        break;
      case "{":
        braceDepth++;
        break;
      case "}":
        if (braceDepth > 0) braceDepth--;
        break;
      case "<":
        angleDepth++;
        break;
      case ">":
        if (angleDepth > 0) angleDepth--;
        break;
      default:
        if (
          parenDepth === 0 &&
          bracketDepth === 0 &&
          braceDepth === 0 &&
          angleDepth === 0
        ) {
          result += r;
        }
    }
  }

  return trimSpace(result);
}

/**
 * stripEditionAndVersionSuffixes removes edition/version words and version
 * numbers from titles. Does NOT strip semantic edition markers like
 * "Special", "Ultimate", "Remastered": these represent different products and
 * users may want to target them specifically.
 *
 * Examples:
 *   - "Pokemon Red Version" → "Pokemon Red"
 *   - "ドラゴンクエストバージョン" → "ドラゴンクエスト" (CJK)
 *   - "Game Special Edition" → "Game Special"
 */
export function stripEditionAndVersionSuffixes(s: string): string {
  s = stripEditionSuffixWord(s);
  s = trimSpace(s);

  // Strip version numbers (v1.0, v2.3, vII, etc.)
  s = stripVersionSuffix(s);
  s = trimSpace(s);

  return s;
}

// editionSuffixWords are trailing words removed by stripEditionSuffixWord.
// All entries are lowercase; Latin words match ASCII case-insensitively,
// katakana words exactly. No entry is a suffix of another, so at most one can
// match a given string ending.
const editionSuffixWords = [
  "version",
  "edition",
  "ausgabe",
  "versione",
  "edizione",
  "versao",
  "edicao",
  "\u30d0\u30fc\u30b8\u30e7\u30f3", // バージョン
  "\u30a8\u30c7\u30a3\u30b7\u30e7\u30f3", // エディション
  "\u30f4\u30a1\u30fc\u30b8\u30e7\u30f3", // ヴァージョン
];

// stripEditionSuffixWord removes a trailing edition/version word preceded by
// whitespace. Trailing whitespace left behind is handled by the caller's
// trimSpace, matching the regex's greedy `\s+` removal.
// Replaces: `(?i)\s+(version|edition|ausgabe|versione|edizione|versao|edicao|バージョン|エディション|ヴァージョン)$`
// Go compares bytes; comparing UTF-16 code units gives the same result
// because a suffix match of a whole word is a match on code point boundaries.
function stripEditionSuffixWord(s: string): string {
  for (const w of editionSuffixWords) {
    if (s.length < w.length + 1) {
      continue;
    }
    const wordStart = s.length - w.length;
    if (!foldedSuffixMatch(s, wordStart, w)) {
      continue;
    }
    if (!isSpaceByteClass(s.charCodeAt(wordStart - 1))) {
      continue;
    }
    return s.slice(0, wordStart - 1);
  }
  return s;
}

// foldedSuffixMatch reports whether s[i:] equals w, comparing ASCII letters
// case-insensitively and everything else exactly.
function foldedSuffixMatch(s: string, i: number, w: string): boolean {
  for (let j = 0; j < w.length; j++) {
    const a = s.charCodeAt(i + j);
    const b = w.charCodeAt(j);
    if (a === b) {
      continue;
    }
    if (a >= 0x41 && a <= 0x5a && a + 0x20 === b) {
      continue;
    }
    return false;
  }
  return true;
}

// stripVersionSuffix removes a trailing version token: lowercase 'v' with an
// optional period, followed by dotted digit groups (v1, v1.0, v2.3.1) or an
// uppercase Roman numeral run (vII, vIX).
// Replaces: `\s+v[.]?(?:\d{1,3}(?:[.]\d{1,4})*|[IVX]{1,5})$`
function stripVersionSuffix(s: string): string {
  let tokenStart = s.length;
  while (tokenStart > 0 && !isSpaceByteClass(s.charCodeAt(tokenStart - 1))) {
    tokenStart--;
  }
  // No preceding whitespace, or empty trailing token
  if (tokenStart === 0 || tokenStart === s.length) {
    return s;
  }
  const token = s.slice(tokenStart);
  if (token.charAt(0) !== "v") {
    return s;
  }
  let rest = token.slice(1);
  if (rest !== "" && rest.charAt(0) === ".") {
    rest = rest.slice(1);
  }
  if (isVersionDigits(rest) || isRomanIVXRun(rest)) {
    return s.slice(0, tokenStart - 1);
  }
  return s;
}

// isVersionDigits matches `\d{1,3}(?:[.]\d{1,4})*` anchored to the whole
// string.
function isVersionDigits(s: string): boolean {
  if (s === "") {
    return false;
  }
  let maxLen = 3; // first group is 1-3 digits, subsequent groups 1-4
  let digits = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charAt(i);
    if (c >= "0" && c <= "9") {
      digits++;
      if (digits > maxLen) {
        return false;
      }
    } else if (c === ".") {
      if (digits === 0) {
        return false;
      }
      digits = 0;
      maxLen = 4;
    } else {
      return false;
    }
  }
  return digits > 0;
}

// isRomanIVXRun matches `[IVX]{1,5}` anchored to the whole string.
function isRomanIVXRun(s: string): boolean {
  if (s === "" || s.length > 5) {
    return false;
  }
  for (let i = 0; i < s.length; i++) {
    const c = s.charAt(i);
    if (c !== "I" && c !== "V" && c !== "X") {
      return false;
    }
  }
  return true;
}

// isSpaceByteClass matches the regexp `\s` character class ([\t\n\f\r ]).
function isSpaceByteClass(b: number): boolean {
  return b === 0x20 || b === 0x09 || b === 0x0a || b === 0x0c || b === 0x0d;
}

// isWordByte matches the regexp `\w` character class ([0-9A-Za-z_]) used for
// `\b` word-boundary checks.
function isWordByte(b: number): boolean {
  return (
    (b >= 0x30 && b <= 0x39) ||
    (b >= 0x41 && b <= 0x5a) ||
    (b >= 0x61 && b <= 0x7a) ||
    b === 0x5f
  );
}

/**
 * collapseDottedInitialisms removes internal periods from dotted
 * single-letter initialisms so that later period-to-space conversion does not
 * split them into standalone letters. This prevents the Roman numeral pass
 * from converting letters like "V" in "T.V." to digits.
 *
 * Examples:
 *   - "T.V." → "TV"
 *   - "M.A.S.K." → "MASK"
 *   - "Dr. Mario" → "Dr. Mario"
 */
export function collapseDottedInitialisms(s: string): string {
  if (!s.includes(".")) {
    return s;
  }
  return s.replace(dottedInitialismRegex, (m) => m.split(".").join(""));
}

// checkAbbreviation checks if a lowercase word matches a known abbreviation.
function checkAbbreviation(lowerWord: string): string | undefined {
  // Period-required abbreviations are checked before stripping the period
  const required = periodRequiredAbbreviations.get(lowerWord);
  if (required !== undefined) {
    return required;
  }

  if (lowerWord.endsWith(".")) {
    lowerWord = lowerWord.slice(0, -1);
  }
  return withOrWithoutPeriodAbbreviations.get(lowerWord);
}

// checkNumberWord checks if a lowercase word matches a known number word.
function checkNumberWord(lowerWord: string): string | undefined {
  const expansion = numberWords.get(lowerWord);
  if (expansion !== undefined) {
    return expansion;
  }

  // Strip period and check again (e.g., "two." → "2")
  if (lowerWord.endsWith(".")) {
    lowerWord = lowerWord.slice(0, -1);
  }
  return numberWords.get(lowerWord);
}

/**
 * expandAbbreviationsAndNumbers expands abbreviations ("Bros." → "brothers")
 * and number words ("two" → "2") in a single pass over the words.
 */
export function expandAbbreviationsAndNumbers(s: string): string {
  const words = fields(s);
  let changed = false;
  for (let i = 0; i < words.length; i++) {
    const lowerWord = toLower(words[i]!);
    const expansion =
      checkAbbreviation(lowerWord) ?? checkNumberWord(lowerWord);
    if (expansion !== undefined) {
      words[i] = expansion;
      changed = true;
    }
  }
  if (!changed) {
    return s;
  }
  return words.join(" ");
}

/**
 * normalizeOrdinals removes ordinal suffixes from numbers, so "2nd" and "II"
 * both normalize to "2". Also splits camelCase compounds where the suffix runs
 * into the next word ("2ndMix" → "2 Mix"), so IGDB-style "2ndMix" matches
 * LaunchBox-style "2nd MIX".
 *
 * Replaces: `\b(\d+(?:st|nd|rd|th))([A-Z])` ("$1 $2")
 * followed by: `\b(\d+)(?:st|nd|rd|th)\b` ("$1")
 */
export function normalizeOrdinals(s: string): string {
  if (!containsAny(s, "0123456789")) {
    return s;
  }

  let b = "";
  let changed = false;
  let i = 0;
  while (i < s.length) {
    const c = s.charCodeAt(i);
    // Digit run must start at a word boundary
    if (c < 0x30 || c > 0x39 || (i > 0 && isWordByte(s.charCodeAt(i - 1)))) {
      b += s.charAt(i);
      i++;
      continue;
    }
    let digitsEnd = i;
    while (
      digitsEnd < s.length &&
      s.charCodeAt(digitsEnd) >= 0x30 &&
      s.charCodeAt(digitsEnd) <= 0x39
    ) {
      digitsEnd++;
    }
    const suffixEnd = digitsEnd + 2;
    if (
      suffixEnd <= s.length &&
      isOrdinalSuffix(s.slice(digitsEnd, suffixEnd))
    ) {
      if (suffixEnd === s.length || !isWordByte(s.charCodeAt(suffixEnd))) {
        // "2nd Mix" / "21st" → drop the suffix
        b += s.slice(i, digitsEnd);
        changed = true;
        i = suffixEnd;
        continue;
      }
      const next = s.charCodeAt(suffixEnd);
      if (next >= 0x41 && next <= 0x5a) {
        // camelCase compound "2ndMix" → "2 Mix"
        b += s.slice(i, digitsEnd) + " ";
        changed = true;
        i = suffixEnd;
        continue;
      }
    }
    b += s.slice(i, digitsEnd);
    i = digitsEnd;
  }
  if (!changed) {
    return s;
  }
  return b;
}

// isOrdinalSuffix reports whether the two-character string is a lowercase
// English ordinal suffix (st, nd, rd, th).
function isOrdinalSuffix(s: string): boolean {
  return s === "st" || s === "nd" || s === "rd" || s === "th";
}

const latinScript = /\p{Script=Latin}/u;

/**
 * convertRomanNumerals converts Roman numerals (II-XIX) to Arabic numbers and
 * lowercases the string. X is intentionally NOT converted to avoid
 * "Mega Man X" → "Mega Man 10".
 *
 * Examples:
 *   - "Final Fantasy VII" → "final fantasy 7"
 *   - "Mega Man X" → "mega man x"
 */
export function convertRomanNumerals(s: string): string {
  if (!containsAny(s, "ivxIVX")) {
    return toLower(s);
  }

  let result = "";
  const runeSlice = Array.from(s);

  // Replace roman numerals only at Latin word boundaries.
  // isLatinWordCharForRoman only considers ASCII letters/digits as word chars,
  // allowing Roman numerals to convert even when adjacent to CJK text.
  let i = 0;
  while (i < runeSlice.length) {
    let atWordBoundary = i === 0 || !isLatinWordCharForRoman(runeSlice[i - 1]!);

    // Inside a Latin word with diacritics, don't convert roman numerals.
    // This prevents "Václav" → "5aclav" and "Şişli" → "Ş1şli" while still
    // allowing "ドラゴンクエストVII" → "ドラゴンクエスト7"
    if (
      i > 0 &&
      latinScript.test(runeSlice[i - 1]!) &&
      !isLatinWordCharForRoman(runeSlice[i - 1]!)
    ) {
      atWordBoundary = false;
    }
    // Also check if the NEXT character is a Latin diacritic (as in "Václav")
    const nextCharIsLatinDiacritic =
      i < runeSlice.length - 1 &&
      latinScript.test(runeSlice[i + 1]!) &&
      !isLatinWordCharForRoman(runeSlice[i + 1]!);
    if (nextCharIsLatinDiacritic) {
      atWordBoundary = false;
    }

    if (!atWordBoundary) {
      result += toLowerRune(runeSlice[i]!.codePointAt(0)!);
      i++;
      continue;
    }

    let matched = false;
    for (const num of romanNumeralReplacementTable) {
      if (matchesRomanNumeralPattern(runeSlice, i, num.pattern)) {
        // Single-letter Roman numerals (V, I) at the start of the string are
        // almost always initials ("V. Gabriel") or the pronoun "I", not
        // numbers. Multi-letter patterns remain unambiguous and still convert
        // even at position 0.
        if (i === 0 && num.pattern.length === 1) {
          continue;
        }
        const endIdx = i + num.pattern.length;
        const atEnd =
          endIdx === runeSlice.length ||
          !isLatinWordCharForRoman(runeSlice[endIdx]!);

        if (atEnd) {
          result += num.replacement;
          i += num.pattern.length;
          matched = true;
          break;
        }
      }
    }

    if (!matched) {
      result += toLowerRune(runeSlice[i]!.codePointAt(0)!);
      i++;
    }
  }

  return result;
}

// matchesRomanNumeralPattern compares the runes at pos case-insensitively
// against an uppercase ASCII Roman numeral pattern.
function matchesRomanNumeralPattern(
  runeSlice: string[],
  pos: number,
  pattern: string,
): boolean {
  if (pos + pattern.length > runeSlice.length) {
    return false;
  }
  for (let i = 0; i < pattern.length; i++) {
    if (
      toUpperRune(runeSlice[pos + i]!.codePointAt(0)!) !== pattern.charAt(i)
    ) {
      return false;
    }
  }
  return true;
}

// isLatinWordCharForRoman reports whether a rune is a word character for
// Roman numeral boundary detection: ASCII letters, digits and underscore only,
// so numerals convert even next to non-Latin text.
function isLatinWordCharForRoman(r: string): boolean {
  return r.length === 1 && isWordByte(r.charCodeAt(0));
}

/**
 * stripLeadingArticle removes a leading "The", "A" or "An", preserving the
 * case of the rest.
 */
export function stripLeadingArticle(s: string): string {
  s = trimSpace(s);
  // Only ASCII lowercases to these ASCII prefixes, so slicing the original
  // string at the prefix length is safe.
  const lower = toLower(s);

  if (lower.startsWith("the ")) {
    return trimSpace(s.slice(4));
  }
  if (lower.startsWith("a ")) {
    return trimSpace(s.slice(2));
  }
  if (lower.startsWith("an ")) {
    return trimSpace(s.slice(3));
  }

  return s;
}

/**
 * splitTitle splits a title into main and secondary parts.
 * Delimiter priority (highest to lowest): ":", " - ", "'s ".
 * For "'s " the "'s" is retained in the main title.
 */
export function splitTitle(
  title: string,
): [mainTitle: string, secondaryTitle: string, hasSecondary: boolean] {
  const cleaned = trimSpace(title);

  let idx = cleaned.indexOf(":");
  if (idx !== -1) {
    return [
      trimSpace(cleaned.slice(0, idx)),
      trimSpace(cleaned.slice(idx + 1)),
      true,
    ];
  }
  idx = cleaned.indexOf(" - ");
  if (idx !== -1) {
    return [
      trimSpace(cleaned.slice(0, idx)),
      trimSpace(cleaned.slice(idx + 3)),
      true,
    ];
  }
  idx = cleaned.indexOf("'s ");
  if (idx !== -1) {
    return [
      trimSpace(cleaned.slice(0, idx + 2)),
      trimSpace(cleaned.slice(idx + 3)),
      true,
    ];
  }

  return [cleaned, "", false];
}

/**
 * splitAndStripArticles splits a title into main and secondary parts, then
 * strips leading articles from both.
 *
 * Examples:
 *   - "The Legend of Zelda: Link's Awakening" → "Legend of Zelda Link's Awakening"
 *   - "The Game - A Subtitle" → "Game Subtitle"
 */
export function splitAndStripArticles(s: string): string {
  const [main, secondary, hasSecondary] = splitTitle(s);

  const mainTitle = stripLeadingArticle(main);

  if (hasSecondary) {
    const secondaryTitle = stripLeadingArticle(secondary);
    return trimSpace(mainTitle + " " + secondaryTitle);
  }

  return mainTitle;
}

/**
 * stripTrailingArticle removes trailing articles like ", The".
 *
 * Examples:
 *   - "Legend, The" → "Legend"
 *   - "Story, the:" → "Story:"
 */
export function stripTrailingArticle(s: string): string {
  trailingArticleRegex.lastIndex = 0;
  if (trailingArticleRegex.test(s)) {
    s = s.replace(trailingArticleRegex, "$1");
    return trimSpace(s);
  }
  return s;
}

/**
 * stripSceneTags removes scene release tags (quality, source, codec, audio,
 * misc and a trailing release group) commonly found in TV show filenames.
 *
 * Examples:
 *   - "Breaking.Bad.S01E02.1080p.BluRay.x264-GROUP" → "Breaking.Bad.S01E02."
 *   - "Episode.4K.HDR.Atmos.PROPER" → "Episode..HDR.."
 */
export function stripSceneTags(s: string): string {
  s = trimSpace(s.replace(sceneQualityRegex, ""));
  s = trimSpace(s.replace(sceneSourceRegex, ""));
  s = trimSpace(s.replace(sceneCodecRegex, ""));
  s = trimSpace(s.replace(sceneAudioRegex, ""));
  // Misc tags (PROPER, REPACK, etc.)
  s = trimSpace(s.replace(sceneTagsRegex, ""));
  // Trailing group tag (e.g., "-GROUP" at the end)
  s = trimSpace(s.replace(sceneGroupRegex, ""));
  return s;
}

/**
 * normalizeDotSeparators converts scene-release dot separators to spaces.
 *
 * Preserves dots in dates ("2024.01.15") and episode markers ("S01.E02").
 * Does NOT preserve generic decimals ("5.1" → "5 1"); known scene tags like
 * "DD5.1" and "H.264" are stripped by the scene tag pass before this runs.
 *
 * Examples:
 *   - "Breaking.Bad.S01E02" → "Breaking Bad S01E02"
 *   - "Show.2024.01.15" → "Show 2024.01.15"
 */
export function normalizeDotSeparators(s: string): string {
  if (!s.includes(".")) {
    return s;
  }

  // Private Use Area placeholders never appear in normal text
  const episodeDotPlaceholder = "\ue000";
  const dateDotPlaceholder = "\ue001";

  // Protect episode markers (S01.E02 → S01<U+E000>E02)
  s = s.replace(
    episodeDotRegex,
    (_m, g1: string, _g2: string, g3: string) =>
      g1 + episodeDotPlaceholder + g3,
  );

  // Protect dates (both YYYY.MM.DD and DD.MM.YYYY formats)
  s = s.replace(
    dateDotRegex,
    (_m, g1: string, _g2: string, g3: string, g4: string) =>
      g1 + dateDotPlaceholder + g3 + dateDotPlaceholder + g4,
  );

  s = s.split(".").join(" ");

  s = s.split(episodeDotPlaceholder).join(".");
  s = s.split(dateDotPlaceholder).join(".");

  return trimSpace(s);
}
