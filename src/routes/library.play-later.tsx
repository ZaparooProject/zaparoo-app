import { createFileRoute } from "@tanstack/react-router";
import { LibraryTaggedCollection } from "@/components/library/LibraryTaggedCollection";

export const Route = createFileRoute("/library/play-later")({
  component: () => <LibraryTaggedCollection collection="play-later" />,
});
