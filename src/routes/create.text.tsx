import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { CreateIcon } from "../lib/images";
import { Button } from "../components/wui/Button";
import { useSmartSwipe } from "../hooks/useSmartSwipe";
import { WriteModal } from "../components/WriteModal";
import { useEffect, useState } from "react";
import { useNfcWriter, WriteAction } from "../lib/writeNfcHook";
import { PageFrame } from "../components/PageFrame";
import { useTranslation } from "react-i18next";
import { Preferences } from "@capacitor/preferences";
import { ZapScriptInput } from "@/components/ZapScriptInput.tsx";

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

  useEffect(() => {
    Preferences.set({ key: "customText", value: customText });
  }, [customText]);

  const navigate = useNavigate();
  const swipeHandlers = useSmartSwipe({
    onSwipeRight: () => navigate({ to: "/create" }),
    preventScrollOnSwipe: false
  });

  return (
    <>
      <div {...swipeHandlers} className="h-full w-full overflow-y-auto">
        <PageFrame
          title={t("create.custom.title")}
          back={() => navigate({ to: "/create" })}
        >
          <div className="flex flex-col gap-3">
            <ZapScriptInput
              value={customText}
              setValue={setCustomText}
              showPalette
              rows={5}
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
          </div>
        </PageFrame>
      </div>
      <WriteModal isOpen={writeOpen} close={closeWriteModal} />
    </>
  );
}
