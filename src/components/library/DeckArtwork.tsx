import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FileIcon } from "lucide-react";
import type { DeckItem, MediaBrowseEntry } from "@/lib/models";
import { CoreAPI } from "@/lib/coreApi";
import { deckArtworkTarget } from "@/lib/deckArtwork";
import { searchResultToBrowseEntry } from "@/lib/libraryMedia";
import { ConnectionState, useStatusStore } from "@/lib/store";
import { useActiveDeviceKey } from "@/hooks/useActiveDeviceKey";
import { LibraryArtwork } from "@/components/library/LibraryArtwork";

function httpsImage(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
}

export function DeckArtwork({
  item,
  detail = false,
  enabled = true,
  alt = "",
}: {
  item: DeckItem;
  detail?: boolean;
  enabled?: boolean;
  alt?: string;
}) {
  const deviceKey = useActiveDeviceKey();
  const connected = useStatusStore(
    (state) => state.connectionState === ConnectionState.CONNECTED,
  );
  const containerRef = useRef<HTMLSpanElement>(null);
  const [visible, setVisible] = useState(
    () => typeof IntersectionObserver === "undefined",
  );
  useEffect(() => {
    const container = containerRef.current;
    if (!container || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        setVisible(true);
        observer.disconnect();
      }
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);
  const active = enabled && (detail || visible);
  const url = httpsImage(
    item.kind === "card" ? item.metadata?.rendered_url : null,
  );
  const media = item.kind === "script" ? item.media : undefined;
  const linkedEntry: MediaBrowseEntry | undefined =
    media?.system.trim() && media.path.trim()
      ? {
          type: "media",
          name: media.name,
          path: media.path,
          systemId: media.system,
        }
      : undefined;
  const target =
    item.kind === "script" && !linkedEntry
      ? deckArtworkTarget(item.zapscript)
      : null;
  const lookup = useQuery({
    queryKey: ["deckArtworkLookup", deviceKey, target],
    queryFn: async ({ signal }) => {
      if (target?.kind !== "title") return null;
      const result = await CoreAPI.mediaLookup(
        { system: target.system, name: target.name, fuzzySystem: true },
        signal,
      );
      return result.match ? searchResultToBrowseEntry(result.match) : null;
    },
    enabled:
      active && connected && Boolean(deviceKey) && target?.kind === "title",
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
  const systems = useQuery({
    queryKey: ["deckArtworkSystems", deviceKey],
    queryFn: () => CoreAPI.systems(),
    enabled:
      active &&
      connected &&
      Boolean(deviceKey) &&
      target?.kind === "path" &&
      !target.system,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
  const pathParts =
    target?.kind === "path"
      ? target.path
          .replaceAll("\\\\", "/")
          .toLowerCase()
          .split("/")
          .slice(0, -1)
      : [];
  const pathSystems =
    systems.data?.systems.filter((system) =>
      pathParts.includes(system.id.toLowerCase()),
    ) ?? [];
  const pathSystem =
    target?.kind === "path"
      ? target.system || (pathSystems.length === 1 ? pathSystems[0]!.id : "")
      : "";
  const entry =
    linkedEntry ??
    (target?.kind === "path" && pathSystem
      ? {
          type: "media" as const,
          name: item.name,
          path: target.path,
          systemId: pathSystem,
        }
      : (lookup.data ?? undefined));
  const sourceKey =
    url ??
    JSON.stringify([deviceKey, entry?.systemId, entry?.path, entry?.mediaId]);

  return (
    <span
      ref={containerRef}
      className={detail ? "block h-64 w-full" : "h-16 w-16 shrink-0"}
      aria-hidden={alt ? undefined : true}
    >
      <ArtworkImage
        key={sourceKey}
        url={url}
        entry={entry}
        deviceKey={deviceKey}
        enabled={active}
        detail={detail}
        alt={alt}
      />
    </span>
  );
}

function ArtworkImage({
  url,
  entry,
  deviceKey,
  enabled,
  detail,
  alt,
}: {
  url: string | null;
  entry: MediaBrowseEntry | undefined;
  deviceKey: string;
  enabled: boolean;
  detail: boolean;
  alt: string;
}) {
  const [failed, setFailed] = useState(false);
  return (
    <span
      className="text-foreground-hint flex h-full w-full items-center justify-center overflow-hidden bg-white/5"
      onErrorCapture={() => setFailed(true)}
    >
      {!failed && url ? (
        <img
          src={url}
          alt={alt}
          loading="lazy"
          className="h-full w-full object-contain"
        />
      ) : !failed && entry ? (
        <LibraryArtwork
          entry={entry}
          systemId={entry.systemId ?? ""}
          deviceKey={deviceKey}
          maxSize={detail ? 512 : 128}
          priority={detail ? "detail" : "thumbnail"}
          alt={alt}
          enabled={enabled}
          className="h-full w-full object-contain"
        />
      ) : (
        <FileIcon size={24} />
      )}
    </span>
  );
}
