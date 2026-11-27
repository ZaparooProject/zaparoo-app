import { slugifyWithTokens } from "@/lib/slugs";
import { titleParts, type CatalogEntry } from "./catalog";
import {
  LOCAL_SYSTEM_MEDIA_TYPE,
  localSystemsFor,
  type MediaSystem,
} from "./systems";

/**
 * Matches `@System/Title` against the local catalog with the parts of Core's
 * title cascade (`titles.ResolveTitle`) that apply to media files, in Core's
 * order: exact slug, subtitle on either side, word order, main title or word
 * prefix, then trimming trailing words. Each base system the title's system
 * falls back to is tried in turn, with that system's slug rules, as Core's
 * `cmdTitle` does.
 *
 * Game-only steps are left out: region, language, variant and re-release
 * ranking, launcher priority and container promotion. Jaro-Winkler typo
 * matching is also left out, so a misspelled title goes to the device rather
 * than playing a near miss.
 */

const MIN_SIGNATURE_SLUG = 5;
const MIN_TRIM_WORDS = 3;
const MAX_TRIM_DEPTH = 3;
const MIN_TRIM_SLUG = 6;

/** Core's `matcher.SameTitleNumbers`: digit runs agree, a lone 1 ignored. */
export function sameTitleNumbers(a: string, b: string): boolean {
  const canonical = (s: string) =>
    (s.match(/[0-9]+/g) ?? [])
      .map((run) => run.replace(/^0+(?=.)/, ""))
      .filter((run) => run !== "1")
      .join(",");
  return canonical(a) === canonical(b);
}

function isTokenPrefix(query: string[], candidate: string[]): boolean {
  if (query.length === 0 || candidate.length <= query.length) return false;
  return query.every((token, i) => candidate[i] === token);
}

function signature(tokens: string[]): string {
  return [...tokens].sort().join("_");
}

/** Core's `selectByQualityScore` tiebreak for files that match equally. */
function compareQuality(a: CatalogEntry, b: CatalogEntry): number {
  const copy = (e: CatalogEntry) =>
    /\(\d+\)$|\bcopy$/i.test(e.name.trim()) ? 1 : 0;
  const messy = (e: CatalogEntry) =>
    (e.name.match(/__/g)?.length ?? 0) +
    (e.name.includes("-") && e.name.includes("_") ? 1 : 0);
  return (
    copy(a) - copy(b) ||
    a.depth - b.depth ||
    messy(a) - messy(b) ||
    a.name.length - b.name.length ||
    a.file.path.localeCompare(b.file.path)
  );
}

function best(entries: CatalogEntry[]): CatalogEntry | undefined {
  return entries.length === 0
    ? undefined
    : [...entries].sort(compareQuality)[0];
}

function matchInSystem(
  entries: CatalogEntry[],
  title: string,
): CatalogEntry | undefined {
  if (entries.length === 0) return undefined;
  const mediaType = LOCAL_SYSTEM_MEDIA_TYPE[entries[0]!.system];
  const { slug, tokens } = slugifyWithTokens(mediaType, title);
  if (slug === "") return undefined;
  const query = titleParts(mediaType, title);

  const exact = entries.filter((e) => e.slug === slug);
  if (exact.length > 0) return best(exact);

  // Subtitle on one side only: "Ocarina of Time" ↔ "Zelda: Ocarina of Time",
  // and for audio "Bohemian Rhapsody" ↔ "Queen - Bohemian Rhapsody".
  const secondary = entries.filter((e) =>
    query.hasSecondary
      ? !e.hasSecondary && e.slug === query.secondarySlug
      : e.hasSecondary && e.secondarySlug === slug,
  );
  if (secondary.length > 0) return best(secondary);

  if (slug.length >= MIN_SIGNATURE_SLUG) {
    const wanted = signature(tokens);
    const reordered = entries.filter((e) => signature(e.tokens) === wanted);
    if (reordered.length > 0) return best(reordered);
  }

  const mainExact = entries.filter(
    (e) => !e.hasSecondary && e.slug === query.mainSlug,
  );
  if (mainExact.length > 0) return best(mainExact);
  const mainPartial = entries.filter((e) => {
    if (!query.hasSecondary && e.hasSecondary) {
      return (
        e.mainSlug.startsWith(query.mainSlug) &&
        sameTitleNumbers(query.mainSlug, e.mainSlug)
      );
    }
    if (query.hasSecondary && e.hasSecondary) {
      return e.mainSlug.startsWith(slug) && sameTitleNumbers(slug, e.mainSlug);
    }
    if (!query.hasSecondary && !e.hasSecondary) {
      return (
        sameTitleNumbers(query.mainSlug, e.mainSlug) &&
        isTokenPrefix(tokens, e.tokens)
      );
    }
    return false;
  });
  if (mainPartial.length > 0) return best(mainPartial);

  if (tokens.length >= MIN_TRIM_WORDS) {
    const trimmed = new Set<string>();
    for (let drop = 1; drop <= MAX_TRIM_DEPTH; drop++) {
      if (tokens.length - drop < 1) break;
      const candidate = tokens.slice(0, tokens.length - drop).join("");
      if (candidate.length < MIN_TRIM_SLUG) break;
      if (sameTitleNumbers(candidate, slug)) trimmed.add(candidate);
    }
    const hits = entries.filter((e) => trimmed.has(e.slug));
    if (hits.length > 0) return best(hits);
  }

  return undefined;
}

export function matchTitle(
  catalog: CatalogEntry[],
  system: MediaSystem,
  title: string,
): CatalogEntry | undefined {
  for (const localSystem of localSystemsFor(system)) {
    const inSystem = catalog.filter((e) => e.system === localSystem);
    // A file's own title wins over its other prefix form.
    const hit =
      matchInSystem(
        inSystem.filter((e) => !e.alias),
        title,
      ) ??
      matchInSystem(
        inSystem.filter((e) => e.alias),
        title,
      );
    if (hit) return hit;
  }
  return undefined;
}

/**
 * Matches a file path written for the device (`/media/fat/music/song.mp3`,
 * `Audio/song.mp3`) by its file name, so cards written from the Core library
 * also play locally when the same file is on this device.
 */
export function matchPath(
  catalog: CatalogEntry[],
  path: string,
): CatalogEntry | undefined {
  const leaf = path.replace(/\\/g, "/").split("/").pop()?.toLowerCase() ?? "";
  if (leaf === "") return undefined;
  return best(
    catalog.filter(
      (e) =>
        !e.alias && (e.file.path.split("/").pop() ?? "").toLowerCase() === leaf,
    ),
  );
}
