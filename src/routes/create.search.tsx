import { createFileRoute } from "@tanstack/react-router";
import { Preferences } from "@capacitor/preferences";
import { logger } from "@/lib/logger";
import { Search, type LoaderData } from "./-pages/Search";

export const Route = createFileRoute("/create/search")({
  // Local preferences only: the page loads systems itself, so navigation
  // never waits on a Core request that is queued while disconnected.
  loader: async (): Promise<LoaderData> => {
    const [systemPreference, tagPreference] = await Promise.all([
      Preferences.get({ key: "searchSystem" }),
      Preferences.get({ key: "searchTags" }),
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
    };
  },
  // Disable caching to ensure fresh preference is always read
  staleTime: 0,
  gcTime: 0,
  component: Search,
});
