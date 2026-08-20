import { useTranslation } from "react-i18next";
import { SlideModal } from "../SlideModal";
import { Button } from "../wui/Button";

interface StopConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  description?: string;
}

export function StopConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  description,
}: StopConfirmModalProps) {
  const { t } = useTranslation();

  return (
    <SlideModal
      isOpen={isOpen}
      close={onClose}
      title={t("create.nfc.confirm")}
      footer={
        <div className="flex flex-row justify-center gap-4">
          <Button label={t("nav.cancel")} variant="outline" onClick={onClose} />
          <Button label={t("yes")} intent="primary" onClick={onConfirm} />
        </div>
      }
    >
      <div className="p-4">
        <p className="text-center">{description ?? t("stopPlaying")}</p>
      </div>
    </SlideModal>
  );
}
