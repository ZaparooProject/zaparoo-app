import { parseTitleZapScript } from "@/lib/titleZapScript";

export type DeckArtworkTarget =
  | { kind: "title"; system: string; name: string }
  | { kind: "path"; system: string; path: string };

// Artwork recognizes single, static launch targets only; it never runs scripts.
export function deckArtworkTarget(
  script: string | undefined,
): DeckArtworkTarget | null {
  if (!script?.trim() || script.includes("||")) return null;
  const text = script.trim();
  const title = text.startsWith("@") || text.startsWith("**launch.title:");
  let argument = title
    ? text.replace(/^(?:@|\*\*launch\.title:)/, "")
    : text.replace(/^\*\*launch:/, "");
  if (argument.startsWith("**")) return null;

  let raw = "";
  let quoted = false;
  for (let index = 0; index < argument.length; index++) {
    const char = argument[index]!;
    if (char === "^") {
      const next = argument[++index];
      if (!next || /[nrt]/.test(next)) return null;
      raw += `^${next}`;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "?" && !quoted) {
      break;
    } else if (char === "[" || char === "]" || /[\r\n\t]/.test(char)) {
      return null;
    } else {
      raw += char;
    }
  }
  if (quoted) return null;
  if (title) raw = parseTitleZapScript(`@${raw}`)?.base.slice(1) ?? raw;
  argument = raw.replace(/\^(.)/g, "$1").trim();
  if (!title && (/^\//.test(argument) || /^[A-Za-z]:[\\/]/.test(argument))) {
    return { kind: "path", system: "", path: argument };
  }
  const separator = argument.indexOf("/");
  if (separator <= 0) return null;
  const system = argument.slice(0, separator);
  const value = argument.slice(separator + 1).trim();
  if (!/^[A-Za-z0-9_-]+$/.test(system) || !value || value.startsWith("/"))
    return null;
  return title
    ? { kind: "title", system, name: value }
    : { kind: "path", system, path: argument };
}
