import { createFileRoute } from "@tanstack/react-router";
import { LibraryTaggedCollection } from "@/components/library/LibraryTaggedCollection";

export const Route = createFileRoute("/library/favorites")({
  component: LibraryFavorites,
});

export function LibraryFavorites() {
  return <LibraryTaggedCollection collection="favorites" />;
}
