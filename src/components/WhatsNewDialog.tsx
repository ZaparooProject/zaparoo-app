import { useTranslation } from "react-i18next";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
    <Dialog
      open={props.isOpen}
      onOpenChange={(open) => !open && props.onDismiss()}
    >
      <DialogContent
        className="max-w-[340px] gap-5"
        aria-describedby={undefined}
        onOpenChange={(open) => !open && props.onDismiss()}
      >
        <DialogHeader>
          <DialogTitle>{props.announcement.title}</DialogTitle>
        </DialogHeader>
        <ul className="text-muted-foreground list-disc space-y-2 pl-5 text-sm">
          {props.announcement.items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <Button
          label={t("whatsNew.gotIt")}
          intent="primary"
          onClick={props.onDismiss}
          className="w-full"
        />
      </DialogContent>
    </Dialog>
  );
}
