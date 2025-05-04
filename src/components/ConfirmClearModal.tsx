import { useTranslation } from "react-i18next";
import { SlideModal } from "@/components/SlideModal.tsx";
import { Button } from "@/components/wui/Button.tsx";

export function ConfirmClearModal(props: {
  isOpen: boolean;
  close: () => void;
  onConfirm: () => void;
}) {
  const { t } = useTranslation();
  return (
    <SlideModal
      isOpen={props.isOpen}
      close={props.close}
      title={t("create.custom.clearConfirmTitle")}
    >
      <div className="flex flex-col gap-4 py-4">
        <div className="flex gap-2">
          <Button
            variant="outline"
            label={t("nav.cancel")}
            onClick={props.close}
            className="flex-1"
          />
          <Button
            variant="outline"
            label={t("create.custom.clear")}
            onClick={() => {
              props.onConfirm();
              props.close();
            }}
            className="flex-1 border-error text-error"
          />
        </div>
      </div>
    </SlideModal>
  );
}