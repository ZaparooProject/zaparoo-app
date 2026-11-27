/**
 * Music title parsing. Ported from go-slugs media_parsing_music.go.
 */
import { goRegExp } from "./goRegexp";
import { trimSpace } from "./goStrings";
import {
  normalizeDotSeparators,
  sceneGroupRegex,
  stripLeadingArticle,
  stripMetadataBrackets,
  stripTrailingArticle,
} from "./slugHelpers";
import { normalizeWidth } from "./slugify";

const musicFormatRegex = goRegExp(
  String.raw`(?i)\b(flac|mp3|aac|alac|ape|wav|ogg|wma|m4a|opus)\b`,
  true,
);

const musicQualityRegex = goRegExp(
  String.raw`(?i)\b(v[0-9]|320|256|192|128|cbr|vbr|abr|lame[0-9.]*|ape|apx|aps|` +
    String.raw`24bit|16bit|96khz|88\.2khz|48khz|44\.1khz|44khz|` +
    String.raw`24-96|24-88|24-48|24-44|16-44)\b`,
  true,
);

const musicSourceRegex = goRegExp(
  String.raw`(?i)\b(cd|web|vinyl|sacd|dvd|blu-?ray|dat|cassette|tape|radio|fm|live|bootleg)\b`,
  true,
);

const musicDiscRegex = goRegExp(String.raw`(?i)\b(cd|disc)\s*\d{1,2}\b`, true);

const multipleSpacesRegex = goRegExp(String.raw`\s+`, true);

/**
 * parseMusic normalizes music titles: strips format, quality, source and disc
 * tags, converts scene separators, and strips brackets and articles.
 */
export function parseMusic(title: string): string {
  let s = title;

  s = normalizeWidth(s);
  s = trimSpace(s);

  s = stripMusicSceneTags(s);
  s = trimSpace(s);

  s = normalizeMusicSeparators(s);
  s = trimSpace(s);

  s = stripMetadataBrackets(s);
  s = trimSpace(s);

  // Disc numbers identify discs of the same album, not different albums
  s = s.replace(musicDiscRegex, "");
  s = trimSpace(s);

  s = stripLeadingArticle(s);
  s = trimSpace(s);

  s = stripTrailingArticle(s);
  s = trimSpace(s);

  s = s.replace(multipleSpacesRegex, " ");
  s = trimSpace(s);

  return s;
}

/**
 * stripMusicSceneTags removes format, quality, source and disc tags and a
 * trailing release group from music filenames.
 */
export function stripMusicSceneTags(s: string): string {
  s = trimSpace(s.replace(musicFormatRegex, ""));
  s = trimSpace(s.replace(musicQualityRegex, ""));
  s = trimSpace(s.replace(musicSourceRegex, ""));
  s = trimSpace(s.replace(musicDiscRegex, ""));
  s = trimSpace(s.replace(sceneGroupRegex, ""));
  return s;
}

function normalizeMusicSeparators(s: string): string {
  s = normalizeDotSeparators(s);
  s = trimSpace(s);

  s = s.split("_").join(" ");
  s = trimSpace(s);

  s = s.split("-").join(" ");
  s = trimSpace(s);

  return s;
}
