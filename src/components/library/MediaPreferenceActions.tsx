import classNames from "classnames";
import { Bookmark, Heart, ThumbsDown, ThumbsUp } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useCoreFeature } from "@/hooks/useCoreFeature";
import { useStatusStore } from "@/lib/store";
import type { MediaBrowseEntry, TagInfo } from "@/lib/models";
import type { MediaPreference } from "@/lib/libraryMedia";
import { Button } from "@/components/wui/Button";
import { useMediaPreferences } from "@/components/library/useMediaPreferences";

const actions = [
  {
    id: "favorite",
    Icon: Heart,
    label: "favorite",
    add: "addFavorite",
    remove: "removeFavorite",
    pending: "updatingFavorite",
  },
  {
    id: "liked",
    Icon: ThumbsUp,
    label: "like",
    add: "addLike",
    remove: "removeLike",
    pending: "updatingPreference",
  },
  {
    id: "disliked",
    Icon: ThumbsDown,
    label: "dislike",
    add: "addDislike",
    remove: "removeDislike",
    pending: "updatingPreference",
  },
  {
    id: "playlater",
    Icon: Bookmark,
    label: "playLater",
    add: "addPlayLater",
    remove: "removePlayLater",
    pending: "updatingPreference",
  },
] as const satisfies ReadonlyArray<{
  id: MediaPreference;
  Icon: typeof Heart;
  label: string;
  add: string;
  remove: string;
  pending: string;
}>;

export function MediaPreferenceActions(props: {
  entry: MediaBrowseEntry;
  fallbackSystemId: string;
  deviceKey: string;
  metadataTags?: TagInfo[];
  ready?: boolean;
  context: "modal" | "nowPlaying";
}) {
  const { t } = useTranslation();
  const connected = useStatusStore((state) => state.connected);
  const favoritesFeature = useCoreFeature("mediaFavorites", {
    requireKnownSupport: true,
  });
  const preferencesFeature = useCoreFeature("mediaPreferences", {
    requireKnownSupport: true,
  });
  const { flags, canUpdate, busy, pendingPreference, toggle } =
    useMediaPreferences(props);

  if (!favoritesFeature.available) return null;

  return actions
    .filter(({ id }) => id === "favorite" || preferencesFeature.available)
    .map(({ id, Icon, label, add, remove, pending }) => {
      const active = flags[id];
      const updating = pendingPreference === id;
      return (
        <Button
          key={id}
          label={props.context === "modal" ? t(`library.${label}`) : undefined}
          aria-label={t(
            `library.${updating ? pending : active ? remove : add}`,
          )}
          aria-pressed={active}
          icon={<Icon size={20} fill={active ? "currentColor" : "none"} />}
          variant="text"
          layout={props.context === "modal" ? "responsive" : "inline"}
          size={props.context === "nowPlaying" ? "lg" : "default"}
          className={
            props.context === "modal"
              ? classNames(
                  "w-full whitespace-nowrap",
                  busy && "disabled:!text-white",
                )
              : "shrink-0"
          }
          disabled={!connected || !canUpdate || props.ready === false || busy}
          onClick={() => toggle(id)}
        />
      );
    });
}
