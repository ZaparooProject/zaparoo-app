import { useTranslation } from "react-i18next";
import { MediaWriteTargetSelector } from "@/components/MediaWriteTargetSelector";
import { SlideModal } from "@/components/SlideModal";
import { Button } from "@/components/wui/Button";
import { useMediaWriteTarget } from "@/hooks/useMediaWriteTarget";
import { CreateIcon } from "@/lib/images";
import type { MediaWriteSource } from "@/lib/mediaWriteTarget";

export function MediaWriteTargetModal(props: {
  isOpen: boolean;
  close: () => void;
  media: MediaWriteSource | null;
  onWrite: (value: string) => void;
}) {
  const { t } = useTranslation();
  const target = useMediaWriteTarget(props.media);

  return (
    <SlideModal
      isOpen={props.isOpen}
      close={props.close}
      title={t("create.search.writeLabel")}
      footer={
        <Button
          label={t("create.search.writeLabel")}
          icon={<CreateIcon size="20" />}
          intent="primary"
          className="w-full"
          disabled={!target.selectedValue}
          onClick={() => props.onWrite(target.selectedValue)}
        />
      }
    >
      {props.media && (
        <div className="py-2">
          <MediaWriteTargetSelector media={props.media} target={target} />
        </div>
      )}
    </SlideModal>
  );
}
