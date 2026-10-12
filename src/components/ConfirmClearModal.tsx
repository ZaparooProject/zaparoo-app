import { useTranslation } from "react-i18next";
import { SlideModal } from "@/components/SlideModal.tsx";
import { Button } from "@/components/wui/Button.tsx";
import { ModalActionBar } from "@/components/wui/ModalActionBar";

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
      footer={
        <ModalActionBar
          secondaryAction={
            <Button
              variant="secondary"
              label={t("nav.cancel")}
              onClick={props.close}
            />
          }
          primaryAction={
            <Button
              variant="outline"
              intent="destructive"
              label={t("create.custom.clear")}
              onClick={() => {
                props.onConfirm();
                props.close();
              }}
            />
          }
        />
      }
    >
      {null}
    </SlideModal>
  );
}
