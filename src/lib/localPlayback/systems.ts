import { slugify, type MediaType } from "@/lib/slugs";

/**
 * The media systems from Core's `systemdefs`, the only ones the app can play
 * itself. IDs, aliases, slugs, media types and fallbacks are copied from Core
 * so `@System/Title` names the same system here as on the device.
 *
 * Local files are indexed under the three base systems, the same ones Core's
 * own media scanners use: Audio, Video and Image. Every other media system
 * reaches them through its fallbacks.
 */

export type LocalSystemId = "Audio" | "Video" | "Image";

export interface MediaSystem {
  id: string;
  aliases?: string[];
  slugs?: string[];
  mediaType: MediaType;
  fallbacks?: LocalSystemId[];
}

export const MEDIA_SYSTEMS: readonly MediaSystem[] = [
  { id: "Video", slugs: ["videos", "videofile"], mediaType: "Video" },
  { id: "Audio", slugs: ["audiofile"], mediaType: "Audio" },
  {
    id: "Movie",
    slugs: ["movies", "film", "cinema"],
    mediaType: "Movie",
    fallbacks: ["Video"],
  },
  {
    id: "TVEpisode",
    aliases: ["TV"],
    slugs: ["television", "tvchannel"],
    mediaType: "TVShow",
    fallbacks: ["Video"],
  },
  {
    id: "TVSeason",
    slugs: ["tvseasons", "televisionseason", "televisionseasons"],
    mediaType: "TVShow",
    fallbacks: ["Video"],
  },
  {
    id: "TVShow",
    slugs: ["tvshows", "tvseries"],
    mediaType: "TVShow",
    fallbacks: ["Video"],
  },
  {
    id: "MusicTrack",
    aliases: ["Music"],
    slugs: ["musicfile", "song", "songs"],
    mediaType: "Music",
    fallbacks: ["Audio"],
  },
  {
    id: "MusicArtist",
    slugs: ["musician", "musicians", "band", "bands"],
    mediaType: "Music",
    fallbacks: ["Audio"],
  },
  {
    id: "MusicAlbum",
    slugs: ["lp", "album", "albums"],
    mediaType: "Music",
    fallbacks: ["Audio"],
  },
  {
    id: "MusicVideo",
    slugs: ["musicvideos"],
    mediaType: "Music",
    fallbacks: ["Video"],
  },
  {
    id: "PodcastSeries",
    slugs: ["podcastshow", "podcastshows"],
    mediaType: "Audio",
    fallbacks: ["Audio"],
  },
  {
    id: "PodcastEpisode",
    slugs: ["podcastepisodes"],
    mediaType: "Audio",
    fallbacks: ["Audio"],
  },
  {
    id: "Audiobook",
    slugs: ["audiobooks"],
    mediaType: "Audio",
    fallbacks: ["Audio"],
  },
  {
    id: "Image",
    slugs: ["picture", "pictures", "photo", "photos", "images"],
    mediaType: "Image",
  },
];

let lookupMap: Map<string, MediaSystem> | undefined;

function buildLookupMap(): Map<string, MediaSystem> {
  const map = new Map<string, MediaSystem>();
  const add = (key: string, system: MediaSystem) => {
    if (key !== "" && !map.has(key)) map.set(key, system);
  };
  for (const system of MEDIA_SYSTEMS) {
    add(system.id.toLowerCase(), system);
    for (const alias of system.aliases ?? []) add(alias.toLowerCase(), system);
    add(slugify("Game", system.id), system);
    for (const alias of system.aliases ?? []) {
      add(slugify("Game", alias), system);
    }
    for (const slug of system.slugs ?? []) add(slug, system);
  }
  return map;
}

/**
 * Core's `LookupSystem` limited to media systems: a case-insensitive match on
 * ID, alias or slug, then the same match on the input slugified as a game
 * title. Returns undefined for any system the app cannot play.
 */
export function lookupMediaSystem(name: string): MediaSystem | undefined {
  lookupMap ??= buildLookupMap();
  const lower = name.toLowerCase();
  const direct = lookupMap.get(lower);
  if (direct) return direct;
  const slug = slugify("Game", name);
  return slug !== lower ? lookupMap.get(slug) : undefined;
}

/** The base systems a system's titles are matched against, in order. */
export function localSystemsFor(system: MediaSystem): LocalSystemId[] {
  if (system.id === "Audio" || system.id === "Video" || system.id === "Image") {
    return [system.id];
  }
  return system.fallbacks ?? [];
}

export const LOCAL_SYSTEM_MEDIA_TYPE: Record<LocalSystemId, MediaType> = {
  Audio: "Audio",
  Video: "Video",
  Image: "Image",
};
