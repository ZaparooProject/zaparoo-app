import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useSwipeable } from "react-swipeable";
import { PageFrame } from "../components/PageFrame";
import { useTranslation } from "react-i18next";
import { Browser } from "@capacitor/browser";
import { Button } from "../components/wui/Button.tsx";

export const Route = createFileRoute("/settings/about")({
  component: About
});

function About() {
  const navigate = useNavigate();
  const swipeHandlers = useSwipeable({
    onSwipedRight: () => navigate({ to: "/settings" })
  });

  const { t } = useTranslation();

  return (
    <div {...swipeHandlers}>
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
          </div>

          <div className="flex flex-col gap-3">
            <h3 className="text-center text-lg font-bold">
              {t("settings.about.wizzodev")}
            </h3>

            <div className="text-center">
              batty, birdybro, Jon, RetroRGB, Jose BG, Porkchop Express, Tony
              Escobar, Mark DeRidder, Dan Doyle, Phil Felice, atrac17, Glenn,
              Alexander Facchini, Lu's Retro Source, Alexis Conrad, Patrick
              McCarron, Oyster_Source, Clinton Cronin, Tuxosaurus, EntirelyTom,
              the_remora, Retrosoft Studios, Casey McGinty, Biddle, Chris
              Platts, RobF228, Gentlemen's Pixel Club
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

          <div className="flex flex-col gap-2">
            <h3 className="text-center text-lg font-bold">
              {t("settings.about.contributors")}
            </h3>

            <div className="text-center">
              Aitor Gómez García, Andrea Bogazzi, Anime0t4ku, ArielAces,
              BedroomNinja, EntirelyTom, Gaz, Phoenix, Ranny Snice, RetroCastle,
              Sensorium, Spice_King, TheTrain, theypsilon, Tim Wilsie, V1605,
              whatskenmaking, wizzo, Ziggurat
            </div>
          </div>
        </div>
      </PageFrame>
    </div>
  );
}
