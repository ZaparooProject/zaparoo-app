import { createFileRoute, Link } from "@tanstack/react-router";
import { NextIcon, PlayIcon, SearchIcon, TextIcon } from "../lib/images";
import { useStatusStore } from "../lib/store";
import { useNfcWriter, WriteAction } from "../lib/writeNfcHook";
import { Card } from "../components/wui/Card";
import { Button } from "../components/wui/Button";
import { WriteModal } from "../components/WriteModal";
import { useEffect, useState } from "react";
import { PageFrame } from "../components/PageFrame";
import { useTranslation } from "react-i18next";
import { NfcIcon } from "lucide-react";

export const Route = createFileRoute("/create/")({
  component: Create
});

function Create() {
  const connected = useStatusStore((state) => state.connected);
  const playing = useStatusStore((state) => state.playing);

  const nfcWriter = useNfcWriter();
  const [writeOpen, setWriteOpen] = useState(false);
  const closeWriteModal = () => {
    setWriteOpen(false);
    nfcWriter.end();
  };

  const { t } = useTranslation();

  useEffect(() => {
    if (nfcWriter.status !== null) {
      setWriteOpen(false);
      nfcWriter.end();
    }
  }, [nfcWriter]);

  return (
    <>
      <PageFrame title={t("create.title")}>
        <div className="flex flex-col gap-3">
          <Link to="/create/search" disabled={!connected}>
            <Card disabled={!connected}>
              <div className="flex flex-row items-center gap-3">
                <Button disabled={!connected} icon={<SearchIcon size="20" />} />
                <div className="flex flex-grow flex-col">
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
            disabled={playing.mediaPath === ""}
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
              <div className="flex flex-grow flex-col">
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

          <Link to="/create/text">
            <Card>
              <div className="flex flex-row items-center gap-3">
                <Button icon={<TextIcon size="20" />} />
                <div className="flex flex-grow flex-col">
                  <span className="font-semibold">
                    {t("create.customHeading")}
                  </span>
                  <span className="text-sm">{t("create.customSub")}</span>
                </div>
                <NextIcon size="20" />
              </div>
            </Card>
          </Link>

          <Link to="/create/nfc">
            <Card>
              <div className="flex flex-row items-center gap-3">
                <Button icon={<NfcIcon size="24" />} />
                <div className="flex flex-grow flex-col">
                  <span className="font-semibold">
                    {t("create.nfcHeading")}
                  </span>
                  <span className="text-sm">{t("create.nfcSub")}</span>
                </div>
                <NextIcon size="20" />
              </div>
            </Card>
          </Link>

          {/*<Card disabled={true}>*/}
          {/*  <div className="flex flex-row items-center gap-3">*/}
          {/*    <Button icon={<NfcIcon size="24" />} />*/}
          {/*    <div className="flex flex-grow flex-col">*/}
          {/*      <span className="font-semibold">*/}
          {/*        {t("create.mappingsHeading")}*/}
          {/*      </span>*/}
          {/*      <span className="text-sm">{t("create.mappingsSub")}</span>*/}
          {/*    </div>*/}
          {/*    <NextIcon size="20" />*/}
          {/*  </div>*/}
          {/*</Card>*/}
        </div>
      </PageFrame>
      <WriteModal isOpen={writeOpen} close={closeWriteModal} />
    </>
  );
}
