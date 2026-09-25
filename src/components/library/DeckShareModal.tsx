import { useState } from "react";
import { Clipboard } from "@capacitor/clipboard";
import { Capacitor } from "@capacitor/core";
import { CopyIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import toast from "react-hot-toast";
import { SlideModal } from "@/components/SlideModal";
import { Button } from "@/components/wui/Button";
import { logger } from "@/lib/logger";

export function DeckShareModal({
  deckId,
  isOpen,
  close,
}: {
  deckId: string;
  isOpen: boolean;
  close: () => void;
}) {
  const { t } = useTranslation();
  const [copying, setCopying] = useState(false);
  const url = `https://zpr.au/d$${deckId.toLowerCase()}`;

  const copy = async () => {
    if (copying) return;
    setCopying(true);
    try {
      if (Capacitor.isNativePlatform()) {
        await Clipboard.write({ string: url });
      } else {
        await navigator.clipboard.writeText(url);
      }
      toast.success(t("decks.linkCopied"));
    } catch (error) {
      logger.warn("Failed to copy deck share link", error, {
        category: "storage",
        action: "copyDeckLink",
      });
      toast.error(t("decks.copyLinkError"));
    } finally {
      setCopying(false);
    }
  };

  return (
    <SlideModal
      isOpen={isOpen}
      close={close}
      title={t("decks.share")}
      footer={
        <Button
          label={t("decks.copyLink")}
          icon={<CopyIcon size={20} />}
          intent="primary"
          className="w-full"
          disabled={copying}
          onClick={() => void copy()}
        />
      }
    >
      <div className="flex flex-col gap-2 py-4">
        <p className="text-muted-foreground text-sm">{t("decks.shareLink")}</p>
        <p className="font-mono text-sm break-all select-all">{url}</p>
      </div>
    </SlideModal>
  );
}
