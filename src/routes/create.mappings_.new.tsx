import { createFileRoute } from "@tanstack/react-router";
import { MappingEditor } from "@/routes/-pages/MappingEditor";

const PREFILL_TYPES = ["id", "value", "data"] as const;

export interface NewMappingSearch {
  /** Mapping type to start with: "id", "value" or "data". */
  type?: (typeof PREFILL_TYPES)[number];
  /** Pattern to start with, e.g. the UID of a tag that is not set up yet. */
  pattern?: string;
}

function validateNewMappingSearch(
  search: Record<string, unknown>,
): NewMappingSearch {
  const type = PREFILL_TYPES.find((value) => value === search.type);
  const pattern =
    typeof search.pattern === "string" && search.pattern !== ""
      ? search.pattern
      : undefined;
  return type && pattern ? { type, pattern } : {};
}

export const Route = createFileRoute("/create/mappings_/new")({
  validateSearch: validateNewMappingSearch,
  component: NewMapping,
});

export function NewMapping() {
  const { type, pattern } = Route.useSearch();
  return (
    <MappingEditor prefill={type && pattern ? { type, pattern } : undefined} />
  );
}
