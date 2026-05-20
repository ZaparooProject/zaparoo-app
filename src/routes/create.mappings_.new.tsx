import { createFileRoute } from "@tanstack/react-router";
import { MappingEditor } from "@/routes/-pages/MappingEditor";

export const Route = createFileRoute("/create/mappings_/new")({
  component: NewMapping,
});

function NewMapping() {
  return <MappingEditor />;
}
