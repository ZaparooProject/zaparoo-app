/**
 * Movie title parsing. Ported from go-slugs media_parsing_movie.go.
 */
import { goRegExp } from "./goRegexp";
import { trimSpace } from "./goStrings";
import {
  normalizeDotSeparators,
  scene3DRegex,
  sceneAudioRegex,
  sceneCodecRegex,
  sceneGroupRegex,
  sceneHDRRegex,
  sceneQualityRegex,
  sceneSourceRegex,
  splitAndStripArticles,
  stripMetadataBrackets,
  stripTrailingArticle,
} from "./slugHelpers";
import { normalizeWidth } from "./slugify";

// Strips meaningless trailing suffix words while preserving the qualifiers
// (Director's, Extended, Theatrical) that identify the specific edition, since
// those are different products users may want to target.
const movieEditionSuffixPattern = goRegExp(
  String.raw`(?i)\s+(edition|version|cut|release)$`,
  true,
);

const movieSceneTagsRegex = goRegExp(
  String.raw`(?i)\b(proper|repack|internal|limited|multi|korsub)\b`,
  true,
);

/**
 * parseMovie normalizes movie titles: strips scene release tags, edition
 * suffixes, metadata brackets (years are extracted as tags elsewhere) and
 * articles.
 *
 * Examples:
 *   - "The.Matrix.1999.1080p.BluRay.x264.DTS-WAF" → "Matrix 1999"
 *   - "Movie Name (2024) Director's Cut Edition" → "Movie Name Director's"
 */
export function parseMovie(title: string): string {
  let s = title;

  s = normalizeWidth(s);
  s = trimSpace(s);

  s = stripMovieSceneTags(s);
  s = trimSpace(s);

  s = normalizeDotSeparators(s);
  s = trimSpace(s);

  s = stripEditionMarkers(s);
  s = trimSpace(s);

  s = stripMetadataBrackets(s);
  s = trimSpace(s);

  s = splitAndStripArticles(s);
  s = trimSpace(s);

  s = stripTrailingArticle(s);
  s = trimSpace(s);

  return s;
}

// stripEditionMarkers repeats until stable so stacked suffixes like
// "Director's Cut Edition" → "Director's" are all removed.
function stripEditionMarkers(s: string): string {
  for (;;) {
    const before = s;
    s = s.replace(movieEditionSuffixPattern, "");
    s = trimSpace(s);
    if (s === before) {
      break;
    }
  }
  return s;
}

/**
 * stripMovieSceneTags removes scene release tags from movie filenames:
 * quality, source, codec, audio, HDR, 3D, misc tags and a trailing release
 * group.
 */
export function stripMovieSceneTags(s: string): string {
  s = trimSpace(s.replace(sceneQualityRegex, ""));
  s = trimSpace(s.replace(sceneSourceRegex, ""));
  s = trimSpace(s.replace(sceneCodecRegex, ""));
  s = trimSpace(s.replace(sceneAudioRegex, ""));
  s = trimSpace(s.replace(sceneHDRRegex, ""));
  s = trimSpace(s.replace(scene3DRegex, ""));
  s = trimSpace(s.replace(movieSceneTagsRegex, ""));
  s = trimSpace(s.replace(sceneGroupRegex, ""));
  return s;
}
