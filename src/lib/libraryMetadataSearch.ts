// Other routes retain unvalidated query keys in shared link types.
export interface LibraryMetadataSearch extends Record<string, unknown> {
  system?: string;
  tag?: string;
}

export function validateLibraryMetadataSearch(
  search: Record<string, unknown>,
): LibraryMetadataSearch {
  const system =
    typeof search.system === "string" && search.system.trim()
      ? search.system
      : undefined;
  const rawTag = typeof search.tag === "string" ? search.tag : "";
  const separator = rawTag.indexOf(":");
  const tag =
    separator > 0 && separator < rawTag.length - 1 ? rawTag : undefined;
  return { ...(system ? { system } : {}), ...(tag ? { tag } : {}) };
}
