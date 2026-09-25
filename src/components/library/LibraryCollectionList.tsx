import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Bookmark, Heart, PlusIcon, ThumbsDown, ThumbsUp } from "lucide-react";
import { useActiveDeviceKey } from "@/hooks/useActiveDeviceKey";
import { useCoreFeature } from "@/hooks/useCoreFeature";
import { CoreAPI } from "@/lib/coreApi";
import { LIBRARY_QUERY_KEYS } from "@/lib/libraryMedia";
import { useStatusStore } from "@/lib/store";
import { Button } from "@/components/wui/Button";
import { Button as LinkButton } from "@/components/ui/button";
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
    to: "/library/play-later",
    label: "library.playLater",
    Icon: Bookmark,
    scope: "play-later",
  },
  {
    to: "/library/disliked",
    label: "library.disliked",
    Icon: ThumbsDown,
    scope: "disliked",
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
  const deviceKey = useActiveDeviceKey();
  const connected = useStatusStore((state) => state.connected);
  const decksFeature = useCoreFeature("decks", { requireKnownSupport: true });
  const decksQuery = useQuery({
    queryKey: [LIBRARY_QUERY_KEYS.decks, deviceKey],
    queryFn: ({ signal }) => CoreAPI.decks(signal),
    enabled: connected && Boolean(deviceKey) && decksFeature.available,
    refetchOnMount: "always",
  });
  const visible = collections.filter(
    ({ scope }) => scope === "favorites" || preferencesAvailable,
  );
  const visibleDecks = (decksQuery.data?.decks ?? []).filter((deck) =>
    deck.name.toLowerCase().includes(query.trim().toLowerCase()),
  );

  return (
    <div className="flex flex-col gap-3">
      {visible.length > 0 && (
        <nav
          aria-label={t("library.collections")}
          className="grid grid-cols-2 gap-2"
        >
          {visible.map(({ to, label, Icon, scope }) => (
            <LinkButton
              key={scope}
              asChild
              variant="wui-outline"
              className="h-auto min-h-10 px-3 text-base whitespace-normal"
            >
              <Link
                to={to}
                onClick={() => forgetScroll(`library:${scope}:list`)}
              >
                <Icon size={20} aria-hidden="true" />
                {t(label)}
              </Link>
            </LinkButton>
          ))}
        </nav>
      )}
      {decksFeature.available && (
        <section aria-label={t("decks.title")} className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-lg font-semibold">{t("decks.title")}</h2>
            <Link
              to="/library/decks/new"
              aria-label={t("decks.new")}
              className="flex h-12 w-12 items-center justify-end rounded-full focus-visible:ring-2 focus-visible:ring-white/50 focus-visible:outline-none"
            >
              <PlusIcon size={24} aria-hidden="true" />
            </Link>
          </div>
          <TextInput
            type="search"
            aria-label={t("decks.search")}
            placeholder={t("decks.search")}
            value={query}
            setValue={setQuery}
            clearable
          />
          {decksQuery.isError ? (
            <EmptyState
              size="compact"
              title={t("decks.loadError")}
              action={
                <Button
                  label={t("library.tryAgain")}
                  variant="outline"
                  onClick={() => void decksQuery.refetch()}
                />
              }
            />
          ) : decksQuery.isLoading ? (
            <p role="status" className="text-muted-foreground text-sm">
              {t("decks.loading")}
            </p>
          ) : visibleDecks.length > 0 ? (
            <nav aria-label={t("decks.title")}>
              {visibleDecks.map((deck) => (
                <Link
                  key={deck.deckId}
                  to="/library/decks/$deckId"
                  params={{ deckId: deck.deckId }}
                  className="flex min-h-14 items-center justify-between gap-3 border-b border-white/25 px-1 py-3 last:border-b-0 focus-visible:ring-2 focus-visible:ring-white/50 focus-visible:outline-none"
                >
                  <span className="flex min-w-0 flex-col">
                    <span className="font-medium">{deck.name}</span>
                    <span className="text-muted-foreground text-sm">
                      {t("library.itemCount", { count: deck.itemCount })}
                    </span>
                  </span>
                  <span aria-hidden="true">
                    <NextIcon size="20" />
                  </span>
                </Link>
              ))}
            </nav>
          ) : !query.trim() ? (
            <EmptyState size="compact" title={t("decks.empty")} />
          ) : (
            <EmptyState size="compact" title={t("decks.noMatching")} />
          )}
        </section>
      )}
    </div>
  );
}
