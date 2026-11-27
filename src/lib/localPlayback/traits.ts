/**
 * Reads the playback routing traits from a ZapScript token.
 *
 * Traits are ZapScript's own `#key` / `#key=value` segments and the
 * `**traits:{...}` command, each a separate `||` segment. Only `#app` and
 * `#device` matter here: `#app` plays the token in the Zaparoo App that
 * scanned it and `#device` sends it to the connected Core. Both are booleans,
 * so `#app=false` asks for the device. A token that declares both with
 * contradicting meanings is treated as declaring neither, the same rule Core
 * applies to `#tap` and `#hold`.
 */

export type PlaybackTarget = "app" | "device";

export interface SplitScript {
  /** The script with trait segments removed, `||`-joined. */
  commands: string[];
  /** Normalized trait keys mapped to their parsed values. */
  traits: Record<string, unknown>;
}

const TRAIT_KEY = /^[A-Za-z][A-Za-z0-9_]*$/;

/** Splits on top-level `||`, leaving quoted text and `^` escapes intact. */
export function splitSegments(text: string): string[] {
  const segments: string[] = [];
  let start = 0;
  let quote: string | null = null;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === "^") {
      i++;
      continue;
    }
    if (quote) {
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      // Quotes only group inside a trait value (`#name="a||b"`).
      const before = text.slice(start, i);
      if (/#[A-Za-z][A-Za-z0-9_]*=$/.test(before)) quote = ch;
      continue;
    }
    if (ch === "|" && text[i + 1] === "|") {
      segments.push(text.slice(start, i));
      start = i + 2;
      i++;
    }
  }
  segments.push(text.slice(start));
  return segments;
}

function parseValue(raw: string): unknown {
  if (raw.length >= 2 && (raw[0] === '"' || raw[0] === "'")) {
    return raw.slice(1, raw.endsWith(raw[0]!) ? -1 : undefined);
  }
  const lower = raw.toLowerCase();
  if (lower === "true") return true;
  if (lower === "false") return false;
  if (/^-?\d+$/.test(raw)) return Number(raw);
  if (/^-?\d*\.\d+$/.test(raw)) return Number(raw);
  return raw;
}

/** Parses a `#a #b=1` segment, or returns null when it is not all traits. */
function parseTraitSegment(segment: string): Record<string, unknown> | null {
  const tokens = segment.trim().match(/#[^\s"']*(?:"[^"]*"|'[^']*')?\S*/g);
  if (!tokens || tokens.join("").replace(/\s/g, "") === "") return null;
  const rebuilt = tokens.join(" ").replace(/\s+/g, " ");
  if (rebuilt !== segment.trim().replace(/\s+/g, " ")) return null;
  const traits: Record<string, unknown> = {};
  for (const token of tokens) {
    const body = token.slice(1);
    const eq = body.indexOf("=");
    const key = eq === -1 ? body : body.slice(0, eq);
    if (!TRAIT_KEY.test(key)) return null;
    traits[key.toLowerCase()] =
      eq === -1 ? true : parseValue(body.slice(eq + 1));
  }
  return traits;
}

function parseTraitsCommand(segment: string): Record<string, unknown> | null {
  const match = /^\*\*traits:(.*)$/is.exec(segment.trim());
  if (!match) return null;
  try {
    const parsed: unknown = JSON.parse(match[1]!);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }
    const traits: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (TRAIT_KEY.test(key)) traits[key.toLowerCase()] = value;
    }
    return traits;
  } catch {
    return null;
  }
}

export function splitTraits(text: string): SplitScript {
  const commands: string[] = [];
  const traits: Record<string, unknown> = {};
  for (const segment of splitSegments(text)) {
    const trimmed = segment.trim();
    if (trimmed === "") continue;
    const parsed = trimmed.startsWith("#")
      ? parseTraitSegment(trimmed)
      : parseTraitsCommand(trimmed);
    if (parsed) {
      Object.assign(traits, parsed);
    } else {
      commands.push(trimmed);
    }
  }
  return { commands, traits };
}

// Core reads only these words as booleans (boolutil.IsTruthy / IsFalsey).
const TRUTHY = new Set(["true", "yes"]);
const FALSEY = new Set(["false", "no"]);

function readBool(value: unknown): boolean | undefined {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    const lower = value.toLowerCase();
    if (TRUTHY.has(lower)) return true;
    if (FALSEY.has(lower)) return false;
  }
  return undefined;
}

/** The target a token asked for with `#app` / `#device`, if any. */
export function requestedTarget(
  traits: Record<string, unknown>,
): PlaybackTarget | undefined {
  const app = readBool(traits.app);
  const device = readBool(traits.device);
  if (app !== undefined && device !== undefined) {
    if (app === device) return undefined;
    return app ? "app" : "device";
  }
  if (app !== undefined) return app ? "app" : "device";
  if (device !== undefined) return device ? "device" : "app";
  return undefined;
}
