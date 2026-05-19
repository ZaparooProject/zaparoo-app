import { useTranslation } from "react-i18next";
import { Bell } from "lucide-react";
import { useStatusStore } from "@/lib/store";
import { useHaptics } from "@/hooks/useHaptics";
import { HeaderButton } from "@/components/wui/HeaderButton";

export function InboxButton() {
  const { t } = useTranslation();
  const { impact } = useHaptics();
  const setInboxModalOpen = useStatusStore((state) => state.setInboxModalOpen);
  const unreadCount = useStatusStore((state) => state.inboxMessages.length);

  const hasUnread = unreadCount > 0;
  const label = hasUnread
    ? t("inbox.openLabelWithCount", { count: unreadCount })
    : t("inbox.openLabel");

  return (
    <HeaderButton
      onClick={() => {
        impact("light");
        setInboxModalOpen(true);
      }}
      icon={<Bell size={24} aria-hidden="true" />}
      title={label}
      aria-label={label}
      className={hasUnread ? "attention-throb" : undefined}
    />
  );
}
