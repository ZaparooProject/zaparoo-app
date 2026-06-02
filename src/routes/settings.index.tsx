import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Browser } from "@capacitor/browser";
import { useTranslation } from "react-i18next";
import { Capacitor } from "@capacitor/core";
import { Preferences } from "@capacitor/preferences";
import { Check } from "lucide-react";
import { useProPurchase } from "@/components/ProPurchase.tsx";
import { NetworkScanModal } from "@/components/NetworkScanModal";
import { usePageHeadingFocus } from "@/hooks/usePageHeadingFocus";
import { useSelectDevice } from "@/hooks/useSelectDevice";
import type { ScanDeviceSelection } from "@/hooks/useSelectDevice";
import i18n from "@/i18n";
import { PageFrame } from "@/components/PageFrame";
import { useStatusStore } from "@/lib/store";
import { Button } from "@/components/wui/Button";
import { ExternalIcon, NextIcon } from "@/lib/images";
import { getDeviceAddress } from "@/lib/coreApi.ts";
import { MediaDatabaseCard } from "@/components/MediaDatabaseCard";
import { DeviceConnectionCard } from "@/components/DeviceConnectionCard";
import { CoreOutdatedNotice } from "@/components/CoreOutdatedNotice";
import { GatedFeature } from "@/components/GatedFeature";
import { InboxButton } from "@/components/InboxButton";
import { isCoreFeatureAvailable } from "@/lib/featureGates";

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
  const loggedInUser = useStatusStore((state) => state.loggedInUser);
  const coreVersion = useStatusStore((state) => state.coreVersion);
  const coreVersionPending = useStatusStore(
    (state) => state.coreVersionPending,
  );
  const setDeviceHistory = useStatusStore((state) => state.setDeviceHistory);
  const showMediaScraper =
    coreVersion !== null &&
    !coreVersionPending &&
    isCoreFeatureAvailable("mediaScrapers", coreVersion);

  const [address, setAddress] = useState(getDeviceAddress());
  const [scanOpen, setScanOpen] = useState(false);

  const { selectDevice, selectScanDevice } = useSelectDevice();

  useEffect(() => {
    Preferences.get({ key: "deviceHistory" }).then((v) => {
      if (v.value) {
        setDeviceHistory(JSON.parse(v.value));
      }
    });
  }, [setDeviceHistory]);

  const handleDeviceAddressChange = (newAddress: string) => {
    selectDevice(newAddress);
    setAddress(newAddress);
  };

  const handleScanDeviceSelect = (device: ScanDeviceSelection) => {
    selectScanDevice(device);
    setAddress(device.address);
  };

  return (
    <>
      <PageFrame
        headerCenter={
          <h1 ref={headingRef} className="text-foreground text-xl">
            {t("settings.title")}
          </h1>
        }
        headerRight={
          <GatedFeature featureId="inbox">
            <InboxButton />
          </GatedFeature>
        }
      >
        <div className="flex flex-col gap-5">
          <div data-tour="device-address">
            <DeviceConnectionCard
              address={address}
              setAddress={setAddress}
              onAddressChange={handleDeviceAddressChange}
              connectionError={connectionError}
              onScanClick={() => setScanOpen(true)}
            />
          </div>

          <CoreOutdatedNotice />

          {/* Network Scan Modal */}
          <NetworkScanModal
            isOpen={scanOpen}
            onClose={() => setScanOpen(false)}
            onSelectDevice={handleScanDeviceSelect}
          />

          <MediaDatabaseCard />

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

          <div>
            <Link to="/settings/online">
              <Button
                label={
                  loggedInUser !== null
                    ? t("online.settingsManageButton")
                    : t("online.settingsLogInButton")
                }
                className="w-full"
              />
            </Link>
            {loggedInUser !== null && (
              <p className="text-muted-foreground mt-1 text-center text-sm">
                {loggedInUser.email}
              </p>
            )}
          </div>

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
                  es: "es-ES",
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
              <option value="es-ES">Español</option>
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

            {showMediaScraper && (
              <Link
                to="/settings/media"
                className="flex min-h-[48px] flex-row items-center justify-between"
              >
                <span>{t("settings.media.title")}</span>
                <span aria-hidden="true">
                  <NextIcon size="20" />
                </span>
              </Link>
            )}

            <Link
              to="/settings/play-controls"
              className="flex min-h-[48px] flex-row items-center justify-between"
            >
              <p>{t("settings.playControls.title")}</p>
              <span aria-hidden="true">
                <NextIcon size="20" />
              </span>
            </Link>

            <Link
              to="/settings/readers"
              className="flex min-h-[48px] flex-row items-center justify-between"
            >
              <p>{t("settings.readers.title")}</p>
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
