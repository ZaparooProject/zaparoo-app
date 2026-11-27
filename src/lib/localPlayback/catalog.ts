import {
  browseprefix,
  DEFAULT_MIN_FILES,
  DEFAULT_THRESHOLD,
  detectPolicyForPaths,
  parseFileTitle,
  slugifyWithTokens,
  splitTitle,
  stripLeadingArticle,
  stripWithPolicy,
  slugify,
  type MediaType,
} from "@/lib/slugs";
import type { LocalMediaFile } from "@/lib/localMedia";
import { LOCAL_SYSTEM_MEDIA_TYPE, type LocalSystemId } from "./systems";

/**
 * Turns the native file list into matchable entries, naming each file the way
 * Core's media scanner does (`GetPathFragments`): strip the extension, strip a
 * numbered or dated prefix when most files in the folder have one, parse the
 * title with go-slugs `filetitle`, then slugify it for the file's system.
 */

export type LocalPlatform = "ios" | "android" | "web";

const AUDIO = ["mp3", "m4a", "m4b", "aac", "flac", "wav", "aif", "aiff"];
const VIDEO = ["mp4", "m4v", "mov"];
const IMAGE = ["jpg", "jpeg", "png", "gif", "webp", "bmp"];

/** Extensions each platform's player opens, by system. */
export function extensionsFor(
  platform: LocalPlatform,
): Record<LocalSystemId, string[]> {
  if (platform === "android") {
    return {
      Audio: [...AUDIO, "ogg", "oga", "opus", "mka", "wma"],
      Video: [...VIDEO, "mkv", "webm", "3gp"],
      Image: [...IMAGE, "heic", "heif", "avif"],
    };
  }
  if (platform === "ios") {
    return {
      Audio: [...AUDIO, "caf"],
      Video: [...VIDEO],
      Image: [...IMAGE, "heic", "heif"],
    };
  }
  return { Audio: AUDIO, Video: [...VIDEO, "webm"], Image: IMAGE };
}

export function allExtensions(platform: LocalPlatform): string[] {
  const byType = extensionsFor(platform);
  return [...byType.Audio, ...byType.Video, ...byType.Image];
}

export function extensionOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot <= 0 ? "" : name.slice(dot + 1).toLowerCase();
}

export function systemForExtension(
  ext: string,
  platform: LocalPlatform,
): LocalSystemId | undefined {
  const byType = extensionsFor(platform);
  for (const system of ["Audio", "Video", "Image"] as const) {
    if (byType[system].includes(ext)) return system;
  }
  return undefined;
}

export interface CatalogEntry {
  system: LocalSystemId;
  file: LocalMediaFile;
  /** File name without folders or extension. */
  name: string;
  /** Path depth inside its folder, 0 for files at the top. */
  depth: number;
  title: string;
  slug: string;
  tokens: string[];
  /** Slug of the part before a ":" / " - " split, the whole slug otherwise. */
  mainSlug: string;
  /** Slug of the part after a ":" / " - " split, "" when there is none. */
  secondarySlug: string;
  hasSecondary: boolean;
  /**
   * Set on the second entry for a numbered or dated file, matching it under
   * the title its folder's prefix rule didn't pick. `title` stays the one
   * Core would show.
   */
  alias?: true;
}

function dirOf(path: string): string {
  const slash = path.lastIndexOf("/");
  return slash === -1 ? "" : path.slice(0, slash);
}

function baseName(path: string): string {
  const slash = path.lastIndexOf("/");
  return slash === -1 ? path : path.slice(slash + 1);
}

function stripExtension(name: string): string {
  const ext = extensionOf(name);
  return ext === "" ? name : name.slice(0, -(ext.length + 1));
}

export interface TitleParts {
  mainSlug: string;
  secondarySlug: string;
  hasSecondary: boolean;
}

/** Core's `GenerateMatchInfo` main/secondary split of a title. */
export function titleParts(mediaType: MediaType, title: string): TitleParts {
  const [main, secondary, hasSecondary] = splitTitle(
    stripLeadingArticle(title.trim()),
  );
  return {
    mainSlug: slugify(mediaType, main),
    secondarySlug: hasSecondary
      ? slugify(mediaType, stripLeadingArticle(secondary))
      : "",
    hasSecondary,
  };
}

function makeEntry(
  system: LocalSystemId,
  file: LocalMediaFile,
  name: string,
  stem: string,
): CatalogEntry {
  const mediaType = LOCAL_SYSTEM_MEDIA_TYPE[system];
  let title = parseFileTitle(stem, false, mediaType);
  let titleSource = stem;
  if (title === "" && stem !== name) {
    titleSource = name;
    title = parseFileTitle(name, false, mediaType);
  }
  const result = slugifyWithTokens(mediaType, title);
  const slug = result.slug === "" ? titleSource.toLowerCase() : result.slug;
  return {
    system,
    file,
    name,
    depth: file.path.split("/").length - 1,
    title,
    slug,
    tokens: result.tokens,
    ...titleParts(mediaType, title),
  };
}

export function buildCatalog(
  files: LocalMediaFile[],
  platform: LocalPlatform,
): CatalogEntry[] {
  // Core groups files by system and directory before choosing the prefix
  // policy, so a folder mixing songs and cover art decides each separately.
  const groups = new Map<
    string,
    { system: LocalSystemId; files: LocalMediaFile[] }
  >();
  for (const file of files) {
    const system = systemForExtension(extensionOf(file.path), platform);
    if (!system) continue;
    const key = `${system}\u0000${file.folderId}\u0000${dirOf(file.path)}`;
    let group = groups.get(key);
    if (!group) {
      group = { system, files: [] };
      groups.set(key, group);
    }
    group.files.push(file);
  }

  const entries: CatalogEntry[] = [];
  for (const { system, files: groupFiles } of groups.values()) {
    const policy = detectPolicyForPaths(
      groupFiles.map((file) => file.path),
      DEFAULT_THRESHOLD,
      DEFAULT_MIN_FILES,
    );
    for (const file of groupFiles) {
      const name = stripExtension(baseName(file.path));
      const [stripped, didStrip] = stripWithPolicy(name, policy);
      const primary = makeEntry(system, file, name, didStrip ? stripped : name);
      entries.push(primary);
      // Core decides prefixes per folder, so the same file can be titled
      // "01 - Song" here and "Song" on the device. Match the other form too.
      const prefix = browseprefix.parseStem(name);
      if (prefix.kind === browseprefix.KindNone || prefix.rest === "") {
        continue;
      }
      const other = makeEntry(
        system,
        file,
        name,
        didStrip ? name : prefix.rest,
      );
      if (other.slug !== primary.slug) {
        entries.push({ ...other, title: primary.title, alias: true });
      }
    }
  }
  return entries;
}
