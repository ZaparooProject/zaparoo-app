import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import toast from "react-hot-toast";
import { CoreAPI } from "@/lib/coreApi";
import { logger } from "@/lib/logger";
import type { UpdateSettingsRequest } from "@/lib/models";

/** The one cache entry for `CoreAPI.settings()`, shared by every settings page. */
export const CORE_SETTINGS_QUERY_KEY = ["settings"] as const;

/**
 * Writes Core settings for the settings forms. Success resolves only after the
 * shared settings query has refetched, so callers awaiting it see saved state;
 * a failure is reported once here rather than by each page.
 */
export function useCoreSettingsUpdate() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (params: UpdateSettingsRequest) =>
      CoreAPI.settingsUpdate(params),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: CORE_SETTINGS_QUERY_KEY,
        exact: true,
      }),
    onError: (error) => {
      logger.error("Failed to update Core settings", error, {
        category: "api",
        action: "settings.update",
        severity: "warning",
      });
      toast.error(t("settings.updateFailed"));
    },
  });
}
