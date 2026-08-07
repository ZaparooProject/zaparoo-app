import type { TagInfo } from "@/lib/models";

export interface ParsedTitleZapScript {
  base: string;
  suffix: string;
  tags: TagInfo[];
}

const TAG_TYPE_PATTERN = /^[A-Za-z][A-Za-z0-9_-]*$/;
const TAG_VALUE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9:_-]*$/;
const TRAILING_GROUP_PATTERN = /\s+\(([^()]*)\)/g;

export function titleTagKey(tag: TagInfo): string {
  return `${tag.type}\u0000${tag.tag}`;
}

function isValidTag(tag: TagInfo): boolean {
  return TAG_TYPE_PATTERN.test(tag.type) && TAG_VALUE_PATTERN.test(tag.tag);
}

function parseTagGroup(value: string): TagInfo[] | null {
  const tags: TagInfo[] = [];

  for (const entry of value.split(",")) {
    const trimmed = entry.trim();
    const separatorIndex = trimmed.indexOf(":");
    if (separatorIndex <= 0) return null;

    const rawType = trimmed.slice(0, separatorIndex);
    const type = rawType.startsWith("+") ? rawType.slice(1) : rawType;
    const tag = trimmed.slice(separatorIndex + 1);
    const parsedTag = { type, tag };

    if (!isValidTag(parsedTag)) return null;
    tags.push(parsedTag);
  }

  return tags.length > 0 ? tags : null;
}

function findUnescapedCharacter(value: string, character: string): number {
  for (let index = 0; index < value.length; index += 1) {
    if (value[index] === "^") {
      index += 1;
      continue;
    }
    if (value[index] === character) return index;
  }
  return -1;
}

export function parseTitleZapScript(
  zapScript: string,
): ParsedTitleZapScript | null {
  if (!zapScript.startsWith("@") || zapScript.includes("||")) return null;

  const queryIndex = findUnescapedCharacter(zapScript, "?");
  const command =
    queryIndex === -1 ? zapScript : zapScript.slice(0, queryIndex);
  const suffix = queryIndex === -1 ? "" : zapScript.slice(queryIndex);

  // Advanced tag arguments have their own precedence rules and cannot be
  // represented safely by the modal's simple on/off tag controls.
  if (/(?:^\?|&)tags=/i.test(suffix)) return null;

  const matches = Array.from(command.matchAll(TRAILING_GROUP_PATTERN));
  const parsedGroups: TagInfo[][] = [];
  let groupStart = command.length;
  let cursor = command.length;

  for (let index = matches.length - 1; index >= 0; index -= 1) {
    const match = matches[index];
    if (!match) continue;

    const matchIndex = match.index;
    const groupValue = match[1];
    if (matchIndex === undefined || groupValue === undefined) continue;

    const matchEnd = matchIndex + match[0].length;
    if (command.slice(matchEnd, cursor).trim().length > 0) break;

    const tags = parseTagGroup(groupValue);
    if (!tags) break;

    parsedGroups.unshift(tags);
    groupStart = matchIndex;
    cursor = matchIndex;
  }

  const base = command.slice(0, groupStart).trimEnd();
  const separatorIndex = findUnescapedCharacter(base, "/");
  if (
    separatorIndex <= 1 ||
    base.slice(separatorIndex + 1).trim().length === 0
  ) {
    return null;
  }

  return {
    base,
    suffix,
    tags: parsedGroups.flat(),
  };
}

export function buildTitleZapScript(
  parsed: ParsedTitleZapScript,
  tags: TagInfo[],
): string {
  const valuesByType = new Map<string, string[]>();
  const seenTags = new Set<string>();

  for (const tag of tags) {
    if (!isValidTag(tag)) continue;

    const key = titleTagKey(tag);
    if (seenTags.has(key)) continue;
    seenTags.add(key);

    const values = valuesByType.get(tag.type) ?? [];
    values.push(tag.tag);
    valuesByType.set(tag.type, values);
  }

  const groups = Array.from(valuesByType, ([type, values]) =>
    values.map((value) => `${type}:${value}`).join(", "),
  );
  const tagSuffix = groups.length > 0 ? ` (${groups.join(") (")})` : "";

  return `${parsed.base}${tagSuffix}${parsed.suffix}`;
}
