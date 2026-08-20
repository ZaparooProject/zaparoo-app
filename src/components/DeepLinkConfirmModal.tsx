import { useTranslation } from "react-i18next";
import { SlideModal } from "@/components/SlideModal";
import { Button } from "@/components/wui/Button";
import { RunQueueItem } from "@/lib/store";

export function DeepLinkConfirmModal(props: {
  item: RunQueueItem | null;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();

  if (!props.item) {
    return null;
  }

  return (
    <SlideModal
      isOpen
      close={props.onCancel}
      title={t("deepLinks.confirmTitle")}
      fixedHeight="auto"
      footer={
        <div className="flex gap-3">
          <Button
            variant="outline"
            label={t("nav.cancel")}
            onClick={props.onCancel}
            className="flex-1"
          />
          <Button
            label={t("deepLinks.confirmRun")}
            onClick={props.onConfirm}
            intent="primary"
            className="flex-1"
          />
        </div>
      }
    >
      <div className="flex flex-col gap-4 py-4">
        <p className="text-muted-foreground text-sm">
          {t("deepLinks.confirmDescription")}
        </p>
        <p className="text-foreground text-sm font-medium break-all">
          {props.item.value}
        </p>
      </div>
    </SlideModal>
  );
}
