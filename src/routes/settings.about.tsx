import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { Browser } from "@capacitor/browser";
import { PageFrame } from "../components/PageFrame";
import { HeaderButton } from "../components/wui/HeaderButton";
import { Button } from "../components/wui/Button.tsx";
import { BackIcon } from "../lib/images";
import { useSmartSwipe } from "../hooks/useSmartSwipe";
import { usePageHeadingFocus } from "../hooks/usePageHeadingFocus";

export const Route = createFileRoute("/settings/about")({
  component: About,
});

function About() {
  const { t } = useTranslation();
  usePageHeadingFocus(t("settings.about.title"));
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
        <h1 className="text-foreground text-xl">{t("settings.about.title")}</h1>
      }
    >
      <div className="flex flex-col gap-8">
        <div className="text-center">
          <h2 className="text-2xl font-bold">Zaparoo App</h2>
          <p>
            {t("settings.about.version", {
              version: import.meta.env.VITE_VERSION,
            })}
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex flex-row justify-between">
            <span>Callan Barrett</span>
            <span>Developer</span>
          </div>
          <div className="flex flex-row justify-between">
            <span>Tim Wilsie</span>
            <span>UX Designer</span>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <h3 className="text-center text-lg font-bold">
            {t("settings.about.translationsBy")}
          </h3>
          <div className="flex flex-row justify-between">
            <span>Seexelas</span>
            <span>French/Français</span>
          </div>
          <div className="flex flex-row justify-between">
            <span>Phoenix, Anime0t4ku</span>
            <span>Dutch/Nederlands</span>
          </div>
          <div className="flex flex-row justify-between">
            <span>Anime0t4ku</span>
            <span>Japanese/日本語</span>
          </div>
          <div className="flex flex-row justify-between">
            <span>Pink Melon</span>
            <span>Korean/한국어</span>
          </div>
          <div className="flex flex-row justify-between">
            <span>RetroCastle</span>
            <span>Chinese (Simplified)/中文</span>
          </div>
          <div className="flex flex-row justify-between">
            <span>Ze Conehead</span>
            <span>German/Deutsch</span>
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <h3 className="text-center text-lg font-bold">
            {t("settings.about.wizzodev")}
          </h3>

          <div className="text-center">
            Jon, <span style={{ color: "#F1C40D" }}>RetroRGB</span>,{" "}
            <span style={{ color: "#F1C40D" }}>Jose BG</span>,{" "}
            <span style={{ color: "#F1C40D" }}>Dan Doyle</span>,{" "}
            <span style={{ color: "#F1C40D" }}>Phil Felice</span>,{" "}
            <span style={{ color: "#F1C40D" }}>Glenn</span>,{" "}
            <span style={{ color: "#F1C40D" }}>Alexander Facchini</span>,{" "}
            <span style={{ color: "#F1C40D" }}>Lu&apos;s Retro Source</span>,{" "}
            <span style={{ color: "#F1C40D" }}>Tony Shadwick</span>,{" "}
            <span style={{ color: "#F1C40D" }}>Clinton Cronin</span>,{" "}
            Tuxosaurus,{" "}
            <span style={{ color: "#E74C3C" }}>Retrosoft Studios</span>, Casey
            McGinty, <span style={{ color: "#E91E63" }}>Biddle</span>,{" "}
            <span style={{ color: "#F1C40D" }}>
              Gentlemen&apos;s Pixel Club
            </span>
            , <span style={{ color: "#F1C40D" }}>VolJoe</span>,{" "}
            <span style={{ color: "#F1C40D" }}>Shijuro</span>,{" "}
            <span style={{ color: "#F1C40D" }}>Tim Sullivan</span>,{" "}
            <span style={{ color: "#F1C40D" }}>TheJesusFish</span>,{" "}
            <span style={{ color: "#F1C40D" }}>disctoad</span>
          </div>

          <Button
            label={t("settings.about.joinPatreon")}
            variant="outline"
            onClick={() =>
              Browser.open({
                url: "https://patreon.com/wizzo",
              })
            }
          />
        </div>
      </div>
    </PageFrame>
  );
}
