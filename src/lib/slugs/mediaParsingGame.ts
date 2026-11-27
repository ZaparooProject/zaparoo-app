/**
 * Game title parsing. Ported from go-slugs media_parsing_game.go.
 */
import { trimRight, trimSpace } from "./goStrings";
import {
  collapseDottedInitialisms,
  convertRomanNumerals,
  expandAbbreviationsAndNumbers,
  normalizeOrdinals,
  splitAndStripArticles,
  stripEditionAndVersionSuffixes,
  stripMetadataBrackets,
  stripTrailingArticle,
} from "./slugHelpers";
import { isASCII, normalizeWidth } from "./slugify";

function replaceAll(s: string, from: string, to: string): string {
  return s.split(from).join(to);
}

/**
 * parseGame normalizes game titles: strips articles, metadata brackets and
 * edition suffixes, expands abbreviations and number words, and converts
 * ordinals and Roman numerals (keeping "X" for titles like Mega Man X).
 *
 * Examples:
 *   - "Super Mario Bros. III (USA) [!]" → "super mario brothers 3"
 *   - "Street Fighter II Version" → "street fighter 2"
 *   - "Mega Man X" → "mega man x"
 */
export function parseGame(title: string): string {
  let s = title;

  // Normalize width first so fullwidth separators ("：") are detected by
  // splitAndStripArticles.
  if (!isASCII(s)) {
    s = normalizeWidth(s);
  }
  s = trimSpace(s);

  // MUST happen first: needs separators like ":" and "," intact for splitting
  s = splitAndStripArticles(s);
  s = trimSpace(s);

  // Also needs "," intact
  s = stripTrailingArticle(s);
  s = trimSpace(s);

  s = stripMetadataBrackets(s);
  s = trimSpace(s);

  s = stripEditionAndVersionSuffixes(s);
  s = trimSpace(s);

  // Collapse dotted initialisms (T.V. → TV) before trimRight strips the
  // trailing period, leaving only one letter-period pair and defeating the
  // {2,} threshold. Must happen here so the Roman numeral pass below doesn't
  // see an isolated "V" → "5".
  s = collapseDottedInitialisms(s);

  // Trim trailing separators so "Bros-" → "Bros" and abbreviation matching
  // works
  s = trimRight(s, "-:;.,_/\\ ");

  // Like normalizeSymbolsAndSeparators, but commas are kept for trailing
  // articles
  s = replaceAll(s, " & ", " and ");
  s = replaceAll(s, "&", " and ");
  s = replaceAll(s, " + ", " and ");
  s = replaceAll(s, "+", " plus ");
  s = replaceAll(s, ":", " ");
  s = replaceAll(s, "_", " ");
  s = replaceAll(s, "/", " ");
  s = replaceAll(s, "\\", " ");
  s = replaceAll(s, ";", " ");
  s = replaceAll(s, ".", " ");
  s = trimSpace(s);

  // One pass to avoid splitting and joining the string twice
  s = expandAbbreviationsAndNumbers(s);

  s = normalizeOrdinals(s);

  // Includes lowercasing
  s = convertRomanNumerals(s);

  return s;
}
