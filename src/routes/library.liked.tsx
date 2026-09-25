import { createFileRoute } from "@tanstack/react-router";
import { LibraryTaggedCollection } from "@/components/library/LibraryTaggedCollection";

export const Route = createFileRoute("/library/liked")({
  component: () => <LibraryTaggedCollection collection="liked" />,
});
