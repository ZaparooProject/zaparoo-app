import { useTranslation } from "react-i18next";
import { SlideModal } from "../SlideModal";
import { Button } from "../wui/Button";

interface StopConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

export function StopConfirmModal({ isOpen, onClose, onConfirm }: StopConfirmModalProps) {
  const { t } = useTranslation();

  return (
    <SlideModal
      isOpen={isOpen}
      close={onClose}
      title={t("create.nfc.confirm")}
    >
      <div className="flex flex-col gap-4 p-4">
        <p className="text-center">{t("stopPlaying")}</p>
        <div className="flex flex-row justify-center gap-4">
          <Button
            label={t("nav.cancel")}
            variant="outline"
            onClick={onClose}
          />
          <Button
            label={t("yes")}
            onClick={onConfirm}
          />
        </div>
      </div>
    </SlideModal>
  );
}