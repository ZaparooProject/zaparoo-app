import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Heart } from "lucide-react";
import { useTranslation } from "react-i18next";
import { CoreAPI } from "@/lib/coreApi";
import { logger } from "@/lib/logger";
import {
  favoriteUpdateParams,
  hasFavoriteTag,
  LIBRARY_QUERY_KEYS,
  mediaRefKey,
} from "@/lib/libraryMedia";
import type { MediaBrowseEntry, TagInfo } from "@/lib/models";
import { useStatusStore } from "@/lib/store";
import { showRateLimitedErrorToast } from "@/lib/toastUtils";
import { useCoreFeature } from "@/hooks/useCoreFeature";
import { Button } from "@/components/wui/Button";
import { LoadingSpinner } from "@/components/ui/loading-spinner";

export function FavoriteButton(props: {
  entry: MediaBrowseEntry;
  fallbackSystemId: string;
  deviceKey: string;
  metadataTags?: TagInfo[];
  className?: string;
  iconOnly?: boolean;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const connected = useStatusStore((state) => state.connected);
  const feature = useCoreFeature("mediaFavorites", {
    requireKnownSupport: true,
  });
  const favoriteFromProps =
    hasFavoriteTag(props.entry.tags) || hasFavoriteTag(props.metadataTags);
  const identity = mediaRefKey(props.entry, props.fallbackSystemId).join(
    "\u0001",
  );
  const [favorite, setFavorite] = useState(favoriteFromProps);
  const canUpdate = useMemo(
    () =>
      favoriteUpdateParams(props.entry, props.fallbackSystemId, !favorite) !==
      null,
    [favorite, props.entry, props.fallbackSystemId],
  );

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- External selection/tag changes reset toggle state.
    setFavorite(favoriteFromProps);
  }, [favoriteFromProps, identity]);

  const mutation = useMutation({
    mutationFn: async (nextFavorite: boolean) => {
      const params = favoriteUpdateParams(
        props.entry,
        props.fallbackSystemId,
        nextFavorite,
      );
      if (!params) throw new Error("Media reference is unavailable");
      return CoreAPI.mediaTagsUpdate(params);
    },
    onMutate: (nextFavorite) => {
      const previousFavorite = favorite;
      setFavorite(nextFavorite);
      return { previousFavorite };
    },
    onSuccess: (response) => {
      setFavorite(hasFavoriteTag(response.tags));
      void Promise.all([
        queryClient.invalidateQueries({
          queryKey: [LIBRARY_QUERY_KEYS.favorites, props.deviceKey],
        }),
        queryClient.invalidateQueries({
          queryKey: [LIBRARY_QUERY_KEYS.browse, props.deviceKey],
        }),
        queryClient.invalidateQueries({
          queryKey: [LIBRARY_QUERY_KEYS.meta, props.deviceKey],
        }),
        queryClient.invalidateQueries({ queryKey: ["infiniteMediaSearch"] }),
        queryClient.invalidateQueries({ queryKey: ["tags"] }),
      ]);
    },
    onError: (error, _nextFavorite, context) => {
      setFavorite(context?.previousFavorite ?? favoriteFromProps);
      logger.error("Failed to update media favorite", error, {
        category: "api",
        action: "updateMediaFavorite",
        severity: "error",
      });
      showRateLimitedErrorToast(t("library.favoriteError"));
    },
  });

  if (!feature.available) return null;

  const actionLabel = mutation.isPending
    ? t("library.updatingFavorite")
    : favorite
      ? t("library.removeFavorite")
      : t("library.addFavorite");

  return (
    <Button
      label={props.iconOnly ? undefined : actionLabel}
      aria-label={actionLabel}
      icon={
        mutation.isPending ? (
          <LoadingSpinner size={20} />
        ) : (
          <Heart size={20} fill={favorite ? "currentColor" : "none"} />
        )
      }
      variant="outline"
      size={props.iconOnly ? "lg" : "default"}
      aria-pressed={favorite}
      disabled={!connected || !canUpdate || mutation.isPending}
      onClick={() => mutation.mutate(!favorite)}
      className={props.className ?? (props.iconOnly ? undefined : "w-full")}
    />
  );
}
