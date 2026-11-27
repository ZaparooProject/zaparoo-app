import type { CatalogEntry, LocalPlatform } from "./catalog";
import { extensionOf, systemForExtension } from "./catalog";
import { matchPath, matchTitle } from "./match";
import { lookupMediaSystem, type LocalSystemId } from "./systems";
import { requestedTarget, splitTraits, type PlaybackTarget } from "./traits";

/**
 * Works out whether a token can play in the app, and what it would play.
 *
 * Only a token that is a single launch can play here: `@System/Title`,
 * `**launch.title:System/Title`, a bare `System/Title`, a file path, or an
 * http(s) media URL, plus any trait segments. Anything else (commands,
 * multi-step scripts, game systems) belongs to the device.
 */

export type LocalRequest =
  | { kind: "title"; systemName: string; title: string }
  | { kind: "path"; path: string }
  | { kind: "url"; url: string; system: LocalSystemId };

export interface ParsedToken {
  target: PlaybackTarget | undefined;
  /** Null when the token is not something the app could play. */
  request: LocalRequest | null;
}

export interface LocalMatch {
  system: LocalSystemId;
  /** Title shown while playing. */
  title: string;
  uri: string;
  /** Set when the match came from the local catalog. */
  entry?: CatalogEntry;
}

/** ZapScript `^` escapes, as go-zapscript's `parseEscapeSeq` reads them. */
function unescape(text: string): string {
  return text.replace(/\^(.)/gs, (_, ch: string) =>
    ch === "n" ? "\n" : ch === "t" ? "\t" : ch === "r" ? "\r" : ch,
  );
}

/** Index of the first unescaped `?` that starts advanced arguments. */
function advArgsStart(text: string): number {
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "^") {
      i++;
      continue;
    }
    if (text[i] === "?" && /^[A-Za-z0-9_]+(?:[=&]|$)/.test(text.slice(i + 1))) {
      return i;
    }
  }
  return -1;
}

const TAG_FILTER_GROUP = /\(\s*[+~-]?[A-Za-z][A-Za-z0-9_-]*:[^)]+\)/;

function parseTitle(content: string): LocalRequest | null {
  const argsAt = advArgsStart(content);
  const body = argsAt === -1 ? content : content.slice(0, argsAt);
  const args = argsAt === -1 ? "" : content.slice(argsAt + 1);
  // Tag filters need tag data the local catalog doesn't keep, so a filtered
  // title is left to the device rather than matched without its filter.
  if (/(?:^|&)tags=/i.test(args) || TAG_FILTER_GROUP.test(body)) return null;
  const text = unescape(body);
  const slash = text.indexOf("/");
  if (slash <= 0) return null;
  const systemName = text.slice(0, slash).trim();
  const title = text.slice(slash + 1).trim();
  if (systemName === "" || title === "") return null;
  return { kind: "title", systemName, title };
}

function parseLaunch(
  value: string,
  platform: LocalPlatform,
): LocalRequest | null {
  const argsAt = advArgsStart(value);
  const target = unescape(
    argsAt === -1 ? value : value.slice(0, argsAt),
  ).trim();
  if (target === "") return null;
  if (/^https?:\/\//i.test(target)) {
    let pathname: string;
    try {
      pathname = new URL(target).pathname;
    } catch {
      return null;
    }
    const ext = extensionOf(pathname);
    // HLS streams only play in the native players.
    const system =
      ext === "m3u8"
        ? platform === "web"
          ? undefined
          : "Video"
        : systemForExtension(ext, platform);
    return system ? { kind: "url", url: target, system } : null;
  }
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(target)) return null;
  if (systemForExtension(extensionOf(target), platform)) {
    return { kind: "path", path: target };
  }
  // Core's `mightBeTitle`: System/Title without wildcards or backslashes.
  const slash = target.indexOf("/");
  if (slash > 0 && !/[*\\]/.test(target)) {
    return parseTitle(target);
  }
  return null;
}

export function parseToken(text: string, platform: LocalPlatform): ParsedToken {
  const { commands, traits } = splitTraits(text);
  const target = requestedTarget(traits);
  if (commands.length !== 1) return { target, request: null };
  const command = commands[0]!;

  if (command.startsWith("@")) {
    return { target, request: parseTitle(command.slice(1)) };
  }
  const named = /^\*\*([A-Za-z0-9.]+)(?::|$)/.exec(command);
  if (named) {
    const name = named[1]!.toLowerCase();
    const value = command.slice(named[0].length);
    if (name === "launch.title") return { target, request: parseTitle(value) };
    if (name === "launch") {
      return { target, request: parseLaunch(value, platform) };
    }
    return { target, request: null };
  }
  // `*name` is an auto-launch that keeps its star, which no file title has.
  if (command.startsWith("*") || command.startsWith("{")) {
    return { target, request: null };
  }
  return { target, request: parseLaunch(command, platform) };
}

export function findLocalMatch(
  request: LocalRequest,
  catalog: CatalogEntry[],
): LocalMatch | null {
  switch (request.kind) {
    case "url": {
      const rawLeaf = new URL(request.url).pathname.split("/").pop() ?? "";
      let leaf = rawLeaf;
      try {
        leaf = decodeURIComponent(rawLeaf);
      } catch {
        // Keep the encoded name.
      }
      return {
        system: request.system,
        title: leaf.replace(/\.[^.]+$/, "") || request.url,
        uri: request.url,
      };
    }
    case "path": {
      const entry = matchPath(catalog, request.path);
      return entry ? fromEntry(entry) : null;
    }
    case "title": {
      const system = lookupMediaSystem(request.systemName);
      if (!system) return null;
      const entry = matchTitle(catalog, system, request.title);
      return entry ? fromEntry(entry) : null;
    }
  }
}

function fromEntry(entry: CatalogEntry): LocalMatch {
  return {
    system: entry.system,
    title: entry.title || entry.name,
    uri: entry.file.uri,
    entry,
  };
}
