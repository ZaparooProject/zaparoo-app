import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { Browser } from "@capacitor/browser";
import { useTranslation } from "react-i18next";
import {
  PersonStanding,
  Check,
  Cloud,
  Database,
  HelpCircle,
  Info,
  Languages,
  Radio,
  SlidersHorizontal,
  Wrench,
} from "lucide-react";
import {
  PurchaseSupportActions,
  useProPurchase,
} from "@/components/ProPurchase.tsx";
import { NetworkScanModal } from "@/components/NetworkScanModal";
import { usePageHeadingFocus } from "@/hooks/usePageHeadingFocus";
import { useSelectDevice } from "@/hooks/useSelectDevice";
import type { ScanDeviceSelection } from "@/hooks/useSelectDevice";
import { PageFrame } from "@/components/PageFrame";
import { useAppUi } from "@/hooks/useAppUi";
import { useStatusStore } from "@/lib/store";
import { usePreferencesStore } from "@/lib/preferencesStore";
import { Button } from "@/components/wui/Button";
import { ExternalIcon } from "@/lib/images";
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
  const appUi = useAppUi();
  const showNativePurchaseUI = appUi.enabled || purchasePreviewEnabled;
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

  const navigationGroups = [
    {
      id: "app",
      label: t("settings.groups.app"),
      destinations: [
        {
          to: "/settings/language-region",
          label: t("settings.languageRegion.title"),
          icon: Languages,
        },
        {
          to: "/settings/accessibility",
          label: t("settings.accessibility.title"),
          icon: PersonStanding,
        },
        {
          to: "/settings/online",
          label: t("online.title"),
          icon: Cloud,
          status:
            loggedInUser === null && !purchasePreviewEnabled
              ? t("online.settingsStatusSignedOut")
              : displayedOnlinePremiumAccess === true
                ? t("online.settingsStatusWarpActive")
                : displayedOnlinePremiumAccess === false
                  ? t("online.settingsStatusFree")
                  : t("online.settingsStatusSignedIn"),
        },
      ],
    },
    {
      id: "device",
      label: t("settings.groups.device"),
      destinations: [
        ...(showMediaScraper
          ? [
              {
                to: "/settings/media" as const,
                label: t("settings.media.title"),
                icon: Database,
              },
            ]
          : []),
        {
          to: "/settings/readers",
          label: t("settings.readers.title"),
          icon: Radio,
        },
        {
          to: "/settings/play-controls",
          label: t("settings.playControls.title"),
          icon: SlidersHorizontal,
        },
        {
          to: "/settings/advanced",
          label: t("settings.advanced.title"),
          icon: Wrench,
        },
      ],
    },
    {
      id: "support",
      label: t("settings.groups.support"),
      destinations: [
        {
          to: "/settings/help",
          label: t("settings.help.title"),
          icon: HelpCircle,
        },
        { to: "/settings/about", label: t("settings.about.title"), icon: Info },
      ],
    },
  ] as const;

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

          {!appUi.enabled && (
            <div>
              <Button
                label={t("settings.getApp")}
                variant="secondary"
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
                  intent="pro"
                  onClick={
                    purchasePreviewEnabled
                      ? () => undefined
                      : () => setProPurchaseModalOpen(true)
                  }
                />
              )}
            </div>
          )}

          {appUi.enabled &&
            !displayedProAccess &&
            displayedOnlinePremiumAccess !== true && (
              <PurchaseSupportActions variant="restoreOnly" />
            )}

          <div className="flex flex-col gap-5">
            {navigationGroups.map((group) => (
              <nav
                key={group.id}
                aria-labelledby={`settings-${group.id}-heading`}
                className="flex flex-col gap-2"
              >
                <h2
                  id={`settings-${group.id}-heading`}
                  className="text-lg font-semibold tracking-tight"
                >
                  {group.label}
                </h2>
                <div className="settings-navigation-grid">
                  {group.destinations.map((destination) => (
                    <Link
                      key={destination.to}
                      to={destination.to}
                      onPointerUp={handleHapticPress}
                      className={`site-button site-button-outline flex min-h-14 min-w-0 touch-manipulation items-center gap-2 px-3 py-2 text-left text-sm tracking-normal ${"status" in destination ? "col-span-full flex-wrap" : ""}`}
                    >
                      <destination.icon
                        size={20}
                        className="text-muted-foreground shrink-0"
                        aria-hidden="true"
                      />
                      <span className="min-w-0 grow">{destination.label}</span>
                      {"status" in destination && (
                        <span className="text-muted-foreground ml-auto min-w-0 text-right text-sm font-normal normal-case">
                          {destination.status}
                        </span>
                      )}
                    </Link>
                  ))}
                </div>
              </nav>
            ))}
          </div>
        </div>
      </PageFrame>

      {purchaseModal}
    </>
  );
}
