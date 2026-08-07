import { useTranslation } from "react-i18next";
import { Bell } from "lucide-react";
import { useStatusStore } from "@/lib/store";
import { useHaptics } from "@/hooks/useHaptics";
import { HeaderButton } from "@/components/wui/HeaderButton";
import { NotificationBadge } from "@/components/NotificationBadge";

export function InboxButton() {
  const { t } = useTranslation();
  const { impact } = useHaptics();
  const setInboxModalOpen = useStatusStore((state) => state.setInboxModalOpen);
  const inboxCount = useStatusStore((state) => state.inboxMessages.length);

  const hasNotifications = inboxCount > 0;
  const label = hasNotifications
    ? t("inbox.openLabelWithCount", { count: inboxCount })
    : t("inbox.openLabel");

  return (
    <HeaderButton
      onClick={() => {
        impact("light");
        setInboxModalOpen(true);
      }}
      icon={
        <span className="relative">
          <Bell size={24} aria-hidden="true" />
          <NotificationBadge count={inboxCount} className="-top-2 -right-2" />
        </span>
      }
      title={label}
      aria-label={label}
    />
  );
}
