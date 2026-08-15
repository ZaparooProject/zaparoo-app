import { createFileRoute } from "@tanstack/react-router";
import { DeviceDetail } from "@/routes/-pages/DeviceDetail";

export const Route = createFileRoute("/settings/devices_/$recordId")({
  component: DeviceDetail,
});
