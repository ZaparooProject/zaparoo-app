import { useQuery } from "@tanstack/react-query";
import { useActiveDeviceKey } from "@/hooks/useActiveDeviceKey";
import { CoreAPI } from "@/lib/coreApi";
import type { MediaBrowseEntry, PlayingResponse } from "@/lib/models";

/** Below this a title match is too loose to risk showing the wrong cover. */
const MIN_CONFIDENCE = 0.8;

/** The running media as a library entry, so it reuses the artwork pipeline. */
function artworkEntry(
  media: PlayingResponse,
  resolvedMediaId?: number,
): MediaBrowseEntry {
  return {
    mediaId: media.mediaId ?? resolvedMediaId,
    name: media.mediaName,
    path: media.mediaPath,
    type: "media",
    systemId: media.systemId,
    systemName: media.systemName,
    relativePath: media.relativePath,
  };
}

/**
 * Resolves the library row behind the running media so its cover can be shown.
 * Core supplies `mediaId` for anything it launched itself; media started on the
 * device lands here with only a name, so fall back to a lookup.
 */
export function useNowPlayingArtwork(media: PlayingResponse): MediaBrowseEntry {
  const deviceKey = useActiveDeviceKey();
  const needsLookup =
    media.mediaId === undefined &&
    media.mediaName !== "" &&
    media.systemId !== "";

  const lookup = useQuery({
    queryKey: [
      "nowPlayingMediaRef",
      deviceKey,
      media.systemId,
      media.mediaPath,
      media.mediaName,
    ],
    queryFn: async ({ signal }) => {
      const response = await CoreAPI.mediaLookup(
        {
          system: media.systemId,
          name: media.mediaName,
          fuzzySystem: true,
        },
        signal,
      );
      const match = response.match;
      return match && match.confidence >= MIN_CONFIDENCE ? match : null;
    },
    enabled: needsLookup && deviceKey !== "",
    staleTime: Infinity,
    gcTime: 5 * 60 * 1000,
    // A missing match is an ordinary outcome, not something to retry or surface.
    retry: false,
  });

  return artworkEntry(media, lookup.data?.mediaId);
}
