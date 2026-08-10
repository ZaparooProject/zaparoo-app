import type { System } from "@/lib/models";
import { compareStrings } from "@/lib/utils";

const PRIORITY_CATEGORIES = ["Nintendo", "Sony", "Sega", "Atari"];
const FALLBACK_CATEGORY = "Other";

export type SystemReleasePeriod =
  | "any"
  | "before-1980"
  | "1980s"
  | "1990s"
  | "2000s"
  | "2010s"
  | "2020s";

export type SystemSort = "name-asc" | "name-desc" | "year-asc" | "year-desc";

export interface FilteredSystemCatalog {
  categories: string[];
  systems: System[];
}

export function systemHasIndexedMedia(
  system: Pick<System, "mediaCount">,
): boolean {
  return system.mediaCount === undefined || system.mediaCount > 0;
}

export function systemReleaseYear(system: Pick<System, "releaseDate">) {
  const year = system.releaseDate?.match(/\b\d{4}\b/)?.[0];
  return year ? Number.parseInt(year, 10) : null;
}

export function systemSubtitle(
  system: Pick<System, "manufacturer" | "releaseDate">,
): string {
  const manufacturer = system.manufacturer?.trim() ?? "";
  const releaseDate = system.releaseDate?.trim() ?? "";
  const releaseYear = systemReleaseYear(system)?.toString() ?? releaseDate;

  return [manufacturer, releaseYear].filter(Boolean).join(" · ");
}

export function systemManufacturers(systems: System[]): string[] {
  return Array.from(
    new Set(
      systems
        .map((system) => system.manufacturer?.trim())
        .filter((manufacturer): manufacturer is string =>
          Boolean(manufacturer),
        ),
    ),
  ).sort(compareStrings);
}

function matchesReleasePeriod(
  system: System,
  releasePeriod: SystemReleasePeriod,
) {
  if (releasePeriod === "any") return true;
  const year = systemReleaseYear(system);
  if (year === null) return false;

  switch (releasePeriod) {
    case "before-1980":
      return year < 1980;
    case "1980s":
      return year >= 1980 && year < 1990;
    case "1990s":
      return year >= 1990 && year < 2000;
    case "2000s":
      return year >= 2000 && year < 2010;
    case "2010s":
      return year >= 2010 && year < 2020;
    case "2020s":
      return year >= 2020 && year < 2030;
  }
}

function compareSystems(a: System, b: System, sort: SystemSort) {
  if (sort === "name-asc") return compareStrings(a.name, b.name);
  if (sort === "name-desc") return compareStrings(b.name, a.name);

  const aYear = systemReleaseYear(a);
  const bYear = systemReleaseYear(b);
  if (aYear === null && bYear === null) return compareStrings(a.name, b.name);
  if (aYear === null) return 1;
  if (bYear === null) return -1;
  if (aYear === bYear) return compareStrings(a.name, b.name);
  return sort === "year-asc" ? aYear - bYear : bYear - aYear;
}

export function filterSystemCatalog(
  systems: System[],
  options: {
    allowedSystemIds?: string[];
    includeEmptySystems?: boolean;
    category: string;
    manufacturer?: string;
    query: string;
    releasePeriod?: SystemReleasePeriod;
    sort?: SystemSort;
  },
): FilteredSystemCatalog {
  const allowedSystemIds = options.allowedSystemIds
    ? new Set(options.allowedSystemIds)
    : null;
  const systemsWithMedia = options.includeEmptySystems
    ? systems
    : systems.filter(systemHasIndexedMedia);
  const availableSystems = allowedSystemIds
    ? systemsWithMedia.filter((system) => allowedSystemIds.has(system.id))
    : systemsWithMedia;
  const categories = Array.from(
    new Set(
      availableSystems.map((system) => system.category || FALLBACK_CATEGORY),
    ),
  ).sort((a, b) => {
    const aPriority = PRIORITY_CATEGORIES.indexOf(a);
    const bPriority = PRIORITY_CATEGORIES.indexOf(b);

    if (aPriority !== -1 && bPriority !== -1) return aPriority - bPriority;
    if (aPriority !== -1) return -1;
    if (bPriority !== -1) return 1;
    return compareStrings(a, b);
  });

  const normalizedQuery = options.query.trim().toLowerCase();
  const manufacturer = options.manufacturer?.trim() ?? "";
  const releasePeriod = options.releasePeriod ?? "any";
  const sort = options.sort ?? "name-asc";
  const filteredSystems = availableSystems
    .filter(
      (system) =>
        options.category === "all" ||
        (system.category || FALLBACK_CATEGORY) === options.category,
    )
    .filter(
      (system) =>
        normalizedQuery.length === 0 ||
        system.name.toLowerCase().includes(normalizedQuery) ||
        system.id.toLowerCase().includes(normalizedQuery),
    )
    .filter(
      (system) =>
        manufacturer === "" || system.manufacturer?.trim() === manufacturer,
    )
    .filter((system) => matchesReleasePeriod(system, releasePeriod))
    .sort((a, b) => compareSystems(a, b, sort));

  return { categories, systems: filteredSystems };
}
