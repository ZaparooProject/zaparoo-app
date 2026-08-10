import { createFileRoute } from "@tanstack/react-router";
import { LibraryGameSearch } from "@/components/library/LibraryGameSearch";

export const Route = createFileRoute("/library/search")({
  component: LibraryGameSearch,
});
