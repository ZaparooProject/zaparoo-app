import { createFileRoute } from "@tanstack/react-router";
import { LibraryHistoryCollection } from "@/components/library/LibraryHistoryCollection";

export const Route = createFileRoute("/library/top")({
  component: () => <LibraryHistoryCollection kind="top" />,
});
