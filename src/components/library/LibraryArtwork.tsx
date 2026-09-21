import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AppWindowIcon,
  BookOpenIcon,
  FilmIcon,
  Gamepad2Icon,
  ImageIcon,
  Music2Icon,
  PodcastIcon,
  TvIcon,
} from "lucide-react";
import { isTransientApiConnectionError } from "@/lib/coreApi";
import { requestLibraryImage } from "@/lib/libraryImages";
import { LIBRARY_QUERY_KEYS, mediaRefKey } from "@/lib/libraryMedia";
import type { MediaBrowseEntry } from "@/lib/models";
import { Skeleton } from "@/components/ui/skeleton";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { DelayedLoading } from "@/components/DelayedLoading";

function MediaPlaceholderIcon({ systemId }: { systemId: string }) {
  switch (systemId) {
    case "Movie":
    case "Video":
    case "MusicVideo":
    case "BluRayPlayer":
    case "DVDPlayer":
      return <FilmIcon size={24} />;
    case "TVEpisode":
    case "TVSeason":
    case "TVShow":
      return <TvIcon size={24} />;
    case "Audio":
    case "MusicTrack":
    case "MusicArtist":
    case "MusicAlbum":
      return <Music2Icon size={24} />;
    case "PodcastSeries":
    case "PodcastEpisode":
      return <PodcastIcon size={24} />;
    case "Audiobook":
      return <BookOpenIcon size={24} />;
    case "Image":
      return <ImageIcon size={24} />;
    case "Application":
    case "WebBrowser":
      return <AppWindowIcon size={24} />;
    default:
      return <Gamepad2Icon size={24} />;
  }
}

export function LibraryArtwork(props: {
  entry: MediaBrowseEntry;
  systemId: string;
  deviceKey: string;
  maxSize: number;
  priority: "detail" | "thumbnail";
  imageTypes?: string[];
  enabled?: boolean;
  className?: string;
  alt?: string;
  onTypeTag?: (typeTag: string) => void;
  onAvailabilityChange?: (available: boolean) => void;
}) {
  const { onAvailabilityChange, onTypeTag } = props;
  const enabled =
    props.enabled !== false &&
    props.entry.hasCover !== false &&
    props.deviceKey !== "";
  const imageQuery = useQuery({
    queryKey: [
      LIBRARY_QUERY_KEYS.image,
      props.deviceKey,
      ...mediaRefKey(props.entry, props.systemId),
      props.imageTypes ?? ["default"],
      props.maxSize,
    ],
    queryFn: ({ signal }) =>
      requestLibraryImage(props.entry, props.systemId, {
        deviceKey: props.deviceKey,
        imageTypes: props.imageTypes,
        maxSize: props.maxSize,
        priority: props.priority,
        signal,
      }),
    enabled,
    staleTime: Infinity,
    gcTime: 2 * 60 * 1000,
    retry: (failureCount, error) =>
      failureCount < 1 && isTransientApiConnectionError(error),
  });

  useEffect(() => {
    if (imageQuery.data?.typeTag) {
      onTypeTag?.(imageQuery.data.typeTag);
    }
    if (imageQuery.isSuccess) {
      onAvailabilityChange?.(Boolean(imageQuery.data?.url));
    } else if (imageQuery.isError) {
      onAvailabilityChange?.(false);
    }
  }, [
    imageQuery.data?.typeTag,
    imageQuery.data?.url,
    imageQuery.isError,
    imageQuery.isSuccess,
    onAvailabilityChange,
    onTypeTag,
  ]);

  if (enabled && imageQuery.isLoading) {
    return (
      <span
        className={`${props.className ?? ""} bg-foreground/5 flex items-center justify-center overflow-hidden`}
        aria-hidden="true"
      >
        <DelayedLoading>
          {props.priority === "detail" ? (
            <LoadingSpinner
              size={20}
              className="text-muted-foreground"
              decorative
            />
          ) : (
            <Skeleton className="h-full w-full" />
          )}
        </DelayedLoading>
      </span>
    );
  }

  if (imageQuery.data?.url) {
    return (
      <img
        src={imageQuery.data.url}
        alt={props.alt ?? ""}
        className={props.className}
      />
    );
  }

  return (
    <span
      className={`${props.className ?? ""} text-foreground-hint bg-foreground/5 flex items-center justify-center`}
      aria-hidden="true"
    >
      <MediaPlaceholderIcon systemId={props.systemId} />
    </span>
  );
}
