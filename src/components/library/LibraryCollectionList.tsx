import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { Bookmark, Heart, ThumbsDown, ThumbsUp } from "lucide-react";
import { useTabSessionStore } from "@/lib/tabSessionStore";
import { NextIcon } from "@/lib/images";
import { EmptyState } from "@/components/wui/EmptyState";
import { TextInput } from "@/components/wui/TextInput";

const collections = [
  {
    to: "/library/favorites",
    label: "library.favorites",
    Icon: Heart,
    scope: "favorites",
  },
  {
    to: "/library/liked",
    label: "library.liked",
    Icon: ThumbsUp,
    scope: "liked",
  },
  {
    to: "/library/disliked",
    label: "library.disliked",
    Icon: ThumbsDown,
    scope: "disliked",
  },
  {
    to: "/library/play-later",
    label: "library.playLater",
    Icon: Bookmark,
    scope: "play-later",
  },
] as const;

export function LibraryCollectionList({
  preferencesAvailable,
}: {
  preferencesAvailable: boolean;
}) {
  const { t } = useTranslation();
  const forgetScroll = useTabSessionStore((state) => state.forgetScroll);
  const [query, setQuery] = useState("");
  const visible = collections
    .filter(({ scope }) => scope === "favorites" || preferencesAvailable)
    .filter(({ label }) =>
      t(label).toLowerCase().includes(query.trim().toLowerCase()),
    );

  return (
    <div className="flex flex-col gap-3">
      <TextInput
        type="search"
        aria-label={t("library.searchCollections")}
        placeholder={t("library.searchCollections")}
        value={query}
        setValue={setQuery}
        clearable
      />
      {visible.length === 0 ? (
        <EmptyState size="compact" title={t("library.noMatchingCollections")} />
      ) : (
        <nav aria-label={t("library.collections")} className="flex flex-col">
          {visible.map(({ to, label, Icon, scope }) => (
            <Link
              key={scope}
              to={to}
              onClick={() => forgetScroll(`library:${scope}:list`)}
              className="flex min-h-14 items-center justify-between gap-3 border-b border-white/25 px-1 py-3 last:border-b-0 focus-visible:ring-2 focus-visible:ring-white/50 focus-visible:outline-none"
            >
              <span className="flex min-w-0 items-center gap-3 font-medium">
                <Icon size={20} aria-hidden="true" />
                {t(label)}
              </span>
              <span aria-hidden="true">
                <NextIcon size="20" />
              </span>
            </Link>
          ))}
        </nav>
      )}
    </div>
  );
}
