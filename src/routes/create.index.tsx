import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Capacitor } from "@capacitor/core";
import { ListPlusIcon, NfcIcon } from "lucide-react";
import { NextIcon, PlayIcon, SearchIcon, TextIcon } from "../lib/images";
import { useStatusStore } from "../lib/store";
import { useNfcWriter, WriteAction } from "../lib/writeNfcHook";
import { Card } from "../components/wui/Card";
import { Button } from "../components/wui/Button";
import { WriteModal } from "../components/WriteModal";
import { PageFrame } from "../components/PageFrame";
import { usePreferencesStore } from "../lib/preferencesStore";

export const Route = createFileRoute("/create/")({
  component: Create
});

function Create() {
  const connected = useStatusStore((state) => state.connected);
  const playing = useStatusStore((state) => state.playing);
  const nfcAvailable = usePreferencesStore((state) => state.nfcAvailable);
  const nfcWriter = useNfcWriter();
  // Track user intent to open modal; actual visibility derived from NFC status
  const [writeIntent, setWriteIntent] = useState(false);
  const writeOpen = writeIntent && nfcWriter.status === null;
  const closeWriteModal = async () => {
    setWriteIntent(false);
    await nfcWriter.end();
  };

  const { t } = useTranslation();

  return (
    <>
      <PageFrame
        headerCenter={
          <h1 className="text-foreground text-xl">{t("create.title")}</h1>
        }
      >
        <div className="flex flex-col gap-3">
          <Link to="/create/search" disabled={!connected} data-tour="create-search">
            <Card disabled={!connected}>
              <div className="flex flex-row items-center gap-3">
                <Button disabled={!connected} icon={<SearchIcon size="20" />} />
                <div className="flex grow flex-col">
                  <span className="font-semibold">
                    {t("create.searchGameHeading")}
                  </span>
                  <span className="text-sm">{t("create.searchGameSub")}</span>
                </div>
                <NextIcon size="20" />
              </div>
            </Card>
          </Link>

          <Card
            className="cursor-pointer"
            disabled={!connected || playing.mediaPath === ""}
            onClick={() => {
              if (playing.mediaPath !== "") {
                nfcWriter.write(WriteAction.Write, playing.mediaPath);
                setWriteIntent(true);
              }
            }}
          >
            <div className="flex flex-row items-center gap-3">
              <Button
                icon={<PlayIcon size="26" />}
                disabled={playing.mediaPath === "" && playing.mediaName === ""}
              />
              <div className="flex grow flex-col">
                <span className="font-semibold">
                  {t("create.currentGameHeading")}
                </span>
                <span className="text-sm">
                  {playing.mediaName
                    ? t("create.currentGameSub", { game: playing.mediaName })
                    : t("create.currentGameSubFallback")}
                </span>
              </div>
            </div>
          </Card>

          <Link to="/create/mappings" disabled={!connected}>
            <Card disabled={!connected}>
              <div className="flex flex-row items-center gap-3">
                <Button icon={<ListPlusIcon size="20" />} disabled={!connected} />
                <div className="flex grow flex-col">
                  <span className="font-semibold">
                    {t("create.mappingsHeading")}
                  </span>
                  <span className="text-sm">{t("create.mappingsSub")}</span>
                </div>
                <NextIcon size="20" />
              </div>
            </Card>
          </Link>

          <Link to="/create/custom">
            <Card>
              <div className="flex flex-row items-center gap-3">
                <Button icon={<TextIcon size="20" />} />
                <div className="flex grow flex-col">
                  <span className="font-semibold">
                    {t("create.customHeading")}
                  </span>
                  <span className="text-sm">{t("create.customSub")}</span>
                </div>
                <NextIcon size="20" />
              </div>
            </Card>
          </Link>

          <Link
            to="/create/nfc"
            disabled={!Capacitor.isNativePlatform() || !nfcAvailable}
          >
            <Card disabled={!Capacitor.isNativePlatform() || !nfcAvailable}>
              <div className="flex flex-row items-center gap-3">
                <Button
                  icon={<NfcIcon size="24" />}
                  disabled={!Capacitor.isNativePlatform() || !nfcAvailable}
                />
                <div className="flex grow flex-col">
                  <span className="font-semibold">
                    {t("create.nfcHeading")}
                  </span>
                  <span className="text-sm">{t("create.nfcSub")}</span>
                </div>
                <NextIcon size="20" />
              </div>
            </Card>
          </Link>
        </div>
      </PageFrame>
      <WriteModal isOpen={writeOpen} close={closeWriteModal} />
    </>
  );
}
