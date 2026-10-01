import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Trash2Icon } from "lucide-react";
import { CoreAPI, logRunFailure } from "@/lib/coreApi";
import { deckItemLaunchText } from "@/lib/decks";
import type { DeckItem } from "@/lib/models";
import { ConnectionState, useStatusStore } from "@/lib/store";
import { showRateLimitedErrorToast } from "@/lib/toastUtils";
import { SlideModal } from "@/components/SlideModal";
import { Button } from "@/components/wui/Button";
import { ModalActionRail } from "@/components/wui/ModalActionRail";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { PlayIcon } from "@/lib/images";
import { useActiveDeviceKey } from "@/hooks/useActiveDeviceKey";
import { useContextualNfcWrite } from "@/hooks/useContextualNfcWrite";
import {
  ReaderActivityAction,
  ReaderActivityStatus,
} from "@/components/ReaderActivityAction";
import { DeckArtwork } from "@/components/library/DeckArtwork";

function cardRenderedUrl(item: DeckItem | null): string | null {
  if (item?.kind !== "card") return null;
  const image = item.metadata?.rendered_url;
  if (typeof image !== "string") return null;
  try {
    const url = new URL(image);
    return url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
}

export function DeckItemDetailsModal({
  item,
  deckId,
  isOpen,
  close,
  canRemove,
  onRemove,
  writeAvailable,
}: {
  item: DeckItem | null;
  deckId: string;
  isOpen: boolean;
  close: () => void;
  canRemove: boolean;
  onRemove: (item: DeckItem) => void;
  writeAvailable: boolean;
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
  const imageUrl = cardRenderedUrl(item);
  const deviceKey = useActiveDeviceKey();
  const writeActivity = useContextualNfcWrite(
    JSON.stringify([deviceKey, deckId, item?.id, launchText]),
    isOpen,
  );
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
      footer={
        <ModalActionRail
          aria-label={t("decks.itemActions")}
          readerAction
          status={
            writeActivity.state === "attention" ||
            writeActivity.state === "error" ? (
              <ReaderActivityStatus
                state={writeActivity.state}
                onCancel={() => void writeActivity.cancel()}
              />
            ) : undefined
          }
          actions={
            <>
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
              <ReaderActivityAction
                state={writeActivity.state}
                label={t("library.writeAction")}
                busy={launching}
                disabled={
                  !launchText ||
                  !writeAvailable ||
                  launching ||
                  writeActivity.externalWriteActive
                }
                onStart={() => {
                  if (launchText) void writeActivity.start(launchText);
                }}
                onCancel={() => void writeActivity.cancel()}
                onRetry={() => void writeActivity.retry()}
              />
            </>
          }
          primaryAction={
            <Button
              label={t("decks.play")}
              aria-label={launching ? t("library.launching") : t("decks.play")}
              icon={
                launching ? (
                  <LoadingSpinner size={20} decorative />
                ) : (
                  <PlayIcon size="20" />
                )
              }
              intent="primary"
              disabled={
                !playText || !liveConnected || launching || writeActivity.active
              }
              disabledAppearance={
                launching || writeActivity.active ? "busy" : "unavailable"
              }
              onClick={() => void launch()}
            />
          }
        />
      }
    >
      <div className="flex flex-col gap-3 py-2">
        {imageUrl && (
          <img
            src={imageUrl}
            alt={t("library.imageAlt", {
              title,
              type: t("library.imageTypes.artwork"),
            })}
            loading="lazy"
            className="h-64 w-full object-contain"
          />
        )}
        {item?.kind === "script" && (
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
      </div>
    </SlideModal>
  );
}
