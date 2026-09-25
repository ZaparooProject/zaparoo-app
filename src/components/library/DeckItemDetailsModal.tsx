import { useState } from "react";
import { useTranslation } from "react-i18next";
import { PlayIcon, Trash2Icon } from "lucide-react";
import { CoreAPI, logRunFailure } from "@/lib/coreApi";
import { deckItemLaunchText } from "@/lib/decks";
import type { DeckItem } from "@/lib/models";
import { ConnectionState, useStatusStore } from "@/lib/store";
import { showRateLimitedErrorToast } from "@/lib/toastUtils";
import { SlideModal } from "@/components/SlideModal";
import { Button } from "@/components/wui/Button";
import { ModalActionRail } from "@/components/wui/ModalActionRail";
import { CreateIcon } from "@/lib/images";
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
  onWrite,
}: {
  item: DeckItem | null;
  deckId: string;
  isOpen: boolean;
  close: () => void;
  canRemove: boolean;
  onRemove: (item: DeckItem) => void;
  writeAvailable: boolean;
  onWrite: (text: string) => void;
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

  const launch = async () => {
    if (!playText || !liveConnected || launching) return;
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
      close={close}
      title={title}
      footer={
        <ModalActionRail
          aria-label={t("decks.itemActions")}
          actions={
            <>
              {canRemove && (
                <Button
                  label={t("decks.remove")}
                  icon={<Trash2Icon size={20} />}
                  variant="text"
                  layout="responsive"
                  intent="destructive"
                  className="enabled:!text-error whitespace-nowrap"
                  disabled={!item || launching}
                  onClick={() => {
                    if (!item) return;
                    close();
                    onRemove(item);
                  }}
                />
              )}
              <Button
                label={t("library.writeAction")}
                icon={<CreateIcon size="20" />}
                variant="text"
                layout="responsive"
                className="whitespace-nowrap"
                disabled={!launchText || !writeAvailable || launching}
                onClick={() => {
                  if (!launchText) return;
                  close();
                  onWrite(launchText);
                }}
              />
            </>
          }
          primaryAction={
            <Button
              label={t("decks.play")}
              icon={<PlayIcon size={20} />}
              intent="primary"
              className="!min-h-0"
              disabled={!playText || !liveConnected || launching}
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
