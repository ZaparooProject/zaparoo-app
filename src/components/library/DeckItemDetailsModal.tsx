import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Trash2Icon } from "lucide-react";
import { CoreAPI, logRunFailure } from "@/lib/coreApi";
import { deckItemLaunchText } from "@/lib/decks";
import type { DeckItem, MediaBrowseEntry } from "@/lib/models";
import {
  collectLibraryMetadata,
  organizeLibraryDetailTags,
} from "@/lib/libraryMedia";
import { useSystemNameResolver } from "@/hooks/useSystemName";
import {
  LibraryFactRows,
  LibraryMediaFacts,
  TechnicalDetails,
} from "@/components/library/LibraryMediaFacts";
import { useLibraryMediaMeta } from "@/components/library/useLibraryMediaFacts";
import { ConnectionState, useStatusStore } from "@/lib/store";
import { showRateLimitedErrorToast } from "@/lib/toastUtils";
import { SlideModal } from "@/components/SlideModal";
import { Button } from "@/components/wui/Button";
import { useActiveDeviceKey } from "@/hooks/useActiveDeviceKey";
import { useContextualNfcWrite } from "@/hooks/useContextualNfcWrite";
import {
  ContextualWriteRail,
  LaunchButton,
} from "@/components/library/ContextualWriteRail";
import { DeckArtwork } from "@/components/library/DeckArtwork";

export function DeckItemDetailsModal({
  item,
  deckId,
  isOpen,
  close,
  canRemove,
  onRemove,
  writeAvailable,
  docked = false,
}: {
  item: DeckItem | null;
  deckId: string;
  isOpen: boolean;
  close: () => void;
  canRemove: boolean;
  onRemove: (item: DeckItem) => void;
  writeAvailable: boolean;
  /** Shown in the page's details pane instead of as a dialog. */
  docked?: boolean;
}) {
  const { t } = useTranslation();
  const [launching, setLaunching] = useState(false);
  const liveConnected = useStatusStore(
    (state) => state.connectionState === ConnectionState.CONNECTED,
  );
  const title = item?.name || item?.cardId || t("decks.unnamedItem");
  const launchText = item ? deckItemLaunchText(item, deckId) : null;
  const playText =
    item?.kind === "card" && item.cardId?.trim()
      ? `https://zpr.au/c$${item.cardId.trim()}`
      : launchText;
  const displayText = launchText ?? playText;
  const deviceKey = useActiveDeviceKey();
  const writeActivity = useContextualNfcWrite(
    JSON.stringify([deviceKey, deckId, item?.id, launchText]),
    isOpen,
  );
  // An indexed game behind the item gets the same facts as Library details.
  const mediaEntry = useMemo<MediaBrowseEntry | null>(
    () =>
      item?.media?.available
        ? {
            name: item.media.name,
            path: item.media.path,
            type: "media",
            systemId: item.media.system,
          }
        : null,
    [item],
  );
  const mediaSystemId = item?.media?.system ?? "";
  const metadata = useLibraryMediaMeta(
    mediaEntry,
    mediaSystemId,
    deviceKey,
    isOpen,
  ).data?.media;
  const resolveSystemName = useSystemNameResolver();
  const factView = useMemo(
    () =>
      organizeLibraryDetailTags(
        metadata ? collectLibraryMetadata(metadata).tags : [],
      ),
    [metadata],
  );
  const linkTarget =
    mediaEntry && metadata
      ? {
          entry: mediaEntry,
          systemId: metadata.title.system.id || mediaSystemId,
          deviceKey,
        }
      : null;
  const closeDetails = () => {
    void writeActivity.cancel();
    close();
  };

  const launch = async () => {
    if (!playText || !liveConnected || launching || writeActivity.active)
      return;
    setLaunching(true);
    try {
      await CoreAPI.run({ text: playText });
    } catch (error) {
      logRunFailure("Failed to launch deck item", error, {
        action: "launchDeckItem",
      });
      showRateLimitedErrorToast(t("decks.itemLaunchError"));
    } finally {
      setLaunching(false);
    }
  };

  return (
    <SlideModal
      isOpen={isOpen}
      close={closeDetails}
      title={title}
      presentation={docked ? "pane" : "modal"}
      footerSkipLabel={t("accessibility.skipToActions")}
      footer={
        <ContextualWriteRail
          aria-label={t("decks.itemActions")}
          activity={writeActivity}
          writeDisabled={!launchText || !writeAvailable}
          busy={launching}
          onWrite={() => {
            if (launchText) void writeActivity.start(launchText);
          }}
          primaryAction={
            <LaunchButton
              label={t("decks.play")}
              launching={launching}
              unavailable={!playText || !liveConnected}
              busy={writeActivity.active}
              onLaunch={() => void launch()}
            />
          }
        >
          {canRemove && (
            <Button
              label={t("decks.remove")}
              icon={<Trash2Icon size={20} />}
              variant="text"
              layout="responsive"
              intent="destructive"
              className="whitespace-nowrap"
              disabled={!item || launching || writeActivity.active}
              disabledAppearance={
                launching || writeActivity.active ? "busy" : "unavailable"
              }
              onClick={() => {
                if (!item) return;
                closeDetails();
                onRemove(item);
              }}
            />
          )}
        </ContextualWriteRail>
      }
    >
      <div className="flex flex-col gap-3 py-2">
        {item && (
          <DeckArtwork
            item={item}
            detail
            enabled={isOpen}
            alt={t("library.imageAlt", {
              title,
              type: t("library.imageTypes.artwork"),
            })}
          />
        )}
        {displayText ? (
          <div className="flex flex-col gap-1">
            <p className="text-muted-foreground text-sm">
              {t("decks.zapScript")}
            </p>
            <p className="font-mono text-sm break-all whitespace-pre-wrap">
              {displayText}
            </p>
          </div>
        ) : item ? (
          <p className="text-muted-foreground text-sm">
            {t("decks.noPlayAction")}
          </p>
        ) : null}
        {linkTarget && metadata && (
          <>
            <LibraryMediaFacts
              target={linkTarget}
              systemName={resolveSystemName(
                linkTarget.systemId,
                metadata.title.system.name || linkTarget.systemId,
              )}
              facts={factView.facts}
              tags={factView.tags}
            />
            {factView.technicalFacts.length > 0 && (
              <TechnicalDetails>
                <LibraryFactRows
                  target={linkTarget}
                  facts={factView.technicalFacts}
                />
              </TechnicalDetails>
            )}
          </>
        )}
      </div>
    </SlideModal>
  );
}
