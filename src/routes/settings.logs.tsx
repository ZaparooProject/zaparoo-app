import { createFileRoute } from "@tanstack/react-router";
import { Logs } from "./-pages/Logs";

export const Route = createFileRoute("/settings/logs")({
  component: Logs,
});
