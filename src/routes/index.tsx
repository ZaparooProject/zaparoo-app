import { createFileRoute } from "@tanstack/react-router";
import { preloadZapLogo } from "@/lib/zapLogo";
import { Index } from "./-pages/Index";

export const Route = createFileRoute("/")({
  ssr: false,
  beforeLoad: () => {
    void preloadZapLogo();
  },
  component: Index,
});
