/**
 * Media-type-aware slug generation for cross-platform title matching.
 * Ported from go-slugs slugify.go.
 */
import {
  containsAny,
  fields,
  isLetterOrNumberRune,
  toLower,
  toLowerRune,
  trim,
  trimSpace,
} from "./goStrings";
import { parseWithMediaType } from "./mediaParsing";
import { normalizeByScript } from "./normalization";
import {
  detectScript,
  needsUnicodeSlug,
  ScriptLatin,
  type ScriptType,
} from "./scripts";
import { widthFold } from "./widthFold";

/** Game represents gaming systems (consoles, computers, arcade). */
export const MediaTypeGame = "Game";
/** Movie represents film and movie content. */
export const MediaTypeMovie = "Movie";
/** TVShow represents TV episodes and shows. */
export const MediaTypeTVShow = "TVShow";
/** Music represents music and song content. */
export const MediaTypeMusic = "Music";
/** Image represents image files. */
export const MediaTypeImage = "Image";
/** Audio represents general audio content (audiobooks, podcasts). */
export const MediaTypeAudio = "Audio";
/** Video represents general video content (music videos). */
export const MediaTypeVideo = "Video";
/** Application represents application/software content. */
export const MediaTypeApplication = "Application";

/**
 * MediaType categorizes media content and selects the media-specific parsing
 * applied before slugification.
 */
export type MediaType =
  | typeof MediaTypeGame
  | typeof MediaTypeMovie
  | typeof MediaTypeTVShow
  | typeof MediaTypeMusic
  | typeof MediaTypeImage
  | typeof MediaTypeAudio
  | typeof MediaTypeVideo
  | typeof MediaTypeApplication;

// pipelineContext caches values computed in one normalization stage for
// reuse in later ones.
interface PipelineContext {
  isASCII?: boolean;
  script: ScriptType;
  scriptCached: boolean;
}

// Characters kept in Unicode slugs. Must stay a regex literal so the legacy
// build can transpile the property escapes.
const nonAlphanumKeepUnicodeRegex =
  /[^a-z0-9\p{Script=Latin}\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}ー・々\p{Script=Cyrillic}\p{Script=Greek}\p{Script=Devanagari}\p{Script=Bengali}\p{Script=Tamil}\p{Script=Telugu}\p{Script=Kannada}\p{Script=Malayalam}\p{Script=Gurmukhi}\p{Script=Gujarati}\p{Script=Oriya}\p{Script=Sinhala}\p{Script=Arabic}\p{Script=Hebrew}\p{Script=Thai}\p{Script=Myanmar}\p{Script=Khmer}\p{Script=Lao}\p{Script=Ethiopic}]+/gu;

const unicodeSymbols = /[\p{So}\p{Sc}]/gu;

/**
 * SlugifyResult holds the slug and the tokens produced while generating it,
 * so token-based metadata comes from the exact tokenization behind the slug.
 */
export interface SlugifyResult {
  slug: string;
  tokens: string[];
}

/** isASCII reports whether every character is below U+0080. */
export function isASCII(s: string): boolean {
  for (let i = 0; i < s.length; i++) {
    if (s.charCodeAt(i) >= 0x80) {
      return false;
    }
  }
  return true;
}

// isASCIIAlnum checks if a code unit is an ASCII letter or digit.
function isASCIIAlnum(b: number): boolean {
  return (
    (b >= 0x41 && b <= 0x5a) ||
    (b >= 0x61 && b <= 0x7a) ||
    (b >= 0x30 && b <= 0x39)
  );
}

// isASCIILowerAlnum checks if a code unit is a-z or 0-9.
function isASCIILowerAlnum(b: number): boolean {
  return (b >= 0x61 && b <= 0x7a) || (b >= 0x30 && b <= 0x39);
}

// stripNonAlphanumASCII removes every character that isn't a-z or 0-9,
// avoiding regex overhead for the common already-clean case.
function stripNonAlphanumASCII(s: string): string {
  let needsStrip = false;
  for (let i = 0; i < s.length; i++) {
    if (!isASCIILowerAlnum(s.charCodeAt(i))) {
      needsStrip = true;
      break;
    }
  }
  if (!needsStrip) {
    return s;
  }

  let buf = "";
  for (let i = 0; i < s.length; i++) {
    if (isASCIILowerAlnum(s.charCodeAt(i))) {
      buf += s.charAt(i);
    }
  }
  return buf;
}

/**
 * normalizeWidth converts fullwidth ASCII to halfwidth and halfwidth CJK to
 * fullwidth.
 *
 * Examples:
 *   - "ＡＢＣＤＥＦ" → "ABCDEF"
 *   - "ｳｴｯｼﾞ" → "ウエッジ"
 */
export function normalizeWidth(s: string): string {
  return widthFold(s);
}

/**
 * normalizePunctuation normalizes Unicode quote, dash and ellipsis variants
 * to ASCII. Must run before Unicode normalization and symbol/separator
 * processing so conjunction detection (" 'n' "), dash handling and
 * abbreviation word boundaries see the ASCII forms.
 */
export function normalizePunctuation(s: string): string {
  const pairs: [string, string][] = [
    // Quote and apostrophe variants
    ["‘", "'"], // Left single quotation mark
    ["’", "'"], // Right single quotation mark
    ["“", '"'], // Left double quotation mark
    ["”", '"'], // Right double quotation mark
    ["′", "'"], // Prime (minute mark)
    ["″", '"'], // Double prime (second mark)
    ["`", "'"], // Grave accent (often used as quote)
    ["´", "'"], // Acute accent (often used as apostrophe)
    // Dash variants
    ["–", "-"], // En dash
    ["—", "-"], // Em dash
    ["―", "-"], // Horizontal bar
    ["−", "-"], // Minus sign
    ["‒", "-"], // Figure dash
    // Ellipsis
    ["…", "..."],
  ];
  for (const [from, to] of pairs) {
    s = s.split(from).join(to);
  }
  return s;
}

/**
 * normalizeUnicode removes Unicode symbols (™, ©, currency) and applies
 * script-specific normalization (NFKC and diacritic removal for Latin, NFC
 * for CJK, and so on). Pure ASCII input is returned unchanged.
 *
 * When ctx is given, the ASCII check and detected script are cached in it.
 */
export function normalizeUnicode(s: string, ctx?: PipelineContext): string {
  if (ctx?.isASCII === true) {
    return s;
  }

  if (isASCII(s)) {
    return s;
  }

  s = s.replace(unicodeSymbols, "");

  const script = detectScript(s);
  if (ctx !== undefined) {
    ctx.script = script;
    ctx.scriptCached = true;
  }
  return normalizeByScript(s, script);
}

// tokenizeNormalized extracts word tokens from a normalized string, keeping
// apostrophes and hyphens inside words ("link's", "spider-man"). Unicode
// apostrophe and hyphen variants were already normalized to ASCII by
// normalizePunctuation.
function tokenizeNormalized(s: string): string[] {
  let result = "";
  for (const r of s) {
    if (isLetterOrNumberRune(r)) {
      result += toLowerRune(r.codePointAt(0)!);
    } else if (r === "'" || r === "-") {
      result += r;
    } else {
      // Everything else is a word boundary
      result += " ";
    }
  }

  const cleaned: string[] = [];
  for (let token of fields(result)) {
    // Only edge apostrophes and hyphens; internal ones are part of the word
    token = trim(token, "'- ");
    if (token !== "") {
      cleaned.push(token);
    }
  }
  return cleaned;
}

/**
 * slugifyWithTokens runs media-specific parsing and the normalization
 * pipeline, returning the slug and the tokens extracted during generation.
 *
 * Example:
 *   slugifyWithTokens("Game", "The Legend of Zelda: Ocarina of Time (USA)")
 *   → { slug: "legendofzeldaocarinaoftime",
 *       tokens: ["legend", "of", "zelda", "ocarina", "of", "time"] }
 */
export function slugifyWithTokens(
  mediaType: MediaType,
  input: string,
): SlugifyResult {
  const normalized = parseWithMediaType(mediaType, input);

  const [s, ctx] = normalizeInternal(normalized);
  if (s === "") {
    return { slug: "", tokens: [] };
  }

  const tokens = tokenizeNormalized(s);

  // Final character filtering: only run the filter the script needs
  const script = ctx.scriptCached ? ctx.script : detectScript(s);

  let slug: string;
  if (needsUnicodeSlug(script)) {
    slug = trimSpace(s.replace(nonAlphanumKeepUnicodeRegex, ""));
  } else {
    // Already lowercased, so only a-z and 0-9 need keeping
    slug = stripNonAlphanumASCII(s);
  }

  return { slug, tokens };
}

/**
 * slugifyQueryWords slugifies a search query as one title and returns the
 * slug of each of its words. Parsing the whole query lets context-dependent
 * rules match the title slug: a leading "The" is dropped, "Ghosts'n Goblins"
 * gives "ghosts", "and", "goblins", and a trailing "Edition" is stripped.
 * Slugifying each word on its own would keep "the", "ghostsn" and "edition",
 * none of which appear in the title's slug.
 *
 * The words joined together equal slugify(mediaType, query). A word of only
 * punctuation is left out; a word with letters or digits the slug filter
 * drops entirely comes back as "", so callers can tell the slug cannot
 * represent it. Returns [] when there are no words.
 */
export function slugifyQueryWords(
  mediaType: MediaType,
  query: string,
): string[] {
  const normalized = parseWithMediaType(mediaType, query);
  const [s, ctx] = normalizeInternal(normalized);
  if (s === "") {
    return [];
  }

  const script = ctx.scriptCached ? ctx.script : detectScript(s);
  const unicodeSlug = needsUnicodeSlug(script);

  // The slug filter works character by character and drops spaces, so
  // filtering each space-separated field gives pieces that join to the slug.
  const words: string[] = [];
  for (const field of fields(s)) {
    const word = unicodeSlug
      ? field.replace(nonAlphanumKeepUnicodeRegex, "")
      : stripNonAlphanumASCII(field);
    if (word === "" && !containsLetterOrNumber(field)) {
      continue;
    }
    words.push(word);
  }
  return words;
}

function containsLetterOrNumber(s: string): boolean {
  for (const r of s) {
    if (isLetterOrNumberRune(r)) {
      return true;
    }
  }
  return false;
}

/**
 * slugify converts a media title to a normalized slug for cross-platform
 * matching. Deterministic: the same input always gives the same slug.
 *
 * Examples:
 *   slugify("Game", "The Legend of Zelda: Ocarina of Time (USA) [!]")
 *   → "legendofzeldaocarinaoftime"
 *
 *   slugify("TVShow", "Breaking Bad - S01E02 - Gray Matter")
 *   → same as slugify("TVShow", "Breaking Bad - 1x02 - Gray Matter")
 */
export function slugify(mediaType: MediaType, input: string): string {
  return slugifyWithTokens(mediaType, input).slug;
}

/**
 * normalizeSymbolsAndSeparators converts conjunctions ("&", " + ", " 'n' ")
 * to "and", "+" to "plus", and separators (: _ / \ , ;) to spaces. Hyphens
 * between letters or digits are kept for compound words like "Spider-Man".
 * Periods are handled later, after abbreviation expansion.
 *
 * Examples:
 *   - "Sonic & Knuckles" → "Sonic and Knuckles"
 *   - "Game+" → "Game plus"
 *   - "Zelda:Link" → "Zelda Link"
 */
export function normalizeSymbolsAndSeparators(s: string): string {
  const conjunctions: [string, string][] = [
    [" & ", " and "],
    ["&", " and "],
    [" + ", " and "],
    [" 'n' ", " and "],
    [" 'n ", " and "],
    [" n' ", " and "],
    [" n ", " and "],
    // Same "'n" contraction, glued directly onto the preceding word with no
    // space before the apostrophe ("Ghosts'n Goblins", "Pop'n Music"). Order
    // matters: these run after the space-delimited patterns above have
    // already consumed the genuine standalone cases, so only the attached
    // form is left.
    ["'n' ", " and "],
    ["'n ", " and "],
    // Fully glued on both sides ("Bump'n'Jump", "Lock'n'Chase"), which the two
    // patterns above miss since they both require a trailing space. Checked
    // last: every "'n' " with a trailing space has already been consumed.
    ["'n'", " and "],
    // Plus symbol (for titles like "Game+" or "Mario Kart 8+")
    ["+", " plus "],
  ];
  for (const [from, to] of conjunctions) {
    s = s.split(from).join(to);
  }

  // " - " was already handled by splitTitle in the media parsers.
  if (!containsAny(s, ":_/\\,;-")) {
    return s;
  }

  let result = "";

  if (isASCII(s)) {
    for (let i = 0; i < s.length; i++) {
      const b = s.charAt(i);
      switch (b) {
        case ":":
        case "_":
        case "/":
        case "\\":
        case ",":
        case ";":
          result += " ";
          break;
        case "-": {
          const prevIsAlnum = i > 0 && isASCIIAlnum(s.charCodeAt(i - 1));
          const nextIsAlnum =
            i < s.length - 1 && isASCIIAlnum(s.charCodeAt(i + 1));
          result += prevIsAlnum && nextIsAlnum ? "-" : " ";
          break;
        }
        default:
          result += b;
      }
    }
  } else {
    const inputRunes = Array.from(s);
    for (let i = 0; i < inputRunes.length; i++) {
      const r = inputRunes[i]!;
      switch (r) {
        case ":":
        case "_":
        case "/":
        case "\\":
        case ",":
        case ";":
          result += " ";
          break;
        case "-": {
          const prevIsAlnum = i > 0 && isLetterOrNumberRune(inputRunes[i - 1]!);
          const nextIsAlnum =
            i < inputRunes.length - 1 &&
            isLetterOrNumberRune(inputRunes[i + 1]!);
          result += prevIsAlnum && nextIsAlnum ? r : " ";
          break;
        }
        default:
          result += r;
      }
    }
  }

  return result;
}

// normalizeInternal runs the universal stages of the slug pipeline. Media
// specific normalization has already been applied by parseWithMediaType.
//
//   1. Width normalization
//   2. Punctuation normalization
//   3. Unicode normalization (symbols, diacritics, script-aware forms)
//   4. Symbol and separator normalization
//   5. Periods to spaces
//   6. Lowercasing
//
// Stages 1-3 are skipped for ASCII-only strings. Final character filtering is
// left to the caller.
function normalizeInternal(input: string): [string, PipelineContext] {
  const ctx: PipelineContext = {
    script: ScriptLatin,
    scriptCached: false,
  };
  let s = trimSpace(input);
  if (s === "") {
    return ["", ctx];
  }

  const isASCIIVal = isASCII(s);
  ctx.isASCII = isASCIIVal;

  if (!isASCIIVal) {
    s = normalizeWidth(s);
    // Must happen before Unicode normalization so curly quotes and dashes
    // normalize first
    s = normalizePunctuation(s);
    s = normalizeUnicode(s, ctx);
  }

  s = normalizeSymbolsAndSeparators(s);

  s = s.split(".").join(" ");

  s = toLower(s);

  return [trimSpace(s), ctx];
}
