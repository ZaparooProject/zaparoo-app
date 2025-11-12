import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useShallow } from "zustand/react/shallow";
import { ZapScriptInput } from "@/components/ZapScriptInput.tsx";
import { CreateIcon } from "../lib/images";
import { Button } from "../components/wui/Button";
import { useSmartSwipe } from "../hooks/useSmartSwipe";
import { WriteModal } from "../components/WriteModal";
import { useNfcWriter, WriteAction } from "../lib/writeNfcHook";
import { PageFrame } from "../components/PageFrame";
import { usePreferencesStore, selectCustomText } from "../lib/preferencesStore";

export const Route = createFileRoute("/create/custom")({
  component: CustomText
});

function CustomText() {
  const { customText, setCustomText } = usePreferencesStore(
    useShallow(selectCustomText)
  );
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

  const navigate = useNavigate();
  const swipeHandlers = useSmartSwipe({
    onSwipeRight: () => navigate({ to: "/create" }),
    preventScrollOnSwipe: false
  });

  return (
    <>
      <PageFrame
        {...swipeHandlers}
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
      <WriteModal isOpen={writeOpen} close={closeWriteModal} />
    </>
  );
}
