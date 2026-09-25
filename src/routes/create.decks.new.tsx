import { createFileRoute } from "@tanstack/react-router";
import { NewDeck } from "@/routes/library.decks.new";

export const Route = createFileRoute("/create/decks/new")({
  component: () => <NewDeck backTo="/create" />,
});
