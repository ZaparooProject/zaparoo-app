import { createFileRoute } from "@tanstack/react-router";
import { ScanHistory } from "@/routes/-pages/ZapHistory";

export const Route = createFileRoute("/zap/scan-history")({
  component: ScanHistory,
});
