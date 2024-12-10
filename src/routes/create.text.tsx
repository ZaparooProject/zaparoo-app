import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ClearIcon, CreateIcon, PlayIcon } from "../lib/images";
import { TTA } from "../lib/coreApi.ts";
import { Button } from "../components/wui/Button";
import { useSwipeable } from "react-swipeable";
import { useStatusStore } from "../lib/store";
import { WriteModal } from "../components/WriteModal";
import { useEffect, useState } from "react";
import { WriteAction, useNfcWriter } from "../lib/writeNfcHook";
import { PageFrame } from "../components/PageFrame";
import { useTranslation } from "react-i18next";
import { Preferences } from "@capacitor/preferences";

const initData = {
  customText: ""
};

export const Route = createFileRoute("/create/text")({
  loader: async () => {
    initData.customText =
      (await Preferences.get({ key: "customText" })).value || "";
  },
  component: CustomText
});

function CustomText() {
  const [customText, setCustomText] = useState(initData.customText);
  const connected = useStatusStore((state) => state.connected);
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

  const navigate = useNavigate();
  const swipeHandlers = useSwipeable({
    onSwipedRight: () => navigate({ to: "/create" })
  });

  return (
    <>
      <div {...swipeHandlers}>
        <PageFrame
          title={t("create.custom.title")}
          back={() => navigate({ to: "/create" })}
        >
          <div className="flex flex-col gap-3">
            <textarea
              className="border border-solid border-bd-input bg-background p-3"
              placeholder={t("create.custom.textPlaceholder")}
              value={customText}
              autoCapitalize="off"
              onChange={(e) => {
                setCustomText(e.target.value);
                Preferences.set({ key: "customText", value: e.target.value });
              }}
              style={{
                resize: "none"
              }}
              rows={10}
            />

            <Button
              icon={<CreateIcon size="20" />}
              label={t("create.custom.write")}
              disabled={customText === ""}
              onClick={() => {
                if (customText !== "") {
                  nfcWriter.write(WriteAction.Write, customText);
                  setWriteOpen(true);
                }
              }}
            />

            <div className="flex flex-row gap-2">
              <Button
                icon={<PlayIcon size="20" />}
                label={t("create.custom.run")}
                onClick={() => {
                  TTA.launch({
                    uid: "",
                    text: customText
                  });
                }}
                variant="outline"
                disabled={customText === "" || !connected}
                className="w-full"
              />

              <Button
                icon={<ClearIcon size="20" />}
                label={t("create.custom.clear")}
                onClick={() => {
                  setCustomText("");
                  Preferences.remove({ key: "customText" });
                }}
                variant="outline"
                className="w-full"
              />
            </div>
          </div>
        </PageFrame>
      </div>
      <WriteModal isOpen={writeOpen} close={closeWriteModal} />
    </>
  );
}
