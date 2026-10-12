import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { Browser } from "@capacitor/browser";
import { useTranslation } from "react-i18next";
import {
  PersonStandingIcon,
  CheckIcon,
  CloudIcon,
  DatabaseIcon,
  HelpCircleIcon,
  InfoIcon,
  LanguagesIcon,
  RadioIcon,
  SlidersHorizontalIcon,
  WrenchIcon,
} from "lucide-react";
import {
  PurchaseSupportActions,
  useProPurchase,
} from "@/components/ProPurchase.tsx";
import { usePageHeadingFocus } from "@/hooks/usePageHeadingFocus";
import { PageFrame } from "@/components/PageFrame";
import { useAppUi } from "@/hooks/useAppUi";
import { useStatusStore } from "@/lib/store";
import { usePreferencesStore } from "@/lib/preferencesStore";
import { Button } from "@/components/wui/Button";
import { ExternalIcon } from "@/lib/images";
import { MediaDatabaseCard } from "@/components/MediaDatabaseCard";
import { DeviceConnectionSummary } from "@/components/DeviceConnectionSummary";
import { CoreOutdatedNotice } from "@/components/CoreOutdatedNotice";
import { GatedFeature } from "@/components/GatedFeature";
import { InboxButton } from "@/components/InboxButton";
import { useKnownCoreFeature } from "@/hooks/useKnownCoreFeature";
import {
  getDisplayedWarpAccess,
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

  const loggedInUser = useStatusStore((state) => state.loggedInUser);
  const onlinePremiumAccess = usePreferencesStore(
    (state) => state.onlinePremiumAccess,
  );
  const configuredPurchasePreview = usePurchasePreviewStore(
    (state) => state.state,
  );
  const purchasePreview = getPurchasePreviewState(configuredPurchasePreview);
  const purchasePreviewEnabled = purchasePreview !== "live";
  const displayedOnlinePremiumAccess = getDisplayedWarpAccess(
    purchasePreview,
    onlinePremiumAccess,
  );
  const displayedProAccess = purchasePreviewEnabled
    ? purchasePreview === "pro"
    : proAccess;
  const appUi = useAppUi();
  const showNativePurchaseUI = appUi.enabled || purchasePreviewEnabled;
  const { available: showMediaScraper } = useKnownCoreFeature("mediaScrapers");
  const navigationGroups = [
    {
      id: "app",
      label: t("settings.groups.app"),
      destinations: [
        {
          to: "/settings/language-region",
          label: t("settings.languageRegion.title"),
          icon: LanguagesIcon,
        },
        {
          to: "/settings/accessibility",
          label: t("settings.accessibility.title"),
          icon: PersonStandingIcon,
        },
        {
          to: "/settings/online",
          label: t("online.title"),
          icon: CloudIcon,
          status:
            loggedInUser === null && !purchasePreviewEnabled
              ? t("online.settingsStatusSignedOut")
              : displayedOnlinePremiumAccess === true
                ? t("online.settingsStatusWarpActive")
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
                icon: DatabaseIcon,
              },
            ]
          : []),
        {
          to: "/settings/readers",
          label: t("settings.readers.title"),
          icon: RadioIcon,
        },
        {
          to: "/settings/play-controls",
          label: t("settings.playControls.title"),
          icon: SlidersHorizontalIcon,
        },
        {
          to: "/settings/advanced",
          label: t("settings.advanced.title"),
          icon: WrenchIcon,
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
          icon: HelpCircleIcon,
        },
        {
          to: "/settings/about",
          label: t("settings.about.title"),
          icon: InfoIcon,
        },
      ],
    },
  ] as const;

  return (
    <>
      <PageFrame
        layout="workspace"
        headerMode="content-wide"
        className="settings-overview-page wrap-anywhere"
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
        <div className="settings-overview">
          <div className="settings-overview-context">
            <div data-tour="device-address">
              <DeviceConnectionSummary />
            </div>

            <CoreOutdatedNotice />

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

            {showNativePurchaseUI &&
              displayedOnlinePremiumAccess === false &&
              (displayedProAccess ? (
                <p
                  role="status"
                  className="text-success flex min-h-12 items-center gap-2 text-sm font-medium"
                >
                  <CheckIcon size={20} aria-hidden="true" />
                  {t("settings.app.proActive")}
                </p>
              ) : (
                <Button
                  label={t("scan.purchaseProAction")}
                  intent="pro"
                  className="w-full"
                  onClick={
                    purchasePreviewEnabled
                      ? () => undefined
                      : () => setProPurchaseModalOpen(true)
                  }
                />
              ))}

            {appUi.enabled &&
              !displayedProAccess &&
              displayedOnlinePremiumAccess !== true && (
                <PurchaseSupportActions variant="restoreOnly" />
              )}
          </div>
          <div className="settings-overview-destinations">
            {navigationGroups.map((group) => (
              <nav
                key={group.id}
                aria-labelledby={`settings-${group.id}-heading`}
                className="flex flex-col gap-2"
              >
                <h2
                  id={`settings-${group.id}-heading`}
                  className="text-foreground text-lg font-semibold"
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
