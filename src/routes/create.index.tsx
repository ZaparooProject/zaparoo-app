import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { BookMarkedIcon, ListPlusIcon } from "lucide-react";
import { useAppUi } from "@/hooks/useAppUi";
import { usePageHeadingFocus } from "@/hooks/usePageHeadingFocus";
import { useCoreFeature } from "@/hooks/useCoreFeature";
import {
  NextIcon,
  NfcIcon,
  PlayIcon,
  SearchIcon,
  TextIcon,
} from "@/lib/images";
import { useStatusStore } from "@/lib/store";
import { useContextualNfcWrite } from "@/hooks/useContextualNfcWrite";
import { CoreAPI } from "@/lib/coreApi";
import { isCoreFeatureAvailable } from "@/lib/featureGates";
import { logger } from "@/lib/logger";
import { showRateLimitedErrorToast } from "@/lib/toastUtils";
import type { PlayingResponse, SearchResultGame } from "@/lib/models";
import { MediaDetailsModal } from "@/components/MediaDetailsModal";
import { CreateActionIcon } from "@/components/CreateActionIcon";
import { Card } from "@/components/wui/Card";
import { PageFrame } from "@/components/PageFrame";

export const Route = createFileRoute("/create/")({
  component: Create,
});

function toMediaDetails(
  playing: PlayingResponse,
  includeZapScript: boolean,
): SearchResultGame {
  return {
    system: {
      id: playing.systemId,
      name: playing.systemName || playing.systemId,
    },
    name: playing.mediaName,
    path: playing.mediaPath,
    zapScript: includeZapScript ? playing.zapScript : undefined,
    tags: [],
  };
}

export function Create() {
  const { t } = useTranslation();
  const headingRef = usePageHeadingFocus<HTMLHeadingElement>(t("create.title"));
  const connected = useStatusStore((state) => state.connected);
  const playing = useStatusStore((state) => state.playing);
  const coreVersion = useStatusStore((state) => state.coreVersion);
  const coreVersionPending = useStatusStore(
    (state) => state.coreVersionPending,
  );
  const nfcAvailable = useAppUi().nfc;
  const decksFeature = useCoreFeature("decks", { requireKnownSupport: true });
  const [currentMediaDetails, setCurrentMediaDetails] =
    useState<SearchResultGame | null>(null);
  // Closing the details ends the write they own.
  const writeActivity = useContextualNfcWrite(
    currentMediaDetails?.path ?? null,
    currentMediaDetails !== null,
  );
  const activeMediaZapScriptAvailable =
    connected &&
    !coreVersionPending &&
    isCoreFeatureAvailable("activeMediaZapScript", coreVersion);

  const openCurrentMediaDetails = async () => {
    if (!connected || playing.mediaPath === "") {
      return;
    }

    let activeMedia = playing;
    if (activeMediaZapScriptAvailable) {
      try {
        const response = await CoreAPI.mediaActive();
        if (!response || response.mediaPath === "") {
          showRateLimitedErrorToast(
            t("error", { msg: t("create.currentGameUnavailable") }),
          );
          setCurrentMediaDetails(null);
          return;
        }
        activeMedia = response;
      } catch (error) {
        logger.error("Failed to fetch active media details:", error, {
          category: "api",
          action: "mediaActive",
          severity: "warning",
        });
      }
    }

    setCurrentMediaDetails(
      toMediaDetails(activeMedia, activeMediaZapScriptAvailable),
    );
  };

  return (
    <>
      <PageFrame
        layout="workspace"
        headerMode="content-wide"
        className="create-overview-page wrap-anywhere"
        headerCenter={
          <h1 ref={headingRef} className="text-foreground text-xl">
            {t("create.title")}
          </h1>
        }
      >
        <div className="create-destinations">
          <Link
            to="/create/search"
            disabled={!connected}
            aria-disabled={!connected}
            data-tour="create-search"
          >
            <Card disabled={!connected} pressable>
              <div className="flex flex-row flex-wrap items-center gap-3">
                <CreateActionIcon icon={<SearchIcon size="20" />} />
                <div className="flex min-w-0 grow basis-[8rem] flex-col gap-1">
                  <span className="font-semibold">
                    {t("create.searchGameHeading")}
                  </span>
                  <span className="text-muted-foreground text-sm leading-relaxed">
                    {t("create.searchGameSub")}
                  </span>
                </div>
                <span
                  aria-hidden="true"
                  className="text-muted-foreground shrink-0"
                >
                  <NextIcon size="20" />
                </span>
              </div>
            </Card>
          </Link>

          <Card
            className="cursor-pointer"
            disabled={!connected || playing.mediaPath === ""}
            onClick={() => void openCurrentMediaDetails()}
          >
            <div className="flex flex-row flex-wrap items-center gap-3">
              <CreateActionIcon icon={<PlayIcon size="26" />} />
              <div className="flex min-w-0 grow basis-[8rem] flex-col gap-1">
                <span className="font-semibold">
                  {t("create.currentGameHeading")}
                </span>
                <span className="text-muted-foreground text-sm leading-relaxed">
                  {playing.mediaName
                    ? t("create.currentGameSub", { game: playing.mediaName })
                    : t("create.currentGameSubFallback")}
                </span>
              </div>
            </div>
          </Card>

          {decksFeature.available && (
            <Link
              to="/create/decks/new"
              disabled={!connected}
              aria-disabled={!connected}
            >
              <Card disabled={!connected} pressable>
                <div className="flex flex-row flex-wrap items-center gap-3">
                  <CreateActionIcon icon={<BookMarkedIcon size="20" />} />
                  <div className="flex min-w-0 grow basis-[8rem] flex-col gap-1">
                    <span className="font-semibold">{t("decks.new")}</span>
                    <span className="text-muted-foreground text-sm leading-relaxed">
                      {t("decks.createSubtitle")}
                    </span>
                  </div>
                  <span
                    aria-hidden="true"
                    className="text-muted-foreground shrink-0"
                  >
                    <NextIcon size="20" />
                  </span>
                </div>
              </Card>
            </Link>
          )}

          <Link
            to="/create/mappings"
            disabled={!connected}
            aria-disabled={!connected}
          >
            <Card disabled={!connected} pressable>
              <div className="flex flex-row flex-wrap items-center gap-3">
                <CreateActionIcon icon={<ListPlusIcon size="20" />} />
                <div className="flex min-w-0 grow basis-[8rem] flex-col gap-1">
                  <span className="font-semibold">
                    {t("create.mappingsHeading")}
                  </span>
                  <span className="text-muted-foreground text-sm leading-relaxed">
                    {t("create.mappingsSub")}
                  </span>
                </div>
                <span
                  aria-hidden="true"
                  className="text-muted-foreground shrink-0"
                >
                  <NextIcon size="20" />
                </span>
              </div>
            </Card>
          </Link>

          <Link to="/create/custom">
            <Card pressable>
              <div className="flex flex-row flex-wrap items-center gap-3">
                <CreateActionIcon icon={<TextIcon size="20" />} />
                <div className="flex min-w-0 grow basis-[8rem] flex-col gap-1">
                  <span className="font-semibold">
                    {t("create.customHeading")}
                  </span>
                  <span className="text-muted-foreground text-sm leading-relaxed">
                    {t("create.customSub")}
                  </span>
                </div>
                <span
                  aria-hidden="true"
                  className="text-muted-foreground shrink-0"
                >
                  <NextIcon size="20" />
                </span>
              </div>
            </Card>
          </Link>

          <Link
            to="/create/nfc"
            disabled={!nfcAvailable}
            aria-disabled={!nfcAvailable}
          >
            <Card disabled={!nfcAvailable} pressable>
              <div className="flex flex-row flex-wrap items-center gap-3">
                <CreateActionIcon icon={<NfcIcon size="24" />} />
                <div className="flex min-w-0 grow basis-[8rem] flex-col gap-1">
                  <span className="font-semibold">
                    {t("create.nfcHeading")}
                  </span>
                  <span className="text-muted-foreground text-sm leading-relaxed">
                    {t("create.nfcSub")}
                  </span>
                </div>
                <span
                  aria-hidden="true"
                  className="text-muted-foreground shrink-0"
                >
                  <NextIcon size="20" />
                </span>
              </div>
            </Card>
          </Link>
        </div>
      </PageFrame>
      <MediaDetailsModal
        isOpen={currentMediaDetails !== null}
        close={() => setCurrentMediaDetails(null)}
        media={currentMediaDetails}
        onWrite={(value) => writeActivity.start(value)}
        readerActivity={writeActivity}
      />
    </>
  );
}
