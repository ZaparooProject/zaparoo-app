import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useHaptics } from "@/hooks/useHaptics";
import { ReaderActivityControl } from "@/components/ReaderActivityControl";
import { useContextualNfcWrite } from "@/hooks/useContextualNfcWrite";
import { WriteAction } from "@/lib/writeNfcHook";
import { PageFrame } from "@/components/PageFrame";
import { HeaderButton } from "@/components/wui/HeaderButton";
import { BackIcon, NfcIcon } from "@/lib/images";
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
  const activity = useContextualNfcWrite("create-nfc", true);
  const { impact } = useHaptics();
  const [activeTab, setActiveTab] = useState("read");
  // The operation the reader was last asked for: Read, or one of the tools.
  const [lastAction, setLastAction] = useState<WriteAction | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Only a read describes what is on the tag now. A tool reports the tag as
  // it was discovered, before it was erased, formatted or locked.
  const readResult = lastAction === WriteAction.Read ? activity.result : null;
  const hasReadResult = Boolean(
    readResult?.info.tag || readResult?.info.rawTag,
  );
  const resultReadyMessage = t("create.nfc.resultReady");
  useEffect(() => {
    if (hasReadResult) announce(resultReadyMessage);
  }, [announce, hasReadResult, resultReadyMessage]);

  const router = useRouter();
  const goBack = () =>
    void router.navigate(appBackNavigationOptions("/create"));

  const start = (action: WriteAction) => {
    setLastAction(action);
    void activity.start("", action);
  };

  const readTabId = getTabBarTabId("read", "nfc-tab");
  const toolsTabId = getTabBarTabId("tools", "nfc-tab");

  return (
    <>
      <PageFrame
        layout="workspace"
        className="nfc-workspace-page"
        headerMode="content-wide"
        breadcrumbs={[{ to: "/create", label: t("create.title") }]}
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
        <div className="nfc-workspace">
          <TabBar
            label={t("create.nfc.title")}
            role="tab"
            options={[
              {
                value: "read",
                label: t("create.nfc.tabs.read"),
                id: readTabId,
              },
              {
                value: "tools",
                label: t("create.nfc.tabs.tools"),
                id: toolsTabId,
              },
            ]}
            value={activeTab}
            // A tag wait belongs to the control that started it, so the
            // tabs stay put until it completes or is cancelled.
            disabled={activity.active}
            onChange={(value) => {
              impact("light");
              setActiveTab(value);
            }}
          />
          <div
            id={getTabBarPanelId(readTabId)}
            role="tabpanel"
            aria-labelledby={readTabId}
            hidden={activeTab !== "read"}
          >
            <ReadTab
              result={readResult}
              scanControl={
                <ReaderActivityControl
                  state={
                    lastAction === WriteAction.Read ? activity.state : "idle"
                  }
                  idleLabel={t("create.nfc.readTab.scanTag")}
                  activeLabel={activity.activeLabel}
                  icon={<NfcIcon size={20} />}
                  buttonClassName="w-full"
                  disabled={
                    activity.externalWriteActive ||
                    (activity.active && lastAction !== WriteAction.Read)
                  }
                  onStart={() => start(WriteAction.Read)}
                  onCancel={activity.onCancel}
                />
              }
            />
          </div>
          <div
            id={getTabBarPanelId(toolsTabId)}
            role="tabpanel"
            aria-labelledby={toolsTabId}
            hidden={activeTab !== "tools"}
          >
            <ToolsTab
              renderToolControl={({ action, label, icon }) => (
                <ReaderActivityControl
                  state={lastAction === action ? activity.state : "idle"}
                  idleLabel={label}
                  activeLabel={activity.activeLabel}
                  icon={icon}
                  variant="outline"
                  intent="destructive"
                  disabled={
                    activity.externalWriteActive ||
                    (activity.active && lastAction !== action)
                  }
                  onStart={() => start(action)}
                  onCancel={activity.onCancel}
                />
              )}
            />
          </div>
        </div>
        <BackToTop scrollContainerRef={scrollContainerRef} threshold={200} />
      </PageFrame>
    </>
  );
}
