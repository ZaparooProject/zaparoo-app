import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Capacitor } from "@capacitor/core";
import { ListPlusIcon, NfcIcon } from "lucide-react";
import { usePageHeadingFocus } from "@/hooks/usePageHeadingFocus";
import { NextIcon, PlayIcon, SearchIcon, TextIcon } from "@/lib/images";
import { useStatusStore } from "@/lib/store";
import { useNfcWriter, WriteAction, WriteMethod } from "@/lib/writeNfcHook";
import { CoreAPI } from "@/lib/coreApi";
import { isCoreFeatureAvailable } from "@/lib/featureGates";
import { logger } from "@/lib/logger";
import { showRateLimitedErrorToast } from "@/lib/toastUtils";
import type { PlayingResponse, SearchResultGame } from "@/lib/models";
import { MediaDetailsModal } from "@/components/MediaDetailsModal";
import { Card } from "@/components/wui/Card";
import { Button } from "@/components/wui/Button";
import { isWriteModalOpen, WriteModal } from "@/components/WriteModal";
import { PageFrame } from "@/components/PageFrame";
import { usePreferencesStore } from "@/lib/preferencesStore";

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
  const nfcAvailable = usePreferencesStore((state) => state.nfcAvailable);
  const preferRemoteWriter = usePreferencesStore(
    (state) => state.preferRemoteWriter,
  );
  const nfcWriter = useNfcWriter(WriteMethod.Auto, preferRemoteWriter);
  const [currentMediaDetails, setCurrentMediaDetails] =
    useState<SearchResultGame | null>(null);
  // Track user intent to open modal; actual visibility derived from NFC status
  const [writeIntent, setWriteIntent] = useState(false);
  const writeOpen = isWriteModalOpen(writeIntent, nfcWriter);
  const activeMediaZapScriptAvailable =
    connected &&
    !coreVersionPending &&
    isCoreFeatureAvailable("activeMediaZapScript", coreVersion);
  const closeWriteModal = async () => {
    setWriteIntent(false);
    await nfcWriter.end();
  };

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
        headerCenter={
          <h1 ref={headingRef} className="text-foreground text-xl">
            {t("create.title")}
          </h1>
        }
      >
        <div className="flex flex-col gap-3">
          <Link
            to="/create/search"
            disabled={!connected}
            aria-disabled={!connected}
            data-tour="create-search"
          >
            <Card disabled={!connected}>
              <div className="flex flex-row items-center gap-3">
                <Button
                  disabled={!connected}
                  icon={<SearchIcon size="20" />}
                  decorative
                />
                <div className="flex grow flex-col">
                  <span className="font-semibold">
                    {t("create.searchGameHeading")}
                  </span>
                  <span className="text-sm">{t("create.searchGameSub")}</span>
                </div>
                <span aria-hidden="true">
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
            <div className="flex flex-row items-center gap-3">
              <Button
                icon={<PlayIcon size="26" />}
                disabled={playing.mediaPath === "" && playing.mediaName === ""}
                decorative
              />
              <div className="flex grow flex-col">
                <span className="font-semibold">
                  {t("create.currentGameHeading")}
                </span>
                <span className="text-sm">
                  {playing.mediaName
                    ? t("create.currentGameSub", { game: playing.mediaName })
                    : t("create.currentGameSubFallback")}
                </span>
              </div>
            </div>
          </Card>

          <Link
            to="/create/mappings"
            disabled={!connected}
            aria-disabled={!connected}
          >
            <Card disabled={!connected}>
              <div className="flex flex-row items-center gap-3">
                <Button
                  icon={<ListPlusIcon size="20" />}
                  disabled={!connected}
                  decorative
                />
                <div className="flex grow flex-col">
                  <span className="font-semibold">
                    {t("create.mappingsHeading")}
                  </span>
                  <span className="text-sm">{t("create.mappingsSub")}</span>
                </div>
                <span aria-hidden="true">
                  <NextIcon size="20" />
                </span>
              </div>
            </Card>
          </Link>

          <Link to="/create/custom">
            <Card>
              <div className="flex flex-row items-center gap-3">
                <Button icon={<TextIcon size="20" />} decorative />
                <div className="flex grow flex-col">
                  <span className="font-semibold">
                    {t("create.customHeading")}
                  </span>
                  <span className="text-sm">{t("create.customSub")}</span>
                </div>
                <span aria-hidden="true">
                  <NextIcon size="20" />
                </span>
              </div>
            </Card>
          </Link>

          <Link
            to="/create/nfc"
            disabled={!Capacitor.isNativePlatform() || !nfcAvailable}
            aria-disabled={!Capacitor.isNativePlatform() || !nfcAvailable}
          >
            <Card disabled={!Capacitor.isNativePlatform() || !nfcAvailable}>
              <div className="flex flex-row items-center gap-3">
                <Button
                  icon={<NfcIcon size="24" />}
                  disabled={!Capacitor.isNativePlatform() || !nfcAvailable}
                  decorative
                />
                <div className="flex grow flex-col">
                  <span className="font-semibold">
                    {t("create.nfcHeading")}
                  </span>
                  <span className="text-sm">{t("create.nfcSub")}</span>
                </div>
                <span aria-hidden="true">
                  <NextIcon size="20" />
                </span>
              </div>
            </Card>
          </Link>
        </div>
      </PageFrame>
      <MediaDetailsModal
        isOpen={currentMediaDetails !== null && !writeOpen}
        close={() => setCurrentMediaDetails(null)}
        media={currentMediaDetails}
        onWrite={(value) => {
          setWriteIntent(true);
          return nfcWriter.write(WriteAction.Write, value).catch((error) => {
            logger.error("NFC write failed:", error, {
              category: "nfc",
              action: "writeCurrentMedia",
              severity: "error",
            });
          });
        }}
      />
      <WriteModal
        isOpen={writeOpen}
        close={closeWriteModal}
        verifyError={nfcWriter.verifyError !== null}
        retry={() => void nfcWriter.retry()}
      />
    </>
  );
}
