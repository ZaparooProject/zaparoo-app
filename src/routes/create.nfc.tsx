import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
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
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../components/ui/tabs";
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
      console.log(JSON.stringify(nfcWriter.result?.info.rawTag));
      setWriteOpen(false);

      // Switch to read tab after operation to show results
      if (nfcWriter.result?.info?.tag || nfcWriter.result?.info?.rawTag) {
        setActiveTab("read");
      }
    }
  }, [nfcWriter]);

  const navigate = useNavigate();
  const swipeHandlers = useSmartSwipe({
    onSwipeRight: () => navigate({ to: "/create" }),
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
      <div {...swipeHandlers} className="h-full w-full flex flex-col">
        <PageFrame
          title={t("create.nfc.title")}
          back={() => navigate({ to: "/create" })}
        >
          <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col h-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="read">Read</TabsTrigger>
              <TabsTrigger value="tools">Tools</TabsTrigger>
            </TabsList>
            <TabsContent value="read" className="flex-1 overflow-y-auto">
              <ReadTab
                result={nfcWriter.result}
                onScan={handleScan}
                isScanning={nfcWriter.writing}
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
