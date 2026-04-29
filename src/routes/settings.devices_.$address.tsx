import { createFileRoute } from "@tanstack/react-router";
import { DeviceDetail } from "./-pages/DeviceDetail";

export const Route = createFileRoute("/settings/devices_/$address")({
  component: DeviceDetail,
});
