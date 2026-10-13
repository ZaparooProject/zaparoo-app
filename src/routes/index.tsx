import { createFileRoute } from "@tanstack/react-router";
import { preloadZapLogo } from "@/lib/zapLogo";
import { IndexRoute } from "./-pages/IndexRoute";

export const Route = createFileRoute("/")({
  ssr: false,
  validateSearch: (search: Record<string, unknown>): { customise?: true } =>
    search.customise === true || search.customise === "true"
      ? { customise: true }
      : {},
  beforeLoad: () => {
    void preloadZapLogo();
  },
  component: IndexRoute,
});
