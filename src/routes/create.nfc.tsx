import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { logger } from "../lib/logger";
// import {
//   ScanTextIcon,
//   PenToolIcon,
//   WrenchIcon,
//   ClockIcon
// } from "lucide-react";
import { useSmartSwipe } from "../hooks/useSmartSwipe";
import { WriteModal } from "../components/WriteModal";
import { useNfcWriter, WriteAction } from "../lib/writeNfcHook";
import { PageFrame } from "../components/PageFrame";
import { HeaderButton } from "../components/wui/HeaderButton";
import { BackIcon } from "../lib/images";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent
} from "../components/ui/tabs";
import { ReadTab } from "../components/nfc/ReadTab";
import { ToolsTab } from "../components/nfc/ToolsTab";

export const Route = createFileRoute("/create/nfc")({
  component: NfcUtils
});

function NfcUtils() {
  const nfcWriter = useNfcWriter();
  const [writeOpen, setWriteOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("read");

  const closeWriteModal = async () => {
    setWriteOpen(false);
    await nfcWriter.end();
  };

  const { t } = useTranslation();

  useEffect(() => {
    if (nfcWriter.status !== null) {
      logger.log(JSON.stringify(nfcWriter.result?.info.rawTag));
      setWriteOpen(false);

      // Clean up the nfcWriter state after operation completes
      nfcWriter.end();

      // Switch to read tab after operation to show results
      if (nfcWriter.result?.info?.tag || nfcWriter.result?.info?.rawTag) {
        setActiveTab("read");
      }
    }
  }, [nfcWriter]);

  const router = useRouter();
  const goBack = () => router.history.back();
  const swipeHandlers = useSmartSwipe({
    onSwipeRight: goBack,
    preventScrollOnSwipe: false
  });

  const handleScan = () => {
    nfcWriter.write(WriteAction.Read);
    setWriteOpen(true);
  };

  const handleToolAction = (action: WriteAction) => {
    nfcWriter.write(action);
    setWriteOpen(true);
  };

  return (
    <>
      <div {...swipeHandlers} className="flex h-full w-full flex-col">
        <PageFrame
          headerLeft={
            <HeaderButton onClick={goBack} icon={<BackIcon size="24" />} />
          }
          headerCenter={
            <h1 className="text-foreground text-xl">{t("create.nfc.title")}</h1>
          }
        >
          <Tabs
            value={activeTab}
            onValueChange={setActiveTab}
            className="flex h-full flex-col"
          >
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="read">Read</TabsTrigger>
              <TabsTrigger value="tools">Tools</TabsTrigger>
            </TabsList>
            <TabsContent value="read" className="flex-1 overflow-y-auto">
              <ReadTab
                result={nfcWriter.result}
                onScan={handleScan}
              />
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
