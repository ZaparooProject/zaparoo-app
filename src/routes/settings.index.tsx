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
import { PageFrame } from "@/components/PageFrame";
import { useStatusStore } from "@/lib/store";
import { usePreferencesStore } from "@/lib/preferencesStore";
import { Button } from "@/components/wui/Button";
import { ExternalIcon, NextIcon } from "@/lib/images";
import { getDeviceAddress } from "@/lib/coreApi";
import { MediaDatabaseCard } from "@/components/MediaDatabaseCard";
import { DeviceConnectionCard } from "@/components/DeviceConnectionCard";
import { CoreOutdatedNotice } from "@/components/CoreOutdatedNotice";
import { GatedFeature } from "@/components/GatedFeature";
import { InboxButton } from "@/components/InboxButton";
import { isCoreFeatureAvailable } from "@/lib/featureGates";
import {
  getPurchasePreviewState,
  usePurchasePreviewStore,
} from "@/lib/purchasePreviewStore";

export const Route = createFileRoute("/settings/")({
  component: Settings,
});

export function Settings() {
  const { t } = useTranslation();
  const headingRef = usePageHeadingFocus<HTMLHeadingElement>(
    t("settings.title"),
  );

  const { PurchaseModal, setProPurchaseModalOpen, proAccess } =
    useProPurchase();

  const connectionError = useStatusStore((state) => state.connectionError);
  const loggedInUser = useStatusStore((state) => state.loggedInUser);
  const onlinePremiumAccess = usePreferencesStore(
    (state) => state.onlinePremiumAccess,
  );
  const configuredPurchasePreview = usePurchasePreviewStore(
    (state) => state.state,
  );
  const purchasePreview = getPurchasePreviewState(configuredPurchasePreview);
  const purchasePreviewEnabled = purchasePreview !== "live";
  const displayedOnlinePremiumAccess = purchasePreviewEnabled
    ? purchasePreview === "warp"
      ? true
      : purchasePreview === "free" || purchasePreview === "pro"
        ? false
        : null
    : onlinePremiumAccess;
  const displayedProAccess = purchasePreviewEnabled
    ? purchasePreview === "pro"
    : proAccess;
  const showNativePurchaseUI =
    Capacitor.isNativePlatform() || purchasePreviewEnabled;
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
  const [addressError, setAddressError] = useState("");
  const [scanOpen, setScanOpen] = useState(false);

  const { selectDevice, selectScanDevice } = useSelectDevice();

  useEffect(() => {
    Preferences.get({ key: "deviceHistory" }).then((v) => {
      if (v.value) {
        setDeviceHistory(JSON.parse(v.value));
      }
    });
  }, [setDeviceHistory]);

  const handleAddressInputChange = (newAddress: string) => {
    setAddress(newAddress);
    if (addressError) setAddressError("");
  };

  const handleDeviceAddressChange = (newAddress: string) => {
    const result = selectDevice(newAddress);
    if (!result.ok) {
      setAddressError(t(result.errorKey));
      return;
    }

    setAddress(result.address);
    setAddressError("");
  };

  const handleScanDeviceSelect = (device: ScanDeviceSelection) => {
    const result = selectScanDevice(device);
    if (!result.ok) {
      setAddressError(t(result.errorKey));
      return;
    }

    setAddress(result.address);
    setAddressError("");
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
              setAddress={handleAddressInputChange}
              onAddressChange={handleDeviceAddressChange}
              connectionError={connectionError}
              addressError={addressError}
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

          {showNativePurchaseUI && displayedOnlinePremiumAccess === false && (
            <div className="flex flex-col gap-5">
              {displayedProAccess ? (
                <Button
                  label={t("settings.app.proActive")}
                  icon={<Check size={20} />}
                  disabled
                />
              ) : (
                <Button
                  label={t("scan.purchaseProAction")}
                  onClick={
                    purchasePreviewEnabled
                      ? () => undefined
                      : () => setProPurchaseModalOpen(true)
                  }
                />
              )}
            </div>
          )}

          <div className="flex flex-col gap-1">
            <Link
              to="/settings/online"
              className="flex min-h-[48px] flex-row items-center justify-between"
            >
              <span>{t("online.title")}</span>
              <span className="flex items-center gap-2">
                <span className="text-muted-foreground text-sm">
                  {loggedInUser === null && !purchasePreviewEnabled
                    ? t("online.settingsStatusSignedOut")
                    : displayedOnlinePremiumAccess === true
                      ? t("online.settingsStatusWarpActive")
                      : displayedOnlinePremiumAccess === false
                        ? t("online.settingsStatusFree")
                        : t("online.settingsStatusSignedIn")}
                </span>
                <span aria-hidden="true">
                  <NextIcon size="20" />
                </span>
              </span>
            </Link>

            <Link
              to="/settings/language-region"
              className="flex min-h-[48px] flex-row items-center justify-between"
            >
              <span>{t("settings.languageRegion.title")}</span>
              <span aria-hidden="true">
                <NextIcon size="20" />
              </span>
            </Link>

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
        </div>
      </PageFrame>

      <PurchaseModal />
    </>
  );
}
