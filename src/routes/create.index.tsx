import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Capacitor } from "@capacitor/core";
import { Nfc } from "@capawesome-team/capacitor-nfc";
import { ListPlusIcon, NfcIcon } from "lucide-react";
import { NextIcon, PlayIcon, SearchIcon, TextIcon } from "../lib/images";
import { useStatusStore } from "../lib/store";
import { useNfcWriter, WriteAction } from "../lib/writeNfcHook";
import { Card } from "../components/wui/Card";
import { Button } from "../components/wui/Button";
import { WriteModal } from "../components/WriteModal";
import { PageFrame } from "../components/PageFrame";

export const Route = createFileRoute("/create/")({
  component: Create
});

function Create() {
  const connected = useStatusStore((state) => state.connected);
  const playing = useStatusStore((state) => state.playing);

  const [nfcAvailable, setNfcAvailable] = useState(false);
  const nfcWriter = useNfcWriter();
  const [writeOpen, setWriteOpen] = useState(false);
  const closeWriteModal = async () => {
    setWriteOpen(false);
    await nfcWriter.end();
  };

  const { t } = useTranslation();

  useEffect(() => {
    if (nfcWriter.status !== null) {
      setWriteOpen(false);
    }
  }, [nfcWriter]);

  useEffect(() => {
    const checkNfcAvailability = async () => {
      if (Capacitor.isNativePlatform()) {
        try {
          const result = await Nfc.isAvailable();
          setNfcAvailable(result.nfc);
        } catch (error) {
          console.log("NFC availability check failed:", error);
          setNfcAvailable(false);
        }
      } else {
        setNfcAvailable(false);
      }
    };

    checkNfcAvailability();
  }, []);

  return (
    <>
      <PageFrame title={t("create.title")}>
        <div className="flex flex-col gap-3">
          <Link to="/create/search" disabled={!connected}>
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
                setWriteOpen(true);
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
                <Button icon={<ListPlusIcon size="20" />} />
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

          <Link to="/create/nfc" disabled={!Capacitor.isNativePlatform() || !nfcAvailable}>
            <Card disabled={!Capacitor.isNativePlatform() || !nfcAvailable}>
              <div className="flex flex-row items-center gap-3">
                <Button icon={<NfcIcon size="24" />} />
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
