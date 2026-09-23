import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useShallow } from "zustand/react/shallow";
import { ZapScriptInput } from "@/components/ZapScriptInput.tsx";
import { BackIcon, CreateIcon } from "@/lib/images";
import { HeaderButton } from "@/components/wui/HeaderButton";
import { ReaderActivityControl } from "@/components/ReaderActivityControl";
import {
  isReaderActivityOpen,
  useNfcWriter,
  WriteAction,
  WriteMethod,
} from "@/lib/writeNfcHook";
import { logger } from "@/lib/logger";
import { PageFrame } from "@/components/PageFrame";
import { usePreferencesStore, selectCustomText } from "@/lib/preferencesStore";
import { usePageHeadingFocus } from "@/hooks/usePageHeadingFocus";
import { appBackNavigationOptions } from "@/lib/tabSessionStore";

export const Route = createFileRoute("/create/custom")({
  component: CustomText,
});

export function CustomText() {
  const { t } = useTranslation();
  const headingRef = usePageHeadingFocus<HTMLHeadingElement>(
    t("create.custom.title"),
  );
  const { customText, setCustomText } = usePreferencesStore(
    useShallow(selectCustomText),
  );
  const preferRemoteWriter = usePreferencesStore(
    (state) => state.preferRemoteWriter,
  );
  const nfcWriter = useNfcWriter(WriteMethod.Auto, preferRemoteWriter);
  // Track user intent to open modal; actual visibility derived from NFC status
  const [writeIntent, setWriteIntent] = useState(false);
  const writeOpen = isReaderActivityOpen(writeIntent, nfcWriter);
  const cancelReaderActivity = async () => {
    setWriteIntent(false);
    await nfcWriter.end();
  };

  const router = useRouter();
  const goBack = () =>
    void router.navigate(appBackNavigationOptions("/create"));

  return (
    <>
      <PageFrame
        onSwipeBack={goBack}
        headerLeft={
          <HeaderButton
            onClick={goBack}
            icon={<BackIcon size="24" />}
            aria-label={t("nav.back")}
          />
        }
        headerCenter={
          <h1 ref={headingRef} className="text-foreground text-xl">
            {t("create.custom.title")}
          </h1>
        }
      >
        <div className="flex flex-col gap-4">
          <ZapScriptInput
            value={customText}
            setValue={setCustomText}
            showPalette
            rows={5}
          />

          <ReaderActivityControl
            state={
              nfcWriter.verifyError
                ? "error"
                : nfcWriter.retapRequired
                  ? "attention"
                  : writeOpen
                    ? "waiting"
                    : "idle"
            }
            idleLabel={t("create.custom.write")}
            activeLabel={
              nfcWriter.retapRequired
                ? t("spinner.retapTag")
                : t("spinner.holdTagReader")
            }
            errorMessage={
              nfcWriter.verifyError ? t("spinner.verifyFailedRetry") : undefined
            }
            icon={<CreateIcon size="20" />}
            className="w-full"
            buttonClassName="w-full"
            onStart={() => {
              setWriteIntent(true);
              void nfcWriter.write(WriteAction.Write, customText).catch((e) => {
                logger.error("NFC write failed:", e, {
                  category: "nfc",
                  action: "writeCustomText",
                  severity: "error",
                });
              });
            }}
            onCancel={() => void cancelReaderActivity()}
            onRetry={() => void nfcWriter.retry()}
            disabled={customText === ""}
          />
        </div>
      </PageFrame>
    </>
  );
}
