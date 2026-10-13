import { createFileRoute, useRouter } from "@tanstack/react-router";
import { Browser } from "@capacitor/browser";
import { useTranslation } from "react-i18next";
import { Card } from "@/components/wui/Card";
import { HeaderButton } from "@/components/wui/HeaderButton";
import { PageFrame } from "@/components/PageFrame";
import { BackIcon, ExternalIcon } from "@/lib/images";
import { usePageHeadingFocus } from "@/hooks/usePageHeadingFocus";
import { useHapticPress } from "@/hooks/useHapticPress";
import { appBackNavigationOptions } from "@/lib/tabSessionStore";

export const Route = createFileRoute("/settings/help")({
  component: Help,
});

export function Help() {
  const { t } = useTranslation();
  const headingRef = usePageHeadingFocus<HTMLHeadingElement>(
    t("settings.help.title"),
  );
  const router = useRouter();
  const goBack = () =>
    void router.navigate(appBackNavigationOptions("/settings"));
  const handleHapticPress = useHapticPress();
  // Every entry leaves the app, so each row carries the external-link icon.
  const link = (label: string, url: string) => (
    <button
      type="button"
      className="settings-nav-row w-full text-left"
      onPointerUp={handleHapticPress}
      onClick={() => Browser.open({ url })}
    >
      <span>{t(label)}</span>
      <span aria-hidden="true" className="text-muted-foreground shrink-0">
        <ExternalIcon size="20" />
      </span>
    </button>
  );

  return (
    <PageFrame
      headerMode="content-wide"
      breadcrumbs={[{ to: "/settings", label: t("settings.title") }]}
      onSwipeBack={goBack}
      headerLeft={
        <HeaderButton
          onClick={goBack}
          icon={<BackIcon size="24" />}
          aria-label={t("nav.back")}
        />
      }
      headerCenter={
        <h1 ref={headingRef} className="text-foreground text-xl">
          {t("settings.help.title")}
        </h1>
      }
    >
      <div className="flex flex-col gap-5">
        <Card className="flex flex-col">
          {link("settings.help.main", "https://zaparoo.org/")}
        </Card>
        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-semibold">
            {t("settings.help.documentationLabel")}
          </h2>
          <Card className="flex flex-col">
            {link("settings.help.taptoWiki", "https://zaparoo.org/docs/")}
            {link(
              "settings.help.gettingStarted",
              "https://zaparoo.org/docs/getting-started/",
            )}
            {link(
              "settings.help.commandReference",
              "https://zaparoo.org/docs/zapscript/",
            )}
          </Card>
        </section>
        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-semibold">
            {t("settings.help.communityLabel")}
          </h2>
          <Card className="flex flex-col">
            {link("settings.help.discord", "https://zaparoo.org/discord")}
            {link("settings.help.reddit", "https://reddit.com/r/Zaparoo")}
          </Card>
        </section>
        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-semibold">
            {t("settings.help.technicalSupport")}
          </h2>
          <Card className="flex flex-col">
            {link(
              "settings.help.reportIssue",
              "https://github.com/ZaparooProject/zaparoo-app/issues/new",
            )}
          </Card>
          <p className="text-sm">
            {t("settings.help.emailLabel")}{" "}
            <a className="underline" href="mailto:support@zaparoo.com">
              support@zaparoo.com
            </a>
          </p>
        </section>
      </div>
    </PageFrame>
  );
}
