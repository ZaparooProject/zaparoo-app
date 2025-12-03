import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useShallow } from "zustand/react/shallow";
import { ZapScriptInput } from "@/components/ZapScriptInput.tsx";
import { BackIcon, CreateIcon } from "@/lib/images";
import { HeaderButton } from "@/components/wui/HeaderButton";
import { Button } from "@/components/wui/Button";
import { useSmartSwipe } from "@/hooks/useSmartSwipe";
import { WriteModal } from "@/components/WriteModal";
import { useNfcWriter, WriteAction } from "@/lib/writeNfcHook";
import { PageFrame } from "@/components/PageFrame";
import { usePreferencesStore, selectCustomText } from "@/lib/preferencesStore";
import { usePageHeadingFocus } from "@/hooks/usePageHeadingFocus";

export const Route = createFileRoute("/create/custom")({
  component: CustomText,
});

function CustomText() {
  const { t } = useTranslation();
  usePageHeadingFocus(t("create.custom.title"));
  const { customText, setCustomText } = usePreferencesStore(
    useShallow(selectCustomText),
  );
  const nfcWriter = useNfcWriter();
  // Track user intent to open modal; actual visibility derived from NFC status
  const [writeIntent, setWriteIntent] = useState(false);
  const writeOpen = writeIntent && nfcWriter.status === null;
  const closeWriteModal = async () => {
    setWriteIntent(false);
    await nfcWriter.end();
  };

  const router = useRouter();
  const goBack = () => router.history.back();
  const swipeHandlers = useSmartSwipe({
    onSwipeRight: goBack,
    preventScrollOnSwipe: false,
  });

  return (
    <>
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
          <h1 className="text-foreground text-xl">
            {t("create.custom.title")}
          </h1>
        }
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
                setWriteIntent(true);
              }
            }}
          />
        </div>
      </PageFrame>
      <WriteModal isOpen={writeOpen} close={closeWriteModal} />
    </>
  );
}
