import { createFileRoute, useRouter } from "@tanstack/react-router";
import { Browser } from "@capacitor/browser";
import { useTranslation } from "react-i18next";
import { Button } from "../components/wui/Button";
import { HeaderButton } from "../components/wui/HeaderButton";
import { useSmartSwipe } from "../hooks/useSmartSwipe";
import { PageFrame } from "../components/PageFrame";
import { BackIcon } from "../lib/images";

export const Route = createFileRoute("/settings/help")({
  component: Help
});

function Help() {
  const router = useRouter();
  const goBack = () => router.history.back();
  const swipeHandlers = useSmartSwipe({
    onSwipeRight: goBack,
    preventScrollOnSwipe: false
  });

  const { t } = useTranslation();

  return (
    <PageFrame
      {...swipeHandlers}
      headerLeft={
        <HeaderButton onClick={goBack} icon={<BackIcon size="24" />} />
      }
      headerCenter={
        <h1 className="text-foreground text-xl">{t("settings.help.title")}</h1>
      }
    >
        <div className="flex flex-col gap-4">
          <Button
            label={t("settings.help.main")}
            variant="outline"
            onClick={() =>
              Browser.open({
                url: "https://zaparoo.org/"
              })
            }
          />
          <div className="flex flex-col gap-4">
            <h2 className="text-center text-lg font-semibold">
              {t("settings.help.documentationLabel")}
            </h2>
            <Button
              label={t("settings.help.taptoWiki")}
              variant="outline"
              onClick={() =>
                Browser.open({
                  url: "https://zaparoo.org/docs/"
                })
              }
            />
            <Button
              label={t("settings.help.gettingStarted")}
              variant="outline"
              onClick={() =>
                Browser.open({
                  url: "https://zaparoo.org/docs/getting-started/"
                })
              }
            />
            <Button
              label={t("settings.help.commandReference")}
              variant="outline"
              onClick={() =>
                Browser.open({
                  url: "https://zaparoo.org/docs/zapscript/"
                })
              }
            />
          </div>

          <div className="flex flex-col gap-4">
            <h2 className="text-center text-lg font-semibold">
              {t("settings.help.communityLabel")}
            </h2>
            <Button
              label={t("settings.help.discord")}
              variant="outline"
              onClick={() =>
                Browser.open({
                  url: "https://zaparoo.org/discord"
                })
              }
            />
            <Button
              label={t("settings.help.reddit")}
              variant="outline"
              onClick={() =>
                Browser.open({
                  url: "https://reddit.com/r/Zaparoo"
                })
              }
            />
          </div>

          <div className="flex flex-col gap-4">
            <h2 className="text-center text-lg font-semibold">
              {t("settings.help.technicalSupport")}
            </h2>
            <Button
              label={t("settings.help.reportIssue")}
              variant="outline"
              onClick={() =>
                Browser.open({
                  url: "https://github.com/ZaparooProject/zaparoo-app/issues/new"
                })
              }
            />
            <p className="text-center">
              {t("settings.help.emailLabel")}{" "}
              <a className="underline" href="mailto:support@zaparoo.com">
                support@zaparoo.com
              </a>
            </p>
          </div>
        </div>
      </PageFrame>
  );
}
