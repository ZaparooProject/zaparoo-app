import { createFileRoute } from "@tanstack/react-router";
import { Preferences } from "@capacitor/preferences";
import { logger } from "@/lib/logger";
import { CoreAPI, isRequestCancelledError } from "@/lib/coreApi";
import { systemHasIndexedMedia } from "@/lib/systemFilters";
import { Search, type LoaderData } from "./-pages/Search";

export const Route = createFileRoute("/create/search")({
  loader: async (): Promise<LoaderData> => {
    let systemsRequestCancelled = false;
    const [systemPreference, tagPreference, systemsResponse] =
      await Promise.all([
        Preferences.get({ key: "searchSystem" }),
        Preferences.get({ key: "searchTags" }),
        CoreAPI.systems().catch((error) => {
          if (!isRequestCancelledError(error)) {
            throw error;
          }
          logger.debug("Search systems loader request cancelled", error);
          systemsRequestCancelled = true;
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

    const savedSystem = systemPreference.value;
    const systems = Array.isArray(systemsResponse?.systems)
      ? systemsResponse.systems.filter(systemHasIndexedMedia)
      : [];
    const savedSystemAvailable =
      systemsRequestCancelled ||
      !savedSystem ||
      savedSystem === "all" ||
      systems.some((system) => system.id === savedSystem);

    return {
      systemQuery: savedSystemAvailable && savedSystem ? savedSystem : "all",
      tagQuery: savedTags,
      systems: Array.isArray(systemsResponse?.systems)
        ? { ...systemsResponse, systems }
        : systemsResponse,
    };
  },
  // Disable caching to ensure fresh preference is always read
  staleTime: 0,
  gcTime: 0,
  component: Search,
});
