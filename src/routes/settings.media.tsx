import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { MediaDatabaseCard } from "@/components/MediaDatabaseCard";
import { MediaScrapeCard } from "@/components/MediaScrapeCard";
import { CoreOutdatedNotice } from "@/components/CoreOutdatedNotice";
import { PageFrame } from "@/components/PageFrame";
import { HeaderButton } from "@/components/wui/HeaderButton";
import { BackIcon } from "@/lib/images";
import { useSmartSwipe } from "@/hooks/useSmartSwipe";
import { usePageHeadingFocus } from "@/hooks/usePageHeadingFocus";

export const Route = createFileRoute("/settings/media")({
  component: MediaSettings,
});

function MediaSettings() {
  const { t } = useTranslation();
  usePageHeadingFocus(t("settings.media.title"));
  const router = useRouter();
  const goBack = () => router.history.back();
  const swipeHandlers = useSmartSwipe({
    onSwipeRight: goBack,
    preventScrollOnSwipe: false,
  });

  return (
    <PageFrame
      {...swipeHandlers}
      headerLeft={
        <HeaderButton
          onClick={goBack}
          icon={<BackIcon size="24" />}
          aria-label={t("nav.back")}
        />
      }
      headerCenter={
        <h1 className="text-foreground text-xl">{t("settings.media.title")}</h1>
      }
    >
      <div className="flex flex-col gap-5">
        <CoreOutdatedNotice />
        <MediaDatabaseCard />
        <MediaScrapeCard />
      </div>
    </PageFrame>
  );
}
