import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Browser } from "@capacitor/browser";
import { useTranslation } from "react-i18next";
import { Capacitor } from "@capacitor/core";
import { Preferences } from "@capacitor/preferences";
import { ArrowLeftRightIcon, TrashIcon, Check } from "lucide-react";
import { useProPurchase } from "@/components/ProPurchase.tsx";
import { SlideModal } from "@/components/SlideModal.tsx";
import { Button as SCNButton } from "@/components/ui/button";
import i18n from "../i18n";
import { PageFrame } from "../components/PageFrame";
import { useStatusStore } from "../lib/store";
import { usePreferencesStore } from "../lib/preferencesStore";
import { TextInput } from "../components/wui/TextInput";
import { Button } from "../components/wui/Button";
import { ExternalIcon, NextIcon } from "../lib/images";
import { getDeviceAddress, setDeviceAddress, CoreAPI } from "../lib/coreApi.ts";
import { MediaDatabaseCard } from "../components/MediaDatabaseCard";

interface LoaderData {
  launcherAccess: boolean;
}

export const Route = createFileRoute("/settings/")({
  loader: (): LoaderData => {
    const state = usePreferencesStore.getState();
    return {
      launcherAccess: state.launcherAccess
    };
  },
  component: Settings
});

function Settings() {
  const initData = Route.useLoaderData();

  const { PurchaseModal, setProPurchaseModalOpen, proAccess } = useProPurchase(
    initData.launcherAccess
  );

  const connectionError = useStatusStore((state) => state.connectionError);
  // const loggedInUser = useStatusStore((state) => state.loggedInUser);
  const deviceHistory = useStatusStore((state) => state.deviceHistory);
  const setDeviceHistory = useStatusStore((state) => state.setDeviceHistory);
  const removeDeviceHistory = useStatusStore(
    (state) => state.removeDeviceHistory
  );
  const resetConnectionState = useStatusStore(
    (state) => state.resetConnectionState
  );

  const { data: version, isSuccess: versionSuccess } = useQuery({
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
    setDeviceAddress(newAddress);
    resetConnectionState();
    CoreAPI.reset();
    queryClient.invalidateQueries();
    setAddress(newAddress);
  };

  return (
    <>
      <PageFrame
        headerCenter={
          <h1 className="text-foreground text-xl">{t("settings.title")}</h1>
        }
      >
        <div className="flex flex-col gap-5">
          <div data-tour="device-address">
            <TextInput
              label={t("settings.device")}
              placeholder="192.168.1.23"
              value={address}
              setValue={setAddress}
              saveValue={handleDeviceAddressChange}
              onKeyUp={(e) => {
                if (e.key === "Enter" && address !== getDeviceAddress()) {
                  handleDeviceAddressChange(address);
                }
              }}
            />
          </div>

          <div className="flex min-h-[1.5rem] flex-col gap-1">
            {versionSuccess && version && (
              <div className="flex flex-row items-center justify-between gap-2">
                <div>Platform: {version.platform}</div>
                <div>Version: {version.version}</div>
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
                      <div
                        key={entry.address}
                        className="flex flex-row items-center justify-between gap-3"
                      >
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
              {proAccess ? (
                <Button
                  label={t("settings.app.proActive")}
                  icon={<Check size={20} />}
                  disabled
                />
              ) : (
                <Button
                  label={t("scan.purchaseProAction")}
                  onClick={() => setProPurchaseModalOpen(true)}
                />
              )}
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

          <Link to="/settings/readers">
            <div className="flex flex-row items-center justify-between">
              <p>{t("settings.readers.title")}</p>
              <NextIcon size="20" />
            </div>
          </Link>

          <Link to="/settings/playtime">
            <div className="flex flex-row items-center justify-between">
              <p>{t("settings.playtime.title")}</p>
              <NextIcon size="20" />
            </div>
          </Link>

          <Link to="/settings/advanced">
            <div className="flex flex-row items-center justify-between">
              <p>{t("settings.advanced.title")}</p>
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
