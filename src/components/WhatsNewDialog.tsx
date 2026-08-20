import { useTranslation } from "react-i18next";
import { SlideModal } from "@/components/SlideModal";
import { Button } from "@/components/wui/Button";
import type { WhatsNewAnnouncement } from "@/lib/whatsNew";

export function WhatsNewDialog(props: {
  isOpen: boolean;
  announcement: WhatsNewAnnouncement | null;
  onDismiss: () => void;
}) {
  const { t } = useTranslation();

  if (!props.announcement) return null;

  return (
    <SlideModal
      isOpen={props.isOpen}
      close={props.onDismiss}
      title={props.announcement.title}
      footer={
        <Button
          label={t("whatsNew.gotIt")}
          intent="primary"
          onClick={props.onDismiss}
          className="w-full"
        />
      }
    >
      <ul className="text-muted-foreground list-disc space-y-2 py-2 pl-5 text-sm">
        {props.announcement.items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </SlideModal>
  );
}
