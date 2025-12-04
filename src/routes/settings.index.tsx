import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Browser } from "@capacitor/browser";
import { useTranslation } from "react-i18next";
import { Capacitor } from "@capacitor/core";
import { Preferences } from "@capacitor/preferences";
import { TrashIcon, Check } from "lucide-react";
import { useProPurchase } from "@/components/ProPurchase.tsx";
import { SlideModal } from "@/components/SlideModal.tsx";
import { Button as SCNButton } from "@/components/ui/button";
import { usePageHeadingFocus } from "@/hooks/usePageHeadingFocus";
import i18n from "@/i18n";
import { PageFrame } from "@/components/PageFrame";
import { useStatusStore } from "@/lib/store";
import { Button } from "@/components/wui/Button";
import { ExternalIcon, NextIcon } from "@/lib/images";
import { getDeviceAddress, setDeviceAddress, CoreAPI } from "@/lib/coreApi.ts";
import { MediaDatabaseCard } from "@/components/MediaDatabaseCard";
import { DeviceConnectionCard } from "@/components/DeviceConnectionCard";

export const Route = createFileRoute("/settings/")({
  component: Settings,
});

function Settings() {
  const { t } = useTranslation();
  const headingRef = usePageHeadingFocus<HTMLHeadingElement>(
    t("settings.title"),
  );

  const { PurchaseModal, setProPurchaseModalOpen, proAccess } =
    useProPurchase();

  const connectionError = useStatusStore((state) => state.connectionError);
  // const loggedInUser = useStatusStore((state) => state.loggedInUser);
  const deviceHistory = useStatusStore((state) => state.deviceHistory);
  const setDeviceHistory = useStatusStore((state) => state.setDeviceHistory);
  const removeDeviceHistory = useStatusStore(
    (state) => state.removeDeviceHistory,
  );
  const resetConnectionState = useStatusStore(
    (state) => state.resetConnectionState,
  );
  const setTargetDeviceAddress = useStatusStore(
    (state) => state.setTargetDeviceAddress,
  );

  const [address, setAddress] = useState(getDeviceAddress());
  const [historyOpen, setHistoryOpen] = useState(false);

  const queryClient = useQueryClient();

  useEffect(() => {
    Preferences.get({ key: "deviceHistory" }).then((v) => {
      if (v.value) {
        setDeviceHistory(JSON.parse(v.value));
      }
    });
  }, [setDeviceHistory]);

  const handleDeviceAddressChange = (newAddress: string) => {
    // Skip if address hasn't actually changed - prevents resetting connection
    // state when user edits and reverts to same value
    if (newAddress === getDeviceAddress()) {
      return;
    }

    setDeviceAddress(newAddress);
    resetConnectionState();
    setTargetDeviceAddress(newAddress); // Update store to trigger WebSocket reconnection
    CoreAPI.reset();
    queryClient.invalidateQueries();
    setAddress(newAddress);

    // Clear saved search filters since they may not exist on the new device
    Preferences.remove({ key: "searchSystem" });
    Preferences.remove({ key: "searchTags" });
  };

  return (
    <>
      <PageFrame
        headerCenter={
          <h1 ref={headingRef} className="text-foreground text-xl">
            {t("settings.title")}
          </h1>
        }
      >
        <div className="flex flex-col gap-5">
          <div data-tour="device-address">
            <DeviceConnectionCard
              address={address}
              setAddress={setAddress}
              onAddressChange={handleDeviceAddressChange}
              connectionError={connectionError}
              hasDeviceHistory={deviceHistory.length > 0}
              onHistoryClick={() => setHistoryOpen(true)}
            />
          </div>

          {/* Device History Modal */}
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
                      aria-label={t("settings.deleteDevice")}
                    >
                      <TrashIcon size="20" />
                    </SCNButton>
                  </div>
                ))}
            </div>
          </SlideModal>

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
              value={(() => {
                const lang = i18n.resolvedLanguage ?? "en-US";
                const baseToLocale: Record<string, string> = {
                  en: "en-US",
                  fr: "fr-FR",
                  zh: "zh-CN",
                  ko: "ko-KR",
                  nl: "nl-NL",
                  ja: "ja-JP",
                  de: "de-DE",
                };
                return baseToLocale[lang] ?? lang;
              })()}
              onChange={(e) => i18n.changeLanguage(e.target.value)}
            >
              <option value="de-DE">Deutsch</option>
              <option value="en-GB">English (UK)</option>
              <option value="en-US">English (US)</option>
              <option value="fr-FR">Français</option>
              <option value="nl-NL">Nederlands</option>
              <option value="zh-CN">中文</option>
              <option value="ja-JP">日本語</option>
              <option value="ko-KR">한국어</option>
            </select>
          </div>

          <nav
            aria-labelledby="more-settings-heading"
            className="flex flex-col gap-1"
          >
            <h2 id="more-settings-heading" className="sr-only">
              {t("settings.moreSettings")}
            </h2>

            <Link
              to="/settings/readers"
              className="flex min-h-[48px] flex-row items-center justify-between"
            >
              <p>{t("settings.readers.title")}</p>
              <span aria-hidden="true">
                <NextIcon size="20" />
              </span>
            </Link>

            <Link
              to="/settings/playtime"
              className="flex min-h-[48px] flex-row items-center justify-between"
            >
              <p>{t("settings.playtime.title")}</p>
              <span aria-hidden="true">
                <NextIcon size="20" />
              </span>
            </Link>

            {Capacitor.isNativePlatform() && (
              <Link
                to="/settings/accessibility"
                className="flex min-h-[48px] flex-row items-center justify-between"
              >
                <p>{t("settings.accessibility.title")}</p>
                <span aria-hidden="true">
                  <NextIcon size="20" />
                </span>
              </Link>
            )}

            <Link
              to="/settings/advanced"
              className="flex min-h-[48px] flex-row items-center justify-between"
            >
              <p>{t("settings.advanced.title")}</p>
              <span aria-hidden="true">
                <NextIcon size="20" />
              </span>
            </Link>

            <Link
              to="/settings/help"
              className="flex min-h-[48px] flex-row items-center justify-between"
            >
              <p>{t("settings.help.title")}</p>
              <span aria-hidden="true">
                <NextIcon size="20" />
              </span>
            </Link>

            <Link
              to="/settings/about"
              className="flex min-h-[48px] flex-row items-center justify-between"
            >
              <p>{t("settings.about.title")}</p>
              <span aria-hidden="true">
                <NextIcon size="20" />
              </span>
            </Link>
          </nav>
        </div>
      </PageFrame>

      <PurchaseModal />
    </>
  );
}
