/**
 * TV show title parsing. Ported from go-slugs media_parsing_tv.go.
 */
import { goRegExp } from "./goRegexp";
import { formatScannedInt, toLower, trim, trimSpace } from "./goStrings";
import {
  normalizeDotSeparators,
  splitAndStripArticles,
  stripMetadataBrackets,
  stripSceneTags,
  stripTrailingArticle,
} from "./slugHelpers";
import { normalizeWidth } from "./slugify";

// Matches S01E02, s01e02, S01E02-E03, S01E02E03 formats
const tvEpisodePattern = goRegExp(
  String.raw`(?i)s(\d+)e(\d+)(?:[-e]?e?(\d+))?`,
);
// Matches 1x02, 01x02, 1x02-03 formats
const tvEpisodeAltPattern = goRegExp(String.raw`(?i)(\d+)x(\d+)(?:-?(\d+))?`);
// Matches S01.E02, s01.e02 formats (dot separator)
const tvEpisodeDotPattern = goRegExp(
  String.raw`(?i)s(\d+)\.e(\d+)(?:[-.]?e?(\d+))?`,
);
// Matches S01_E02, s01_e02 formats (underscore separator)
const tvEpisodeUnderscorePattern = goRegExp(
  String.raw`(?i)s(\d+)_e(\d+)(?:[-_]?e?(\d+))?`,
);

// Date-based episode formats (for daily shows)
// Matches YYYY-MM-DD, YYYY.MM.DD, YYYY/MM/DD
const tvDateYMDPattern = goRegExp(String.raw`(\d{4})[-./](\d{2})[-./](\d{2})`);
// Matches DD-MM-YYYY, DD.MM.YYYY, DD/MM/YYYY
const tvDateDMYPattern = goRegExp(
  String.raw`\b(\d{2})[-./](\d{2})[-./](\d{4})\b`,
);

// Absolute numbering formats (for anime)
// Matches "Episode 001", "Ep 42", "E001" formats
const tvAbsolutePattern = goRegExp(
  String.raw`(?i)\b(?:episode|ep|e)[\s._-]*(\d{1,4})\b`,
);
// Matches "#001", "#42" formats
const tvAbsoluteHashPattern = goRegExp(String.raw`#(\d{1,4})\b`);
// Matches leading number format: "001 - Show - Title"
const tvAbsoluteLeadingPattern = goRegExp(String.raw`^\s*(\d{2,4})[\s._-]`);

const seasonMarkerPattern = goRegExp(String.raw`\bs\d+e\d+`);
const absoluteMarkerPattern = goRegExp(String.raw`\be\d{2,4}\b`);
const seasonMarkerFullPattern = goRegExp(String.raw`\bs\d+e\d+(?:e\d+)?\b`);
const componentDelimiterPattern = goRegExp(String.raw`\s+[-|]\s+`);

// Go's strings.Replace(s, old, new, 1): replaces the first occurrence of the
// matched text, which may come before the regex match itself.
function replaceFirst(s: string, old: string, replacement: string): string {
  return s.replace(old, () => replacement);
}

/**
 * parseTVShow normalizes TV show titles to a canonical format: episode
 * markers become s##e##, YYYY-MM-DD or e###, and components are reordered to
 * "{show} {marker} {title}".
 *
 * Examples:
 *   - "Breaking Bad - S01E02 - Gray Matter" → "Breaking Bad s01e02 Gray Matter"
 *   - "Daily Show - 2024-01-15" → "Daily Show 2024-01-15"
 *   - "One Piece - Episode 001" → "One Piece e001"
 */
export function parseTVShow(title: string): string {
  let s = title;

  // Normalize width first so fullwidth separators are detected by later
  // functions
  s = normalizeWidth(s);
  s = trimSpace(s);

  // Strip scene release tags before dot normalization
  s = stripSceneTags(s);
  s = trimSpace(s);

  s = normalizeDotSeparators(s);
  s = trimSpace(s);

  // Strip metadata brackets before episode normalization
  s = stripMetadataBrackets(s);
  s = trimSpace(s);

  // Normalize dates before episode formats so dates aren't confused with
  // episode numbers
  s = normalizeDateEpisode(s);
  s = trimSpace(s);

  // Season-based formats first, then absolute (dates already normalized)
  for (const pattern of [
    tvEpisodePattern,
    tvEpisodeAltPattern,
    tvEpisodeDotPattern,
    tvEpisodeUnderscorePattern,
  ]) {
    const match = pattern.exec(s);
    if (match !== null) {
      s = normalizeTVEpisodeFormat(s, match);
    }
  }

  // Only normalize absolute numbering if no season or date marker was found
  const hasSeasonMarker = seasonMarkerPattern.test(toLower(s));
  const hasDateMarker = tvDateYMDPattern.test(s) || tvDateDMYPattern.test(s);

  if (!hasSeasonMarker && !hasDateMarker) {
    s = normalizeAbsoluteEpisode(s);
  }

  // Reorder before article stripping so every " - " delimiter is intact for
  // component identification ("S01E02 - Show" vs "Show - S01E02")
  const hasAbsoluteMarker = absoluteMarkerPattern.test(toLower(s));

  if (hasSeasonMarker || hasAbsoluteMarker || hasDateMarker) {
    s = reorderTVComponents(s);
  }

  // The string is now in canonical order: "Show marker Title"
  s = splitAndStripArticles(s);
  s = trimSpace(s);

  s = stripTrailingArticle(s);
  s = trimSpace(s);

  return s;
}

// normalizeTVEpisodeFormat converts episode markers to canonical lowercase
// s##e## format, including multi-episode ranges.
function normalizeTVEpisodeFormat(
  input: string,
  match: RegExpExecArray,
): string {
  const fullMatch = match[0];
  const season = formatScannedInt(match[1]!, 2);
  const episode = formatScannedInt(match[2]!, 2);

  let canonical = `s${season}e${episode}`;

  // Multi-episode format (e.g., S01E01-E02 or S01E01E02)
  const endEpisodeStr = match[3];
  if (endEpisodeStr !== undefined) {
    canonical = `s${season}e${episode}e${formatScannedInt(endEpisodeStr, 2)}`;
  }

  return replaceFirst(input, fullMatch, canonical);
}

// normalizeDateEpisode converts date-based episode markers to canonical
// YYYY-MM-DD format.
function normalizeDateEpisode(input: string): string {
  let match = tvDateYMDPattern.exec(input);
  if (match !== null) {
    const fullMatch = match[0];
    const canonical = `${match[1]!}-${match[2]!}-${match[3]!}`;
    if (fullMatch !== canonical) {
      return replaceFirst(input, fullMatch, canonical);
    }
    return input;
  }

  match = tvDateDMYPattern.exec(input);
  if (match !== null) {
    const canonical = `${match[3]!}-${match[2]!}-${match[1]!}`;
    return replaceFirst(input, match[0], canonical);
  }

  return input;
}

// normalizeAbsoluteEpisode converts absolute numbering formats to canonical
// e### format.
function normalizeAbsoluteEpisode(input: string): string {
  let match = tvAbsolutePattern.exec(input);
  if (match !== null) {
    const canonical = `e${formatScannedInt(match[1]!, 3)}`;
    return replaceFirst(input, match[0], canonical);
  }

  match = tvAbsoluteHashPattern.exec(input);
  if (match !== null) {
    const canonical = `e${formatScannedInt(match[1]!, 3)}`;
    return replaceFirst(input, match[0], canonical);
  }

  match = tvAbsoluteLeadingPattern.exec(input);
  if (match !== null) {
    const canonical = `e${formatScannedInt(match[1]!, 3)} `;
    return replaceFirst(input, match[0], canonical);
  }

  return input;
}

// reorderTVComponents reorders TV show components to canonical format
// "{show} {marker} {title}", since the episode marker can appear anywhere.
//
// Examples:
//   - "S01E02 - Attack on Titan - That Day" → "Attack on Titan s01e02 That Day"
//   - "Attack on Titan - That Day - S01E02" → "Attack on Titan s01e02 That Day"
function reorderTVComponents(s: string): string {
  let marker = "";
  let markerIdx = -1;

  const match =
    seasonMarkerFullPattern.exec(s) ??
    tvDateYMDPattern.exec(s) ??
    tvDateDMYPattern.exec(s) ??
    absoluteMarkerPattern.exec(s);
  if (match !== null) {
    marker = match[0];
    markerIdx = match.index;
  }

  if (marker === "") {
    return s;
  }

  const beforeMarker = trimSpace(s.slice(0, markerIdx));
  let afterMarker = "";
  if (markerIdx + marker.length < s.length) {
    afterMarker = trimSpace(s.slice(markerIdx + marker.length));
  }

  let combined = beforeMarker;
  if (afterMarker !== "") {
    if (beforeMarker !== "") {
      combined += " - " + afterMarker;
    } else {
      combined = afterMarker;
    }
  }

  // Split only on spaced delimiters; a lone "-" would break dates
  const components = combined.split(componentDelimiterPattern);

  const nonEmpty: string[] = [];
  for (let comp of components) {
    comp = trimSpace(comp);
    comp = trim(comp, "-|. ");
    if (comp !== "") {
      nonEmpty.push(comp);
    }
  }

  if (nonEmpty.length === 0) {
    return marker;
  }

  // First component is the show name, the rest is the episode title
  const showName = nonEmpty[0]!;
  const episodeTitle = nonEmpty.slice(1).join(" ");

  let result = showName + " " + marker;
  if (episodeTitle !== "") {
    result += " " + episodeTitle;
  }

  return trimSpace(result);
}
