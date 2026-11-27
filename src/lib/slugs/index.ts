/**
 * TypeScript port of go-slugs: the titles and slugs Zaparoo Core gives media
 * files, so the app can match Core's index without a round trip.
 */
export {
  MediaTypeApplication,
  MediaTypeAudio,
  MediaTypeGame,
  MediaTypeImage,
  MediaTypeMovie,
  MediaTypeMusic,
  MediaTypeTVShow,
  MediaTypeVideo,
  slugify,
  slugifyQueryWords,
  slugifyWithTokens,
  type MediaType,
  type SlugifyResult,
} from "./slugify";
export * as browseprefix from "./browseprefix";
export * as filetitle from "./filetitle";
export { splitTitle, stripLeadingArticle } from "./slugHelpers";
export { parse as parseFileTitle } from "./filetitle";
export {
  DefaultMinFiles as DEFAULT_MIN_FILES,
  DefaultThreshold as DEFAULT_THRESHOLD,
  detectPolicyForPaths,
  stripWithPolicy,
} from "./browseprefix";
