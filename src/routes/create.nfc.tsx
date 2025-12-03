import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { logger } from "@/lib/logger";
// import {
//   ScanTextIcon,
//   PenToolIcon,
//   WrenchIcon,
//   ClockIcon
// } from "lucide-react";
import { useSmartSwipe } from "@/hooks/useSmartSwipe";
import { useHaptics } from "@/hooks/useHaptics";
import { WriteModal } from "@/components/WriteModal";
import { useNfcWriter, WriteAction } from "@/lib/writeNfcHook";
import { PageFrame } from "@/components/PageFrame";
import { HeaderButton } from "@/components/wui/HeaderButton";
import { BackIcon } from "@/lib/images";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ReadTab } from "@/components/nfc/ReadTab";
import { ToolsTab } from "@/components/nfc/ToolsTab";
import { usePageHeadingFocus } from "@/hooks/usePageHeadingFocus";

export const Route = createFileRoute("/create/nfc")({
  component: NfcUtils,
});

function NfcUtils() {
  const { t } = useTranslation();
  usePageHeadingFocus(t("create.nfc.title"));
  const nfcWriter = useNfcWriter();
  const { impact } = useHaptics();
  // Track user intent to open modal; actual visibility derived from NFC status
  const [writeIntent, setWriteIntent] = useState(false);
  const writeOpen = writeIntent && nfcWriter.status === null;
  const [activeTab, setActiveTab] = useState("read");
  // Track previous status to detect completion
  const prevStatusRef = useRef(nfcWriter.status);

  const closeWriteModal = async () => {
    setWriteIntent(false);
    await nfcWriter.end();
  };

  // Handle NFC operation completion - cleanup and tab switching
  useEffect(() => {
    const justCompleted =
      prevStatusRef.current === null && nfcWriter.status !== null;
    prevStatusRef.current = nfcWriter.status;

    if (justCompleted) {
      logger.log(JSON.stringify(nfcWriter.result?.info.rawTag));

      // Clean up the nfcWriter state after operation completes
      nfcWriter.end();

      // Switch to read tab after operation to show results
      if (nfcWriter.result?.info?.tag || nfcWriter.result?.info?.rawTag) {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- Intentional: navigating to results tab after async NFC operation
        setActiveTab("read");
      }
    }
  }, [nfcWriter]);

  const router = useRouter();
  const goBack = () => router.history.back();
  const swipeHandlers = useSmartSwipe({
    onSwipeRight: goBack,
    preventScrollOnSwipe: false,
  });

  const handleScan = () => {
    nfcWriter.write(WriteAction.Read);
    setWriteIntent(true);
  };

  const handleToolAction = (action: WriteAction) => {
    nfcWriter.write(action);
    setWriteIntent(true);
  };

  return (
    <>
      <div {...swipeHandlers} className="flex h-full w-full flex-col">
        <PageFrame
          headerLeft={
            <HeaderButton
              onClick={goBack}
              icon={<BackIcon size="24" />}
              aria-label={t("nav.back")}
            />
          }
          headerCenter={
            <h1 className="text-foreground text-xl">{t("create.nfc.title")}</h1>
          }
        >
          <Tabs
            value={activeTab}
            onValueChange={(value) => {
              impact("light");
              setActiveTab(value);
            }}
            className="flex h-full flex-col"
          >
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="read">Read</TabsTrigger>
              <TabsTrigger value="tools">Tools</TabsTrigger>
            </TabsList>
            <TabsContent value="read" className="flex-1 overflow-y-auto">
              <ReadTab result={nfcWriter.result} onScan={handleScan} />
            </TabsContent>
            <TabsContent value="tools" className="flex-1 overflow-y-auto">
              <ToolsTab
                onToolAction={handleToolAction}
                isProcessing={nfcWriter.writing}
              />
            </TabsContent>
          </Tabs>
        </PageFrame>
      </div>
      <WriteModal isOpen={writeOpen} close={closeWriteModal} />
    </>
  );
}
