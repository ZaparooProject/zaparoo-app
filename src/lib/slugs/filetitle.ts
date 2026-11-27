/**
 * Canonical and display titles from media filenames, matching the titles
 * Zaparoo Core indexes. Ported from go-slugs filetitle/filetitle.go,
 * normalize.go and tags.go.
 */
import {
  collapseSpaces,
  findUnbracketedYear,
  isDigit,
  removeSeasonEpisode,
  stripLeadingNumberPrefix,
} from "./filetitleStringParsers";
import { findAllIndex, goRegExp } from "./goRegexp";
import {
  containsAny,
  toLower,
  trimLeft,
  trimRight,
  trimSpace,
  utf8Len,
} from "./goStrings";
import { stripMetadataBrackets } from "./slugHelpers";
import {
  MediaTypeGame,
  MediaTypeMovie,
  MediaTypeTVShow,
  MediaTypeVideo,
  type MediaType,
} from "./slugify";

// tagType, tagValue and canonicalTag mirror the tag model Zaparoo Core uses
// when it extracts tags from filenames. Title parsing only needs the
// structural subset of that model to decide which bracket groups to keep.
type TagType = "disc" | "disctotal" | "media" | "patch" | "unlicensed";

// tagSourceBracketed marks a tag that came from (), {}, <> or [].
const tagSourceBracketed = 1;
type TagSource = typeof tagSourceBracketed;

interface CanonicalTag {
  type: TagType;
  value: string;
  source: TagSource;
}

const tagMediaDisc = "disc";
const tagMediaDisk = "disk";
const tagMediaFile = "file";
const tagMediaPart = "part";
const tagMediaSideA = "side-a";
const tagMediaSideB = "side-b";
const tagMediaSideC = "side-c";
const tagMediaSideD = "side-d";
const tagMediaTape = "tape";

const tagUnlicensedHack = "hack";

const reHTGDBHackMarker = goRegExp(String.raw`(?i)\((?:hack|patch)\)`);
const reHTGDBPatchVersion = goRegExp(
  String.raw`(?i)(?:^|[\s_+\-])v(\d+(?:\.\d+)*)`,
);
const reHTGDBPatchLabel = goRegExp(
  String.raw`(?i)\b(?:` +
    String.raw`(?:ted[\s_-]+)?woolsey[\s_-]+uncensored[\s_-]+edition|` +
    String.raw`stereo\s*\+\s*bug[\s_-]*fix(?:es)?|gba[\s_-]+script[\s_-]+port|` +
    String.raw`splash[\s_-]+screen[\s_-]+removed|quality[\s_-]+of[\s_-]+life|` +
    String.raw`music[\s_-]+restore|sram[\s_-]+expansion|faster[\s_-]+rom|` +
    String.raw`fast[\s_-]*rom|slow[\s_-]*rom|all[\s_-]+bugs[\s_-]+fix|` +
    String.raw`bug[\s_-]*fix(?:es)?|uncensor(?:ed)?|relocalized|restoration|` +
    String.raw`performance|retouch|overhaul|tweak|wide[\s_-]*screen|` +
    String.raw`msu[\s_-]*1|sa[\s_-]*1|colori[sz](?:ation|ed)|redux|qol` +
    String.raw`)\b`,
);

// Scene release artifact patterns (for modern media: movies, TV shows).
// These match AFTER separator normalization, so hyphens have become spaces.
const reResolution = goRegExp(
  String.raw`(?i)\b(480p|720p|1080p|2160p|4K|8K|UHD)\b`,
  true,
);
const reSource = goRegExp(
  String.raw`(?i)\b(CAM|TS|TC|TELESYNC|TELECINE|SCREENER|SCR|HDTV|PDTV|WEB[\s-]?DL|WEBRip|WEBRIP|` +
    String.raw`BluRay|BRRip|BDRip|Blu[\s-]?ray|Remux|DVDRip|DVDSCR|R5)\b`,
  true,
);
const reVideoCodec = goRegExp(
  String.raw`(?i)\b(x264|x265|h[\s.]?264|h[\s.]?265|HEVC|AVC|XviD|VP9|AV1)\b`,
  true,
);
const reAudioCodec = goRegExp(
  String.raw`(?i)\b(AAC|MP3|AC3|DTS|DD5[\s.]?1|DD\+?5[\s.]?1|TrueHD|Atmos|EAC3|FLAC|DTS[\s-]?HD)\b`,
  true,
);
const reHDR = goRegExp(
  String.raw`(?i)\b(HDR|HDR10|HDR10\+|DV|Dolby[\s.]?Vision)\b`,
  true,
);
const reSceneStatus = goRegExp(
  String.raw`(?i)\b(PROPER|REPACK|INTERNAL|LIMITED|READNFO|DIRFIX|NFOFIX|UNRATED|EXTENDED)\b`,
  true,
);
const reReleaseGroup = goRegExp(String.raw`-([A-Z][A-Z0-9]{2,})$`, true);

// normalizeTag patterns
const reColonSpacing = goRegExp(String.raw`\s*:\s*`, true);
const reSpecialChars = goRegExp(String.raw`[^a-z0-9:,+\-]`, true);
const reConsecutiveDash = goRegExp(String.raw`-{2,}`, true);

// patchLabelAliases contains patch labels observed in ROM-hack collections.
// Unknown bracket labels remain available to the general filename parser.
const patchLabelAliases = new Map<string, string>([
  ["all-bugs-fix", "bugfix"],
  ["bug-fix", "bugfix"],
  ["bug-fixes", "bugfix"],
  ["bugfix", "bugfix"],
  ["bugfixes", "bugfix"],
  ["color", "color"],
  ["colorisation", "color"],
  ["colorised", "color"],
  ["colorization", "color"],
  ["colorized", "color"],
  ["fast-rom", "fastrom"],
  ["faster-rom", "fastrom"],
  ["fastrom", "fastrom"],
  ["fix", "fix"],
  ["fixes", "fix"],
  ["gba-script-port", "script-port"],
  ["hack", "hack"],
  ["msu-1", "msu1"],
  ["msu1", "msu1"],
  ["music", "music"],
  ["music-restore", "music"],
  ["no-sram", "no-sram"],
  ["overhaul", "overhaul"],
  ["performance", "performance"],
  ["quality-of-life", "qol"],
  ["qol", "qol"],
  ["redux", "redux"],
  ["relocalized", "relocalized"],
  ["restoration", "restoration"],
  ["retouch", "retouch"],
  ["sa-1", "sa1"],
  ["sa1", "sa1"],
  ["script-port", "script-port"],
  ["slow-rom", "slowrom"],
  ["slowrom", "slowrom"],
  ["splash-screen-removed", "splash-screen-removed"],
  ["sram", "sram"],
  ["sram-expansion", "sram"],
  ["stereo-bug-fixes", "bugfix"],
  ["tweak", "tweak"],
  ["uncensor", "uncensored"],
  ["uncensored", "uncensored"],
  ["wide-screen", "widescreen"],
  ["widescreen", "widescreen"],
  ["woolsey-uncensored-edition", "uncensored"],
  ["ted-woolsey-uncensored-edition", "uncensored"],
]);

// No prefix is a prefix of another, so lookup order doesn't matter.
const structuralMediaPrefixes = new Map<string, string>([
  ["disc", tagMediaDisc],
  ["disk", tagMediaDisk],
  ["file", tagMediaFile],
  ["part", tagMediaPart],
  ["tape", tagMediaTape],
  ["cd", tagMediaDisc],
]);

const structuralRomanNumbers = new Map<string, string>([
  ["i", "1"],
  ["ii", "2"],
  ["iii", "3"],
  ["iv", "4"],
  ["v", "5"],
  ["vi", "6"],
  ["vii", "7"],
  ["viii", "8"],
  ["ix", "9"],
  ["x", "10"],
]);

// normalizeTag matches go-zapscript's NormalizeTag, which Zaparoo Core uses
// for tag storage. The two must stay identical.
function normalizeTag(s: string): string {
  s = trimSpace(s);
  s = s.replace(reColonSpacing, ":");
  s = toLower(s);
  s = s.split(" ").join("-");
  s = s.split(".").join("-");
  s = s.replace(reSpecialChars, "");
  s = s.replace(reConsecutiveDash, "-");
  return s;
}

function normalizeStructuralNumber(s: string): string | undefined {
  if (s === "") {
    return undefined;
  }
  const roman = structuralRomanNumbers.get(s);
  if (roman !== undefined) {
    return roman;
  }
  for (let i = 0; i < s.length; i++) {
    if (!isDigit(s.charCodeAt(i))) {
      return undefined;
    }
  }
  let normalized = trimLeft(s, "0");
  if (normalized === "") {
    normalized = "0";
  }
  return normalized;
}

function structuralSideValue(s: string): string | undefined {
  switch (s) {
    case "a":
    case "1":
      return tagMediaSideA;
    case "b":
    case "2":
      return tagMediaSideB;
    case "c":
    case "3":
      return tagMediaSideC;
    case "d":
    case "4":
      return tagMediaSideD;
    default:
      return undefined;
  }
}

function compactStructuralMediaTag(
  normalized: string,
  source: TagSource,
): CanonicalTag[] | undefined {
  for (const [prefix, mediaValue] of structuralMediaPrefixes) {
    if (!normalized.startsWith(prefix) || normalized.length === prefix.length) {
      continue;
    }
    const number = normalizeStructuralNumber(normalized.slice(prefix.length));
    if (number === undefined) {
      continue;
    }
    return [
      { type: "media", value: mediaValue, source },
      { type: "disc", value: number, source },
    ];
  }
  return undefined;
}

function parseStructuralSetTag(
  normalized: string,
  source: TagSource,
): CanonicalTag[] | undefined {
  if (normalized === "") {
    return undefined;
  }

  if (normalized.startsWith("side-")) {
    const sideValue = structuralSideValue(normalized.slice("side-".length));
    if (sideValue !== undefined) {
      return [{ type: "media", value: sideValue, source }];
    }
  }

  const tokens = normalized.split("-");
  if (tokens.length < 2) {
    return compactStructuralMediaTag(normalized, source);
  }

  const mediaValue = structuralMediaPrefixes.get(tokens[0]!);
  if (mediaValue === undefined) {
    return undefined;
  }
  const number = normalizeStructuralNumber(tokens[1]!);
  if (number === undefined) {
    return undefined;
  }

  const results: CanonicalTag[] = [
    { type: "media", value: mediaValue, source },
    { type: "disc", value: number, source },
  ];

  let next = 2;
  if (tokens.length >= next + 2 && tokens[next] === "of") {
    const total = normalizeStructuralNumber(tokens[next + 1]!);
    if (total === undefined) {
      return undefined;
    }
    results.push({ type: "disctotal", value: total, source });
    next += 2;
  }
  if (tokens.length >= next + 2 && tokens[next] === "side") {
    const sideValue = structuralSideValue(tokens[next + 1]!);
    if (sideValue === undefined) {
      return undefined;
    }
    results.push({ type: "media", value: sideValue, source });
    next += 2;
  }
  if (next !== tokens.length) {
    return undefined;
  }

  return results;
}

function canonicalPatchLabel(label: string): string | undefined {
  return patchLabelAliases.get(label);
}

function versionedPatchValue(value: string, version: string): string {
  if (version === "") {
    return value;
  }
  return value + ":" + version;
}

// asciiEqualFold compares ASCII case-insensitively. Go's strings.EqualFold
// on a byte slice of the length of an ASCII marker can only match ASCII:
// a multi-byte rune that folds to an ASCII letter (U+212A Kelvin sign)
// would not fit in the slice whole.
function asciiEqualFold(s: string, ascii: string): boolean {
  if (s.length !== ascii.length) {
    return false;
  }
  for (let i = 0; i < s.length; i++) {
    let c = s.charCodeAt(i);
    if (c >= 0x41 && c <= 0x5a) {
      c += 0x20;
    }
    if (c !== ascii.charCodeAt(i)) {
      return false;
    }
  }
  return true;
}

function hasHTGDBPatchMarker(filename: string): boolean {
  for (let offset = 0; offset < filename.length; ) {
    const markerStart = filename.indexOf("(", offset);
    if (markerStart < 0) {
      return false;
    }
    const remaining = filename.slice(markerStart);
    if (asciiEqualFold(remaining.slice(0, "(hack)".length), "(hack)")) {
      return true;
    }
    if (asciiEqualFold(remaining.slice(0, "(patch)".length), "(patch)")) {
      return true;
    }
    offset = markerStart + 1;
  }
  return false;
}

function splitPatchFilenameExtension(
  filename: string,
): [stem: string, extension: string] {
  const lastSlash = Math.max(
    filename.lastIndexOf("/"),
    filename.lastIndexOf("\\"),
  );
  const lastDot = filename.lastIndexOf(".");
  if (lastDot <= lastSlash) {
    return [filename, ""];
  }

  // Go measures the extension in UTF-8 bytes.
  const extensionBody = filename.slice(lastDot + 1);
  const extensionLen = utf8Len(extensionBody);
  if (
    extensionLen < 2 ||
    extensionLen > 4 ||
    containsAny(extensionBody, " \t")
  ) {
    return [filename, ""];
  }
  return [filename.slice(0, lastDot), filename.slice(lastDot)];
}

// parseHTGDBPatchSuffix handles HTGDB/SmokeMonster names such as
// "Axelay (U) FastROM (Hack) v1.0 Vitor Vilela". Only researched patch
// labels are recognized; arbitrary names containing "(Hack)" retain their
// existing title and revision behavior.
function parseHTGDBPatchSuffix(
  filename: string,
): [tags: CanonicalTag[] | undefined, remaining: string, matched: boolean] {
  if (!hasHTGDBPatchMarker(filename)) {
    return [undefined, filename, false];
  }

  const [stem, extension] = splitPatchFilenameExtension(filename);
  const markers = findAllIndex(reHTGDBHackMarker, stem);
  const marker = markers[markers.length - 1];
  if (marker === undefined) {
    return [undefined, filename, false];
  }

  const prefix = stem.slice(0, marker[0]);
  const labelMatches = findAllIndex(reHTGDBPatchLabel, prefix);
  const firstLabel = labelMatches[0];
  if (firstLabel === undefined) {
    return [undefined, filename, false];
  }

  const stripStart = firstLabel[0];
  let version = "";
  const match = reHTGDBPatchVersion.exec(stem.slice(stripStart));
  if (match !== null) {
    version = match[1]!.split(".").join("-");
  }

  const tags: CanonicalTag[] = [
    {
      type: "unlicensed",
      value: tagUnlicensedHack,
      source: tagSourceBracketed,
    },
  ];
  const seen = new Set<string>();
  for (const [start, end] of labelMatches) {
    const normalized = normalizeTag(prefix.slice(start, end));
    let patchValue = canonicalPatchLabel(normalized);
    if (patchValue === undefined) {
      continue;
    }
    patchValue = versionedPatchValue(patchValue, version);
    if (seen.has(patchValue)) {
      continue;
    }
    seen.add(patchValue);
    tags.push({ type: "patch", value: patchValue, source: tagSourceBracketed });
  }
  if (tags.length === 1) {
    return [undefined, filename, false];
  }

  const remaining =
    trimRight(prefix.slice(0, stripStart), " \t-_+") + extension;
  return [tags, remaining, true];
}

// sceneMarkers indicate scene release artifacts may be present. If none are
// found, stripSceneArtifacts can skip 7 regex evaluations. They catch all
// patterns matched by the scene regexes while being absent from typical ROM
// filenames.
const sceneMarkers = [
  "264",
  "265", // x264, h264, x265, h265
  "480",
  "720",
  "108",
  "216", // resolutions
  "4K",
  "4k",
  "8K",
  "8k",
  "UHD",
  "uhd",
  "BluRay",
  "bluray",
  "WEBDL",
  "webdl",
  "WEB-DL",
  "web-dl",
  "WEBRip",
  "webrip",
  "BDRip",
  "bdrip",
  "DVDRip",
  "dvdrip",
  "HDTV",
  "hdtv",
  "HEVC",
  "hevc",
  "AVC",
  "avc",
  "XviD",
  "xvid",
  "AAC",
  "aac",
  "DTS",
  "dts",
  "FLAC",
  "flac",
  "HDR",
  "hdr",
  "PROPER",
  "proper",
  "REPACK",
  "repack",
];

// stripsReleaseGroups reports whether a media type's filenames follow scene
// release naming, where a trailing "-GROUP" names the release group. Game
// filenames do not: an all-caps title such as "F-ZERO" or "SUPER MARIO
// ALL-STARS", typical of a cartridge header, ends in the same shape.
function stripsReleaseGroups(mediaType: MediaType | ""): boolean {
  switch (mediaType) {
    case MediaTypeMovie:
    case MediaTypeTVShow:
    case MediaTypeVideo:
      return true;
    default:
      return false;
  }
}

// hasSceneMarkers does a cheap scan for substrings that indicate scene
// release artifacts may be present.
function hasSceneMarkers(s: string, releaseGroups: boolean): boolean {
  for (const marker of sceneMarkers) {
    if (s.includes(marker)) {
      return true;
    }
  }
  // Release group suffix: -GROUP at end of string. Go checks the UTF-8 byte
  // length; the scanned suffix itself is ASCII.
  const n = s.length;
  const last = s.charCodeAt(n - 1);
  if (releaseGroups && utf8Len(s) > 3 && last >= 0x41 && last <= 0x5a) {
    for (let i = n - 2; i >= 0; i--) {
      const c = s.charCodeAt(i);
      if (c === 0x2d) {
        return true;
      }
      if ((c < 0x41 || c > 0x5a) && (c < 0x30 || c > 0x39)) {
        break;
      }
    }
  }
  return false;
}

// stripSceneArtifacts removes scene release artifacts (resolution, source,
// codecs, HDR, scene status and, when releaseGroups, a trailing -GROUP) from
// filenames for more readable display titles.
//
// Examples:
//   - "The.Dark.Knight.2008.1080p.BluRay.x264-GROUP" → "The.Dark.Knight.2008"
//   - "Show.S01E01.PROPER.720p.HDTV" → "Show.S01E01"
function stripSceneArtifacts(input: string, releaseGroups: boolean): string {
  if (!hasSceneMarkers(input, releaseGroups)) {
    return input;
  }

  let result = input;
  result = result.replace(reResolution, " ");
  result = result.replace(reSource, " ");
  result = result.replace(reVideoCodec, " ");
  result = result.replace(reAudioCodec, " ");
  result = result.replace(reHDR, " ");
  result = result.replace(reSceneStatus, " ");
  if (releaseGroups) {
    result = result.replace(reReleaseGroup, "");
  }
  return result;
}

function stripMetadataBracketsForDisplay(s: string): string {
  return filterBracketGroups(s, true);
}

const closingBrackets = new Map([
  ["(", ")"],
  ["[", "]"],
  ["{", "}"],
  ["<", ">"],
]);

// filterBracketGroups keeps the bracket groups that are structural set
// markers and drops the rest when keepStructural is set, and does the reverse
// when it is not. Text after an unclosed bracket is metadata to the first
// form and part of the name to the second.
function filterBracketGroups(s: string, keepStructural: boolean): string {
  let result = "";

  for (let i = 0; i < s.length; i++) {
    const open = s.charAt(i);
    const closeBracket = closingBrackets.get(open);
    if (closeBracket === undefined) {
      result += open;
      continue;
    }

    const start = i;
    let depth = 1;
    for (i++; i < s.length; i++) {
      const c = s.charAt(i);
      if (c === open) {
        depth++;
      } else if (c === closeBracket) {
        depth--;
        if (depth === 0) {
          const content = s.slice(start + 1, i);
          const structural =
            parseStructuralSetTag(normalizeTag(content), tagSourceBracketed) !==
            undefined;
          if (structural === keepStructural) {
            result += s.slice(start, i + 1);
          }
        }
      }
      if (depth === 0) {
        break;
      }
    }
    if (depth !== 0 && !keepStructural) {
      result += s.slice(start);
    }
  }

  return trimSpace(result);
}

/**
 * parse extracts the canonical title of a media file from its filename.
 * Zaparoo Core indexes this title and slugifies it, so other clients that
 * index files must use it to get titles and slugs that match Core's.
 *
 * It strips the file extension, scene release artifacts (resolution, codecs,
 * sources, and release groups for video), season and episode markers, and
 * every bracket group: (), [], {} and <>. Filenames with no spaces but two or
 * more dots, underscores or dashes have those separators turned into spaces.
 *
 * stripLeadingNumbers removes list numbering such as "1. " or "01 - ". Set it
 * only when the directory as a whole is numbered; see browseprefix.
 *
 * An empty mediaType is treated as a game.
 *
 * Examples:
 *   - "Super Mario Bros (USA) [!].sfc" → "Super Mario Bros"
 *   - "super_mario_bros.sfc" → "super mario bros"
 *   - "1942 (USA)" → "1942"
 *   - "The.Dark.Knight.2008.1080p.BluRay.x264.mkv" → "The Dark Knight 2008"
 */
export function parse(
  filename: string,
  stripLeadingNumbers: boolean,
  mediaType: MediaType | "",
): string {
  return parseFilenameTitle(filename, stripLeadingNumbers, false, mediaType);
}

/**
 * parseDisplay is like parse but keeps structural set markers such as
 * "(Disc 1 of 2)" or "(Side A)", so files of a multi-part set stay
 * distinguishable when shown one per row.
 */
export function parseDisplay(
  filename: string,
  stripLeadingNumbers: boolean,
  mediaType: MediaType | "",
): string {
  return parseFilenameTitle(filename, stripLeadingNumbers, true, mediaType);
}

/**
 * stripStructuralSetMarkers removes structural set markers such as
 * "(Disc 1)", "(Disk 2 of 4)" and "(Side A)" from a display title and leaves
 * every other bracket group in place. Zaparoo Core indexes the same markers
 * as media and disc tags, so a caller that shows tags alongside the name can
 * drop them from the name. A title that is nothing but a marker is returned
 * unchanged.
 */
export function stripStructuralSetMarkers(title: string): string {
  if (!containsAny(title, "([{<")) {
    return title;
  }
  const stripped = trimSpace(collapseSpaces(filterBracketGroups(title, false)));
  if (stripped === "") {
    return title;
  }
  return stripped;
}

function countOf(s: string, sub: string): number {
  return s.split(sub).length - 1;
}

function parseFilenameTitle(
  filename: string,
  stripLeadingNumbers: boolean,
  preserveStructuralTags: boolean,
  mediaType: MediaType | "",
): string {
  let title = filename;
  if (mediaType === "" || mediaType === MediaTypeGame) {
    const [, withoutPatchSuffix, matched] = parseHTGDBPatchSuffix(title);
    if (matched) {
      title = withoutPatchSuffix;
    }
  }

  // Remove the file extension first, if it looks reasonable (2-4 UTF-8 bytes
  // after the last dot)
  const lastDot = title.lastIndexOf(".");
  if (lastDot > 0) {
    const ext = title.slice(lastDot + 1);
    const extLen = utf8Len(ext);
    if (extLen >= 2 && extLen <= 4 && !ext.includes(" ")) {
      title = title.slice(0, lastDot);
    }
  }

  // Strip the release group BEFORE separator normalization turns its hyphen
  // into a space. Only scene-named media has them; see stripsReleaseGroups.
  const releaseGroups = stripsReleaseGroups(mediaType);
  if (releaseGroups && title.includes("-")) {
    title = title.replace(reReleaseGroup, "");
  }

  // If the filename has no spaces AND has 2+ separators (dots, underscores,
  // or dashes), treat them all as space substitutes. Common in scene
  // releases and ROM filenames: "The.Dark.Knight.2008.mkv",
  // "super_mario_bros.sfc", "mega-man-x.nes"
  const dotCount = countOf(title, ".");
  const sepCount = countOf(title, "_") + countOf(title, "-");

  if (!title.includes(" ") && (dotCount >= 2 || sepCount >= 2)) {
    title = title.split(".").join(" ");
    title = title.split("_").join(" ");
    title = title.split("-").join(" ");
  }

  // Only strip scene artifacts AFTER the year to avoid corrupting titles:
  // "Cam (2018)" should NOT have "Cam" removed as a scene tag
  const yearMatch = findUnbracketedYear(title);

  if (yearMatch.ok) {
    const yearIdx = yearMatch.start;
    const extractedYearForStripping = title.slice(
      yearMatch.cap1s,
      yearMatch.cap1e,
    );

    const beforeYear = title.slice(0, yearIdx);
    const afterYear = title.slice(yearIdx + extractedYearForStripping.length);

    const cleanedAfterYear = stripSceneArtifacts(afterYear, releaseGroups);
    title = beforeYear + extractedYearForStripping + cleanedAfterYear;
  } else {
    // No year found: strip the entire title (safer for non-media files)
    title = stripSceneArtifacts(title, releaseGroups);
  }

  // S##E## markers are useful as metadata but clutter the display title
  title = removeSeasonEpisode(title);

  // Only done when contextual detection confirms list-based numbering
  if (stripLeadingNumbers) {
    title = stripLeadingNumberPrefix(title);
    title = trimSpace(title);
  }

  // Per-file display titles retain structural set markers, while canonical
  // titles strip every bracket group.
  if (preserveStructuralTags) {
    title = stripMetadataBracketsForDisplay(title);
  } else {
    title = stripMetadataBrackets(title);
  }
  title = trimSpace(title);

  // Bracket removal can leave gaps like "Game [USA] [!]" → "Game  "
  title = collapseSpaces(title);

  return trimSpace(title);
}
