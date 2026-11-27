/**
 * Media-type dispatch for title parsing. Ported from go-slugs
 * media_parsing.go.
 */
import { parseGame } from "./mediaParsingGame";
import { parseMovie } from "./mediaParsingMovie";
import { parseMusic } from "./mediaParsingMusic";
import { parseTVShow } from "./mediaParsingTv";
import {
  MediaTypeGame,
  MediaTypeMovie,
  MediaTypeMusic,
  MediaTypeTVShow,
  type MediaType,
} from "./slugify";

/**
 * parseWithMediaType applies media-specific normalization before the
 * universal pipeline. Audio, Video, Image and Application titles pass
 * through unchanged.
 */
export function parseWithMediaType(
  mediaType: MediaType,
  title: string,
): string {
  switch (mediaType) {
    case MediaTypeTVShow:
      return parseTVShow(title);
    case MediaTypeGame:
      return parseGame(title);
    case MediaTypeMovie:
      return parseMovie(title);
    case MediaTypeMusic:
      return parseMusic(title);
    default:
      return title;
  }
}
