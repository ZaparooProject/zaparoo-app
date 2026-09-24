import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { CoreAPI, isUnindexedMediaError } from "@/lib/coreApi";
import { logger } from "@/lib/logger";
import {
  hasMediaPreference,
  LIBRARY_QUERY_KEYS,
  mediaRefKey,
  preferenceUpdateParams,
  type MediaPreference,
} from "@/lib/libraryMedia";
import type { MediaBrowseEntry, TagInfo } from "@/lib/models";
import { showRateLimitedErrorToast } from "@/lib/toastUtils";

export type PreferenceFlags = Record<MediaPreference, boolean>;
const EMPTY_TAGS: TagInfo[] = [];

function flagsFromTags(tags: readonly TagInfo[]): PreferenceFlags {
  return {
    favorite: hasMediaPreference(tags, "favorite"),
    liked: hasMediaPreference(tags, "liked"),
    disliked: hasMediaPreference(tags, "disliked"),
    playlater: hasMediaPreference(tags, "playlater"),
  };
}

function nextFlags(
  current: PreferenceFlags,
  preference: MediaPreference,
  enabled: boolean,
): PreferenceFlags {
  const next = { ...current, [preference]: enabled };
  if (enabled && preference === "disliked") {
    next.liked = false;
    next.favorite = false;
  } else if (enabled && (preference === "liked" || preference === "favorite")) {
    next.disliked = false;
  }
  return next;
}

interface Snapshot {
  identity: string;
  sourceKey: string;
  flags: PreferenceFlags;
}

interface ToggleRequest {
  preference: MediaPreference;
  enabled: boolean;
  entry: MediaBrowseEntry;
  fallbackSystemId: string;
  deviceKey: string;
  identity: string;
  previous: PreferenceFlags;
}

export function useMediaPreferences(props: {
  entry: MediaBrowseEntry;
  fallbackSystemId: string;
  deviceKey: string;
  metadataTags?: TagInfo[];
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const identity = JSON.stringify([
    props.deviceKey,
    ...mediaRefKey(props.entry, props.fallbackSystemId),
  ]);
  const identityRef = useRef(identity);
  useLayoutEffect(() => {
    identityRef.current = identity;
  }, [identity]);
  const sourceTags = props.metadataTags ?? props.entry.tags ?? EMPTY_TAGS;
  const sourceKey = JSON.stringify(sourceTags);
  const [snapshot, setSnapshot] = useState<Snapshot>(() => ({
    identity,
    sourceKey,
    flags: flagsFromTags(sourceTags),
  }));
  const flags =
    snapshot.identity === identity && snapshot.sourceKey === sourceKey
      ? snapshot.flags
      : flagsFromTags(sourceTags);

  useEffect(() => {
    if (snapshot.identity === identity && snapshot.sourceKey === sourceKey)
      return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- An external device, selection, or metadata change resets preference state.
    setSnapshot({ identity, sourceKey, flags: flagsFromTags(sourceTags) });
  }, [identity, sourceKey, sourceTags, snapshot.identity, snapshot.sourceKey]);

  const mutation = useMutation({
    mutationFn: (request: ToggleRequest) => {
      const params = preferenceUpdateParams(
        request.entry,
        request.fallbackSystemId,
        request.preference,
        request.enabled,
      );
      if (!params) throw new Error("Media reference is unavailable");
      return CoreAPI.mediaTagsUpdate(params);
    },
    onMutate: (request) => {
      if (identityRef.current === request.identity) {
        setSnapshot({
          identity: request.identity,
          sourceKey,
          flags: nextFlags(
            request.previous,
            request.preference,
            request.enabled,
          ),
        });
      }
    },
    onSuccess: (response, request) => {
      if (identityRef.current === request.identity) {
        setSnapshot({
          identity: request.identity,
          sourceKey,
          flags: flagsFromTags(response.tags),
        });
      }
      void (async () => {
        await queryClient.invalidateQueries({
          queryKey: [LIBRARY_QUERY_KEYS.browseIndex, request.deviceKey],
        });
        await Promise.all([
          queryClient.invalidateQueries({
            queryKey: [LIBRARY_QUERY_KEYS.favorites, request.deviceKey],
          }),
          queryClient.invalidateQueries({
            queryKey: [LIBRARY_QUERY_KEYS.collections, request.deviceKey],
          }),
          queryClient.invalidateQueries({
            queryKey: [LIBRARY_QUERY_KEYS.browse, request.deviceKey],
          }),
          queryClient.invalidateQueries({
            queryKey: [LIBRARY_QUERY_KEYS.meta, request.deviceKey],
          }),
          queryClient.invalidateQueries({ queryKey: ["infiniteMediaSearch"] }),
          queryClient.invalidateQueries({ queryKey: ["tags"] }),
        ]);
      })();
    },
    onError: (error, request) => {
      if (identityRef.current === request.identity) {
        setSnapshot({
          identity: request.identity,
          sourceKey,
          flags: request.previous,
        });
      }
      if (isUnindexedMediaError(error)) {
        showRateLimitedErrorToast(
          t(
            request.preference === "favorite"
              ? "library.favoriteNotIndexed"
              : "library.preferenceNotIndexed",
          ),
        );
        return;
      }
      logger.error("Failed to update media preference", error, {
        category: "api",
        action: "updateMediaPreference",
        severity: "error",
      });
      showRateLimitedErrorToast(
        t(
          request.preference === "favorite"
            ? "library.favoriteError"
            : "library.preferenceError",
        ),
      );
    },
  });

  return {
    flags,
    isPending: mutation.isPending && mutation.variables?.identity === identity,
    busy: mutation.isPending,
    pendingPreference:
      mutation.isPending && mutation.variables?.identity === identity
        ? mutation.variables.preference
        : null,
    canUpdate:
      preferenceUpdateParams(
        props.entry,
        props.fallbackSystemId,
        "favorite",
        true,
      ) !== null,
    toggle: (preference: MediaPreference) => {
      if (mutation.isPending) return;
      mutation.mutate({
        preference,
        enabled: !flags[preference],
        entry: props.entry,
        fallbackSystemId: props.fallbackSystemId,
        deviceKey: props.deviceKey,
        identity,
        previous: flags,
      });
    },
  };
}
