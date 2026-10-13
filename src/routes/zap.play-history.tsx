import { createFileRoute } from "@tanstack/react-router";
import { PlayHistory } from "@/routes/-pages/ZapHistory";

export const Route = createFileRoute("/zap/play-history")({
  component: PlayHistory,
});
