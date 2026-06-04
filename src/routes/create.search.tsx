import { createFileRoute } from "@tanstack/react-router";
import { Preferences } from "@capacitor/preferences";
import { logger } from "@/lib/logger";
import { CoreAPI, isRequestCancelledError } from "@/lib/coreApi";
import { Search, type LoaderData } from "./-pages/Search";

export const Route = createFileRoute("/create/search")({
  loader: async (): Promise<LoaderData> => {
    const [systemPreference, tagPreference, systemsResponse] =
      await Promise.all([
        Preferences.get({ key: "searchSystem" }),
        Preferences.get({ key: "searchTags" }),
        CoreAPI.systems().catch((error) => {
          if (!isRequestCancelledError(error)) {
            throw error;
          }
          logger.debug("Search systems loader request cancelled", error);
          return { systems: [] };
        }),
      ]);

    let savedTags: string[] = [];
    try {
      if (tagPreference.value) {
        savedTags = JSON.parse(tagPreference.value);
      }
    } catch (e) {
      logger.warn("Failed to parse saved tags preference:", e, {
        category: "storage",
        action: "get",
        key: "searchTags",
        severity: "warning",
      });
    }

    return {
      systemQuery: systemPreference.value || "all",
      tagQuery: savedTags,
      systems: systemsResponse,
    };
  },
  // Disable caching to ensure fresh preference is always read
  staleTime: 0,
  gcTime: 0,
  component: Search,
});
