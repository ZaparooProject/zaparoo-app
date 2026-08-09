import { createFileRoute } from "@tanstack/react-router";
import { preloadZapLogo } from "@/lib/images";
import { Index } from "./-pages/Index";

export const Route = createFileRoute("/")({
  ssr: false,
  beforeLoad: preloadZapLogo,
  component: Index,
});
