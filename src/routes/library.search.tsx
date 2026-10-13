import { createFileRoute } from "@tanstack/react-router";
import { validateLibraryMetadataSearch } from "@/lib/libraryMetadataSearch";
import { LibrarySearchPage } from "./-pages/LibrarySearch";

export const Route = createFileRoute("/library/search")({
  validateSearch: validateLibraryMetadataSearch,
  component: LibrarySearchPage,
});
