import type { ReactNode } from "react";
import classNames from "classnames";
import { LibraryArtwork } from "@/components/library/LibraryArtwork";
import type { MediaBrowseEntry } from "@/lib/models";

interface LibraryArtworkFrameProps {
  entry: MediaBrowseEntry;
  systemId: string;
  deviceKey: string;
  maxSize: number;
  priority: "detail" | "thumbnail";
  enabled?: boolean;
  compact?: boolean;
  className?: string;
  alt?: string;
}

/** The raised plate shared by every framed artwork source. */
export function LibraryArtworkPlate({
  compact = false,
  className,
  children,
}: {
  compact?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={classNames(
        "bg-surface-highlight shrink-0 overflow-hidden rounded-md",
        compact ? "p-1" : "p-1.5",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** Deliberately framed library art for sources with mixed aspect ratios. */
export function LibraryArtworkFrame({
  entry,
  systemId,
  deviceKey,
  maxSize,
  priority,
  enabled,
  compact = false,
  className,
  alt = "",
}: LibraryArtworkFrameProps) {
  return (
    <LibraryArtworkPlate compact={compact} className={className}>
      <LibraryArtwork
        entry={entry}
        systemId={systemId}
        deviceKey={deviceKey}
        maxSize={maxSize}
        priority={priority}
        enabled={enabled}
        className="size-full rounded-sm object-contain"
        alt={alt}
      />
    </LibraryArtworkPlate>
  );
}
