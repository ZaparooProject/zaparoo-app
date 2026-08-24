import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { Browser } from "@capacitor/browser";
import { useTranslation } from "react-i18next";
import { Capacitor } from "@capacitor/core";
import { Check } from "lucide-react";
import {
  PurchaseSupportActions,
  useProPurchase,
} from "@/components/ProPurchase.tsx";
import { NetworkScanModal } from "@/components/NetworkScanModal";
import { usePageHeadingFocus } from "@/hooks/usePageHeadingFocus";
import { useSelectDevice } from "@/hooks/useSelectDevice";
import type { ScanDeviceSelection } from "@/hooks/useSelectDevice";
import { PageFrame } from "@/components/PageFrame";
import { useStatusStore } from "@/lib/store";
import { usePreferencesStore } from "@/lib/preferencesStore";
import { Button } from "@/components/wui/Button";
import { ExternalIcon, NextIcon } from "@/lib/images";
import {
  activeAddressOf,
  useDeviceRegistry,
} from "@/lib/devices/deviceRegistry";
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
import { useHapticPress } from "@/hooks/useHapticPress";

export const Route = createFileRoute("/settings/")({
  component: Settings,
});

export function Settings() {
  const { t } = useTranslation();
  const router = useRouter();
  const handleHapticPress = useHapticPress();
  const headingRef = usePageHeadingFocus<HTMLHeadingElement>(
    t("settings.title"),
  );

  const { purchaseModal, setProPurchaseModalOpen, proAccess } =
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
      : purchasePreview === "free" ||
          purchasePreview === "checkout" ||
          purchasePreview === "pro"
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
  const showMediaScraper =
    coreVersion !== null &&
    !coreVersionPending &&
    isCoreFeatureAvailable("mediaScrapers", coreVersion);
  const activeAddress = useDeviceRegistry(activeAddressOf);
  const [address, setAddress] = useState(activeAddress);
  const [trackedAddress, setTrackedAddress] = useState(activeAddress);
  const [addressError, setAddressError] = useState("");
  const [scanOpen, setScanOpen] = useState(false);

  // The field is a draft the user can edit, so it can't just mirror the store.
  // Re-seed it whenever the active device actually changes — registry hydration
  // is async, and picking a device from the scan list resolves asynchronously
  // too, so the address arrives after the first render either way.
  if (activeAddress !== trackedAddress) {
    setTrackedAddress(activeAddress);
    setAddress(activeAddress);
    setAddressError("");
  }

  const { selectDevice, selectScanDevice } = useSelectDevice();

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
    void selectScanDevice(device);
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

          <MediaDatabaseCard
            onViewScrapeDetails={() =>
              void router.navigate({ to: "/settings/media" })
            }
          />

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

          {Capacitor.isNativePlatform() && (
            <PurchaseSupportActions variant="restoreOnly" />
          )}

          <div className="flex flex-col gap-1">
            <Link
              to="/settings/online"
              onPointerUp={handleHapticPress}
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
              onPointerUp={handleHapticPress}
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
                  onPointerUp={handleHapticPress}
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
                onPointerUp={handleHapticPress}
                className="flex min-h-[48px] flex-row items-center justify-between"
              >
                <p>{t("settings.playControls.title")}</p>
                <span aria-hidden="true">
                  <NextIcon size="20" />
                </span>
              </Link>

              <Link
                to="/settings/readers"
                onPointerUp={handleHapticPress}
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
                  onPointerUp={handleHapticPress}
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
                onPointerUp={handleHapticPress}
                className="flex min-h-[48px] flex-row items-center justify-between"
              >
                <p>{t("settings.advanced.title")}</p>
                <span aria-hidden="true">
                  <NextIcon size="20" />
                </span>
              </Link>

              <Link
                to="/settings/help"
                onPointerUp={handleHapticPress}
                className="flex min-h-[48px] flex-row items-center justify-between"
              >
                <p>{t("settings.help.title")}</p>
                <span aria-hidden="true">
                  <NextIcon size="20" />
                </span>
              </Link>

              <Link
                to="/settings/about"
                onPointerUp={handleHapticPress}
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

      {purchaseModal}
    </>
  );
}
