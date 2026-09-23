import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { NfcIcon } from "lucide-react";
import { logger } from "@/lib/logger";
// import {
//   ScanTextIcon,
//   PenToolIcon,
//   WrenchIcon,
//   ClockIcon
// } from "lucide-react";
import { useHaptics } from "@/hooks/useHaptics";
import { ReaderActivityControl } from "@/components/ReaderActivityControl";
import {
  isReaderActivityOpen,
  useNfcWriter,
  WriteAction,
  WriteMethod,
} from "@/lib/writeNfcHook";
import { usePreferencesStore } from "@/lib/preferencesStore";
import { PageFrame } from "@/components/PageFrame";
import { HeaderButton } from "@/components/wui/HeaderButton";
import { BackIcon } from "@/lib/images";
import { TabBar } from "@/components/wui/TabBar";
import { getTabBarPanelId, getTabBarTabId } from "@/components/wui/tabBarIds";
import { ReadTab } from "@/components/nfc/ReadTab";
import { ToolsTab } from "@/components/nfc/ToolsTab";
import { BackToTop } from "@/components/BackToTop";
import { usePageHeadingFocus } from "@/hooks/usePageHeadingFocus";
import { useAnnouncer } from "@/components/A11yAnnouncer";
import { appBackNavigationOptions } from "@/lib/tabSessionStore";

export const Route = createFileRoute("/create/nfc")({
  component: NfcUtils,
});

export function NfcUtils() {
  const { t } = useTranslation();
  const { announce } = useAnnouncer();
  const headingRef = usePageHeadingFocus<HTMLHeadingElement>(
    t("create.nfc.title"),
  );
  const preferRemoteWriter = usePreferencesStore(
    (state) => state.preferRemoteWriter,
  );
  const nfcWriter = useNfcWriter(WriteMethod.Auto, preferRemoteWriter);
  const { impact } = useHaptics();
  // Track user intent to open modal; actual visibility derived from NFC status
  const [writeIntent, setWriteIntent] = useState(false);
  const writeOpen = isReaderActivityOpen(writeIntent, nfcWriter);
  const [activeTab, setActiveTab] = useState("read");
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  // Track previous status to detect completion
  const prevStatusRef = useRef(nfcWriter.status);

  const cancelReaderActivity = async () => {
    setWriteIntent(false);
    await nfcWriter.end();
  };

  // Handle NFC operation completion - switch to read tab to show results
  useEffect(() => {
    const justCompleted =
      prevStatusRef.current === null && nfcWriter.status !== null;
    prevStatusRef.current = nfcWriter.status;

    if (justCompleted) {
      logger.log(JSON.stringify(nfcWriter.result?.info.rawTag));

      // Switch to read tab after operation to show results.
      if (nfcWriter.result?.info?.tag || nfcWriter.result?.info?.rawTag) {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- Intentional: navigating to results tab after async NFC operation
        setActiveTab("read");
        announce(t("create.nfc.resultReady"));
        requestAnimationFrame(() => {
          document
            .getElementById(getTabBarTabId("read", "nfc-tab"))
            ?.focus({ preventScroll: true });
        });
      }
    }
  }, [announce, nfcWriter, t]);

  const router = useRouter();
  const goBack = () =>
    void router.navigate(appBackNavigationOptions("/create"));

  const handleScan = () => {
    nfcWriter.write(WriteAction.Read).catch((e) => {
      logger.error("NFC read failed:", e, {
        category: "nfc",
        action: "nfcUtilsRead",
        severity: "error",
      });
    });
    setWriteIntent(true);
  };

  const handleToolAction = (action: WriteAction) => {
    nfcWriter.write(action).catch((e) => {
      logger.error("NFC tool action failed:", e, {
        category: "nfc",
        action: "nfcUtilsTool",
        severity: "error",
      });
    });
    setWriteIntent(true);
  };

  const readerState = nfcWriter.verifyError
    ? "error"
    : nfcWriter.retapRequired
      ? "attention"
      : writeOpen
        ? "waiting"
        : "idle";
  const readerControl = (onStart: () => void, idleLabel: string) => (
    <ReaderActivityControl
      state={readerState}
      idleLabel={idleLabel}
      activeLabel={
        nfcWriter.retapRequired
          ? t("spinner.retapTag")
          : t("spinner.holdTagReader")
      }
      errorMessage={
        nfcWriter.verifyError ? t("spinner.verifyFailedRetry") : undefined
      }
      icon={<NfcIcon size={18} />}
      buttonClassName="w-full"
      onStart={onStart}
      onCancel={() => void cancelReaderActivity()}
      onRetry={() => void nfcWriter.retry()}
    />
  );

  const activeTabId = getTabBarTabId(activeTab, "nfc-tab");
  const activePanelId = getTabBarPanelId(activeTabId);

  return (
    <>
      <PageFrame
        onSwipeBack={goBack}
        scrollRef={scrollContainerRef}
        headerLeft={
          <HeaderButton
            onClick={goBack}
            icon={<BackIcon size="24" />}
            aria-label={t("nav.back")}
          />
        }
        headerCenter={
          <h1 ref={headingRef} className="text-foreground text-xl">
            {t("create.nfc.title")}
          </h1>
        }
      >
        <div className="flex flex-col">
          <TabBar
            label={t("create.nfc.title")}
            role="tab"
            options={[
              {
                value: "read",
                label: t("create.nfc.tabs.read"),
                id: getTabBarTabId("read", "nfc-tab"),
              },
              {
                value: "tools",
                label: t("create.nfc.tabs.tools"),
                id: getTabBarTabId("tools", "nfc-tab"),
              },
            ]}
            value={activeTab}
            onChange={(value) => {
              impact("light");
              setActiveTab(value);
            }}
          />
          <div id={activePanelId} role="tabpanel" aria-labelledby={activeTabId}>
            {activeTab === "read" ? (
              <ReadTab
                result={nfcWriter.result}
                onScan={handleScan}
                scanControl={readerControl(
                  handleScan,
                  t("create.nfc.readTab.scanTag"),
                )}
              />
            ) : writeOpen ? (
              <div className="px-2 pt-6">
                {readerControl(
                  () => undefined,
                  t("create.nfc.toolsTab.formatTag"),
                )}
              </div>
            ) : (
              <ToolsTab
                onToolAction={handleToolAction}
                isProcessing={nfcWriter.writing}
              />
            )}
          </div>
        </div>
        <BackToTop
          scrollContainerRef={scrollContainerRef}
          threshold={200}
          bottomOffset="calc(var(--bottom-nav-base-height) + 1rem)"
        />
      </PageFrame>
    </>
  );
}
