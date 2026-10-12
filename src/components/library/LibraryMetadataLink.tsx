import type { ReactNode } from "react";
import { Link, useRouter } from "@tanstack/react-router";
import { useActiveDeviceKey } from "@/hooks/useActiveDeviceKey";
import { useHapticPress } from "@/hooks/useHapticPress";
import { useMetadataHistoryKey } from "@/hooks/useMetadataDetailsReturn";
import { useLibrarySessionStore } from "@/lib/librarySessionStore";
import type { MediaBrowseEntry, TagInfo } from "@/lib/models";

export interface MetadataLinkTarget {
  systemId: string;
  deviceKey: string;
  entry: MediaBrowseEntry;
  owner?: string;
}

export function LibraryMetadataLink(
  props: MetadataLinkTarget & {
    tag?: TagInfo;
    label: string;
    children?: ReactNode;
    enabled: boolean;
    /** A badge keeps its own face; text values read as inline links. */
    variant?: "text" | "badge";
  },
) {
  const router = useRouter({ warn: false });
  const historyKey = useMetadataHistoryKey();
  const activeDeviceKey = useActiveDeviceKey();
  const press = useHapticPress();
  const value = props.children ?? props.label;
  if (!router || !props.enabled) return <>{value}</>;
  return (
    <Link
      to="/library/search"
      search={{
        system: props.systemId,
        ...(props.tag ? { tag: `${props.tag.type}:${props.tag.tag}` } : {}),
      }}
      resetScroll
      state={{ appMetadataOrigin: historyKey }}
      aria-label={props.label}
      className={
        props.variant === "badge"
          ? "focus-visible:ring-ring [@media(hover:hover)_and_(pointer:fine)]:hover:[&>span]:border-input [@media(hover:hover)_and_(pointer:fine)]:hover:[&>span]:bg-surface-highlight inline-flex max-w-full cursor-pointer rounded-sm focus-visible:ring-2 focus-visible:outline-none [&>span]:max-w-full"
          : "text-primary focus-visible:ring-ring -my-2 inline-block max-w-full cursor-pointer rounded-sm py-2 wrap-anywhere hover:underline focus-visible:ring-2 focus-visible:outline-none"
      }
      onPointerUp={press}
      onClick={(event) => {
        if (
          event.defaultPrevented ||
          event.button !== 0 ||
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey ||
          event.altKey
        )
          return;
        if (props.deviceKey !== activeDeviceKey) {
          event.preventDefault();
          return;
        }
        if (props.owner && historyKey) {
          const state = useLibrarySessionStore.getState();
          state.activateDevice(props.deviceKey);
          useLibrarySessionStore
            .getState()
            .rememberMetadataReturn(historyKey, props.owner, props.entry);
        }
      }}
    >
      {value}
    </Link>
  );
}
