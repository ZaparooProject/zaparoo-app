import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Capacitor } from "@capacitor/core";
import {
  EraserIcon,
  PencilOffIcon,
  ScanTextIcon,
  SquareAsteriskIcon
} from "lucide-react";
import { Label } from "@/components/ui/label";
import { Button } from "../components/wui/Button";
import { useSmartSwipe } from "../hooks/useSmartSwipe";
import { WriteModal } from "../components/WriteModal";
import { useNfcWriter, WriteAction } from "../lib/writeNfcHook";
import { PageFrame } from "../components/PageFrame";

export const Route = createFileRoute("/create/nfc")({
  component: NfcUtils
});

function NfcUtils() {
  const nfcWriter = useNfcWriter();
  const [writeOpen, setWriteOpen] = useState(false);
  const closeWriteModal = () => {
    setWriteOpen(false);
    nfcWriter.end();
  };

  const [eraseConfirm, setEraseConfirm] = useState(false);
  const [formatConfirm, setFormatConfirm] = useState(false);
  const [makeReadOnlyConfirm, setMakeReadOnlyConfirm] = useState(false);

  const { t } = useTranslation();

  useEffect(() => {
    if (nfcWriter.status !== null) {
      console.log(JSON.stringify(nfcWriter.result?.info.rawTag));
      setWriteOpen(false);
      nfcWriter.end();
    }
  }, [nfcWriter]);

  const navigate = useNavigate();
  const swipeHandlers = useSmartSwipe({
    onSwipeRight: () => navigate({ to: "/create" }),
    preventScrollOnSwipe: false
  });

  // TODO: check nfc is enabled

  return (
    <>
      <div {...swipeHandlers} className="h-full w-full overflow-y-auto">
        <PageFrame
          title={t("create.nfc.title")}
          back={() => navigate({ to: "/create" })}
        >
          <div className="flex flex-col gap-3">
            <Button
              icon={<ScanTextIcon size="20" />}
              label={t("create.nfc.read")}
              onClick={() => {
                nfcWriter.write(WriteAction.Read);
                setWriteOpen(true);
              }}
            />

            <Button
              icon={<EraserIcon size="20" />}
              label={
                eraseConfirm ? t("create.nfc.confirm") : t("create.nfc.erase")
              }
              onClick={() => {
                if (eraseConfirm) {
                  nfcWriter.write(WriteAction.Erase);
                  setWriteOpen(true);
                  setEraseConfirm(false);
                } else {
                  setEraseConfirm(true);
                  setTimeout(() => {
                    setEraseConfirm(false);
                  }, 3000);
                }
              }}
            />

            {Capacitor.getPlatform() === "android" && (
              <Button
                icon={<SquareAsteriskIcon size="20" />}
                label={
                  formatConfirm
                    ? t("create.nfc.confirm")
                    : t("create.nfc.format")
                }
                onClick={() => {
                  if (formatConfirm) {
                    nfcWriter.write(WriteAction.Format);
                    setWriteOpen(true);
                    setFormatConfirm(false);
                  } else {
                    setFormatConfirm(true);
                    setTimeout(() => {
                      setFormatConfirm(false);
                    }, 3000);
                  }
                }}
              />
            )}

            <Button
              icon={<PencilOffIcon size="20" />}
              label={
                makeReadOnlyConfirm
                  ? t("create.nfc.confirm")
                  : t("create.nfc.makeReadOnly")
              }
              onClick={() => {
                if (makeReadOnlyConfirm) {
                  nfcWriter.write(WriteAction.MakeReadOnly);
                  setWriteOpen(true);
                  setMakeReadOnlyConfirm(false);
                } else {
                  setMakeReadOnlyConfirm(true);
                  setTimeout(() => {
                    setMakeReadOnlyConfirm(false);
                  }, 3000);
                }
              }}
            />

            {nfcWriter.result?.info?.rawTag && nfcWriter.result?.info?.tag && (
              <div className="flex flex-col gap-3 pt-3">
                <Label htmlFor="uid">UID</Label>
                <div id="uid">{nfcWriter.result.info.tag.uid}</div>

                <Label htmlFor="value">Value</Label>
                <div id="value">{nfcWriter.result.info.tag.text}</div>

                <Label htmlFor="writeable">Tag writeable</Label>
                <div id="writeable">
                  {nfcWriter.result.info.rawTag.isWritable ? "Yes" : "No"}
                </div>

                <Label htmlFor="maxSize">Max size</Label>
                <div id="maxSize">{nfcWriter.result.info.rawTag.maxSize}</div>

                <Label htmlFor="techList">Tech types</Label>
                <div id="techList">
                  {nfcWriter.result.info.rawTag.techTypes?.join(", ")}
                </div>

                <Label htmlFor="ndefRecords">NDEF records</Label>
                <div id="ndefRecords">
                  {nfcWriter.result.info.rawTag.message?.records?.length}
                </div>

                {nfcWriter.result.info.rawTag.message?.records?.map(
                  (record, index) => (
                    <div key={index}>
                      <Label htmlFor={`record${index}`}>
                        Record {index + 1}
                      </Label>
                      <div
                        id={`record${index}`}
                        style={{ overflowWrap: "anywhere" }}
                      >
                        TNF: {record.tnf}
                        <br />
                        Type:{" "}
                        {record.type?.length && record.type[0].toString(16)}
                        <br />
                        Payload:{" "}
                        {record.payload
                          ?.map((byte) => byte.toString(16))
                          .join("")}
                      </div>
                    </div>
                  )
                )}
              </div>
            )}
          </div>
        </PageFrame>
      </div>
      <WriteModal isOpen={writeOpen} close={closeWriteModal} />
    </>
  );
}
