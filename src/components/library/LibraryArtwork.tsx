import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { FileIcon } from "lucide-react";
import { requestLibraryImage } from "@/lib/libraryImages";
import { LIBRARY_QUERY_KEYS, mediaRefKey } from "@/lib/libraryMedia";
import type { MediaBrowseEntry } from "@/lib/models";
import { Skeleton } from "@/components/ui/skeleton";
import { DelayedLoading } from "@/components/DelayedLoading";

export function LibraryArtwork(props: {
  entry: MediaBrowseEntry;
  systemId: string;
  targetDeviceAddress: string;
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
    props.targetDeviceAddress !== "";
  const imageQuery = useQuery({
    queryKey: [
      LIBRARY_QUERY_KEYS.image,
      props.targetDeviceAddress,
      ...mediaRefKey(props.entry, props.systemId),
      props.imageTypes ?? ["default"],
      props.maxSize,
    ],
    queryFn: ({ signal }) =>
      requestLibraryImage(props.entry, props.systemId, {
        targetDeviceAddress: props.targetDeviceAddress,
        imageTypes: props.imageTypes,
        maxSize: props.maxSize,
        priority: props.priority,
        signal,
      }),
    enabled,
    staleTime: Infinity,
    gcTime: 2 * 60 * 1000,
    retry: false,
  });

  useEffect(() => {
    if (imageQuery.data?.typeTag) {
      onTypeTag?.(imageQuery.data.typeTag);
    }
    if (imageQuery.isSuccess) {
      onAvailabilityChange?.(Boolean(imageQuery.data?.url));
    }
  }, [
    imageQuery.data?.typeTag,
    imageQuery.data?.url,
    imageQuery.isSuccess,
    onAvailabilityChange,
    onTypeTag,
  ]);

  if (enabled && imageQuery.isLoading) {
    return (
      <span
        className={`${props.className ?? ""} block overflow-hidden bg-white/5`}
        aria-hidden="true"
      >
        <DelayedLoading>
          <Skeleton className="h-full w-full" />
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
      className={`${props.className ?? ""} text-foreground-hint flex items-center justify-center bg-white/5`}
      aria-hidden="true"
    >
      <FileIcon size={24} />
    </span>
  );
}
