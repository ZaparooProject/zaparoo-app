import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Browser } from "@capacitor/browser";
import { useTranslation } from "react-i18next";
import { Capacitor } from "@capacitor/core";
import { Preferences } from "@capacitor/preferences";
import { ArrowLeftRightIcon, TrashIcon } from "lucide-react";
import {
  RestorePuchasesButton,
  useProPurchase
} from "@/components/ProPurchase.tsx";
import { SlideModal } from "@/components/SlideModal.tsx";
import { Button as SCNButton } from "@/components/ui/button";
import i18n from "../i18n";
import { PageFrame } from "../components/PageFrame";
import { useStatusStore } from "../lib/store";
import { TextInput } from "../components/wui/TextInput";
import { Button } from "../components/wui/Button";
import { ExternalIcon, NextIcon } from "../lib/images";
import { getDeviceAddress, setDeviceAddress, CoreAPI } from "../lib/coreApi.ts";
import { MediaDatabaseCard } from "../components/MediaDatabaseCard";

interface LoaderData {
  launcherAccess: boolean;
}

export const Route = createFileRoute("/settings/")({
  loader: async (): Promise<LoaderData> => {
    const accessResult = await Preferences.get({ key: "launcherAccess" });

    return {
      launcherAccess: accessResult.value === "true",
    };
  },
  component: Settings
});

function Settings() {
  const initData = Route.useLoaderData();

  const { PurchaseModal, setProPurchaseModalOpen, proAccess } =
    useProPurchase(initData.launcherAccess);

  const connectionError = useStatusStore((state) => state.connectionError);
  // const loggedInUser = useStatusStore((state) => state.loggedInUser);
  const deviceHistory = useStatusStore((state) => state.deviceHistory);
  const setDeviceHistory = useStatusStore((state) => state.setDeviceHistory);
  const removeDeviceHistory = useStatusStore(
    (state) => state.removeDeviceHistory
  );
  const resetConnectionState = useStatusStore((state) => state.resetConnectionState);

  const version = useQuery({
    queryKey: ["version"],
    queryFn: () => CoreAPI.version()
  });

  const [address, setAddress] = useState(getDeviceAddress());
  const [historyOpen, setHistoryOpen] = useState(false);

  const queryClient = useQueryClient();

  const { t } = useTranslation();

  useEffect(() => {
    Preferences.get({ key: "deviceHistory" }).then((v) => {
      if (v.value) {
        setDeviceHistory(JSON.parse(v.value));
      }
    });
  }, [setDeviceHistory]);

  const handleDeviceAddressChange = (newAddress: string) => {
    // Set the new device address
    setDeviceAddress(newAddress);

    // Reset the connection state
    resetConnectionState();

    // Reset CoreAPI state
    CoreAPI.reset();

    // Clear React Query cache for all queries that depend on the device
    queryClient.invalidateQueries();

    // Update local address state (this will trigger CoreApiWebSocket remount via key prop)
    setAddress(newAddress);
  };

  return (
    <>
      <PageFrame title={t("settings.title")}>
        <div className="flex flex-col gap-5">
          <TextInput
            label={t("settings.device")}
            placeholder="192.168.1.23"
            value={address}
            setValue={setAddress}
            saveValue={handleDeviceAddressChange}
          />

          <div className="flex flex-col gap-1 min-h-[1.5rem]">
            {version.isSuccess && (
              <div className="flex flex-row items-center justify-between gap-2">
                <div>Platform: {version.data.platform}</div>
                <div>Version: {version.data.version}</div>
              </div>
            )}
            {connectionError !== "" && (
              <div className="text-error">{connectionError}</div>
            )}
          </div>

          {deviceHistory.length > 0 && (
            <>
              <Button
                icon={<ArrowLeftRightIcon size="20" />}
                label={t("settings.deviceHistory")}
                className="w-full"
                onClick={() => setHistoryOpen(true)}
              />
              <SlideModal
                isOpen={historyOpen}
                close={() => setHistoryOpen(false)}
                title={t("settings.deviceHistory")}
              >
                <div className="flex flex-col gap-3 pt-2">
                  {deviceHistory
                    .sort((a, b) => (a.address > b.address ? 1 : -1))
                    .map((entry) => (
                      <div key={entry.address} className="flex flex-row items-center justify-between gap-3">
                        <SCNButton
                          className="w-full"
                          onClick={() => {
                            handleDeviceAddressChange(entry.address);
                            setHistoryOpen(false);
                          }}
                          variant="outline"
                        >
                          {entry.address}
                        </SCNButton>
                        <SCNButton
                          variant="ghost"
                          size="icon"
                          color="danger"
                          onClick={() => removeDeviceHistory(entry.address)}
                        >
                          <TrashIcon size="20" />
                        </SCNButton>
                      </div>
                    ))}
                </div>
              </SlideModal>
            </>
          )}

          <MediaDatabaseCard />

          <div>
            <Button
              label={t("settings.designer")}
              className="w-full"
              icon={<ExternalIcon size="20" />}
              onClick={() =>
                Browser.open({ url: "https://design.zaparoo.org" })
              }
            />
          </div>

          {!Capacitor.isNativePlatform() && (
            <div>
              <Button
                label={t("settings.getApp")}
                className="w-full"
                icon={<ExternalIcon size="20" />}
                onClick={() => Browser.open({ url: "https://zaparoo.app" })}
              />
            </div>
          )}

          {Capacitor.isNativePlatform() && (
            <div className="flex flex-col gap-5">
              <Button
                label={t("scan.purchaseProAction")}
                disabled={proAccess}
                onClick={() => setProPurchaseModalOpen(true)}
              />
              <RestorePuchasesButton />
            </div>
          )}

          {/* <div>
            {loggedInUser !== null ? (
              <div className="flex flex-col gap-3">
                <Link to="/settings/online">
                  <Button
                    label={t("online.settingsManageButton")}
                    className="w-full"
                  />
                </Link>
              </div>
            ) : (
              <Link to="/settings/online">
                <Button
                  label={t("online.settingsSignInButton")}
                  className="w-full"
                />
              </Link>
            )}
          </div> */}

          <div className="flex flex-col">
            <label className="text-white">{t("settings.language")}</label>
            <select
              className="border-bd-input bg-background text-foreground rounded-md border border-solid p-3"
              value={i18n.languages[0]}
              onChange={(e) => i18n.changeLanguage(e.target.value)}
            >
              <option value="en-GB">English (UK)</option>
              <option value="en-US">English (US)</option>
              <option value="fr-FR">Français</option>
              <option value="nl-NL">Nederlands</option>
              <option value="ja-JP">日本語</option>
              <option value="ko-KR">한국어</option>
              <option value="zh-CN">中文</option>
              <option value="de-DE">Deutsch</option>
            </select>
          </div>

          <Link to="/settings/app">
            <div className="flex flex-row items-center justify-between">
              <p>{t("settings.app.title")}</p>
              <NextIcon size="20" />
            </div>
          </Link>

          <Link to="/settings/core">
            <div className="flex flex-row items-center justify-between">
              <p>{t("settings.core.title")}</p>
              <NextIcon size="20" />
            </div>
          </Link>

          <Link to="/settings/logs">
            <div className="flex flex-row items-center justify-between">
              <p>{t("settings.logs.title")}</p>
              <NextIcon size="20" />
            </div>
          </Link>

          <Link to="/settings/help">
            <div className="flex flex-row items-center justify-between">
              <p>{t("settings.help.title")}</p>
              <NextIcon size="20" />
            </div>
          </Link>

          <Link to="/settings/about">
            <div className="flex flex-row items-center justify-between">
              <p>{t("settings.about.title")}</p>
              <NextIcon size="20" />
            </div>
          </Link>
        </div>
      </PageFrame>

      <PurchaseModal />
    </>
  );
}
