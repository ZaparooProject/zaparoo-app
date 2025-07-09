import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { PageFrame } from "../components/PageFrame";
import { useTranslation } from "react-i18next";
import { Browser } from "@capacitor/browser";
import { Button } from "../components/wui/Button.tsx";

export const Route = createFileRoute("/settings/about")({
  component: About
});

function About() {
  const navigate = useNavigate();

  const { t } = useTranslation();

  return (
    <PageFrame
      title={t("settings.about.title")}
      back={() => navigate({ to: "/settings" })}
    >
      <div className="flex flex-col gap-8">
        <div className="text-center">
          <h2 className="text-2xl font-bold">Zaparoo App</h2>
          <p>
            {t("settings.about.version", {
              version: import.meta.env.VITE_VERSION
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
            <span>Phoenix</span>
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
            <span style={{ color: "#F1C40D" }}>Mark DeRidder</span>,{" "}
            <span style={{ color: "#F1C40D" }}>Dan Doyle</span>,{" "}
            <span style={{ color: "#F1C40D" }}>Phil Felice</span>,{" "}
            <span style={{ color: "#F1C40D" }}>Glenn</span>,{" "}
            <span style={{ color: "#F1C40D" }}>Alexander Facchini</span>,{" "}
            <span style={{ color: "#F1C40D" }}>Lu's Retro Source</span>,{" "}
            <span style={{ color: "#F1C40D" }}>Alexis Conrad</span>,{" "}
            <span style={{ color: "#F1C40D" }}>Tony Shadwick</span>,{" "}
            <span style={{ color: "#F1C40D" }}>Clinton Cronin</span>,{" "}
            Tuxosaurus, <span style={{ color: "#F1C40D" }}>EntirelyTom</span>,{" "}
            <span style={{ color: "#F1C40D" }}>the_remora</span>,{" "}
            <span style={{ color: "#E74C3C" }}>Retrosoft Studios</span>, Casey
            McGinty, <span style={{ color: "#E91E63" }}>Biddle</span>,{" "}
            <span style={{ color: "#F1C40D" }}>Chris Platts</span>,{" "}
            <span style={{ color: "#F1C40D" }}>Gentlemen's Pixel Club</span>,{" "}
            <span style={{ color: "#F1C40D" }}>VolJoe</span>,{" "}
            <span style={{ color: "#F1C40D" }}>Shijuro</span>,{" "}
            <span style={{ color: "#F1C40D" }}>Tim Sullivan</span>,{" "}
            <span style={{ color: "#F1C40D" }}>TheJesusFish</span>
          </div>

          <Button
            label={t("settings.about.joinPatreon")}
            variant="outline"
            onClick={() =>
              Browser.open({
                url: "https://patreon.com/wizzo"
              })
            }
          />
        </div>
      </div>
    </PageFrame>
  );
}
