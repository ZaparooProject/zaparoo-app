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
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { Card } from "@/components/wui/Card";
import { LibraryLinkButton } from "@/components/library/LibraryLinkButton";
import { getReleaseDisplayVersion } from "@/lib/whatsNew";

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
  // The sidebar already lists every settings page from this width, so the
  // landing page shows status panels instead of repeating those links.
  const sidebar = useMediaQuery("(min-width: 1280px)");
  const onlineStatus =
    loggedInUser === null && !purchasePreviewEnabled
      ? t("online.settingsStatusSignedOut")
      : displayedOnlinePremiumAccess === true
        ? t("online.settingsStatusWarpActive")
        : t("online.settingsStatusSignedIn");
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
          status: onlineStatus,
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

  const appActions = (
    <>
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
    </>
  );
  const mediaDatabase = (
    <MediaDatabaseCard
      onViewScrapeDetails={() =>
        void router.navigate({ to: "/settings/media" })
      }
    />
  );
  const panelHeading = "text-foreground text-lg font-semibold";

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
        {/* One tree at every width, so the cards keep their state on resize. */}
        <div
          className={sidebar ? "settings-overview-panels" : "settings-overview"}
        >
          <div className="settings-overview-context">
            <div className="settings-overview-panel">
              {sidebar && (
                <h2 className={panelHeading}>{t("settings.groups.device")}</h2>
              )}
              <div data-tour="device-address">
                <DeviceConnectionSummary />
              </div>
              <CoreOutdatedNotice />
            </div>
            <div className="settings-overview-panel">
              {sidebar && (
                <h2 className={panelHeading}>
                  {t("settings.media.databaseTitle")}
                </h2>
              )}
              {mediaDatabase}
            </div>
            {sidebar ? (
              <>
                <section
                  aria-labelledby="settings-online-panel-heading"
                  className="settings-overview-panel"
                >
                  <h2
                    id="settings-online-panel-heading"
                    className={panelHeading}
                  >
                    {t("online.title")}
                  </h2>
                  <Card className="flex flex-col gap-3">
                    <p className="text-sm font-medium">{onlineStatus}</p>
                    <LibraryLinkButton
                      to="/settings/online"
                      label={t(
                        loggedInUser === null
                          ? "online.login"
                          : "online.account",
                      )}
                      icon={<CloudIcon size={20} />}
                      className="w-full"
                    />
                  </Card>
                </section>
                <section
                  aria-labelledby="settings-app-panel-heading"
                  className="settings-overview-panel"
                >
                  <h2 id="settings-app-panel-heading" className={panelHeading}>
                    {t("settings.groups.app")}
                  </h2>
                  <Card className="flex flex-col gap-3">
                    <p className="text-sm font-medium">
                      {t("settings.about.version", {
                        version: getReleaseDisplayVersion(
                          import.meta.env.VITE_RELEASE_KEY,
                          import.meta.env.VITE_VERSION,
                        ),
                      })}
                    </p>
                    {appActions}
                  </Card>
                </section>
              </>
            ) : (
              appActions
            )}
          </div>
          {!sidebar && (
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
                        <span className="min-w-0 grow">
                          {destination.label}
                        </span>
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
          )}
        </div>
      </PageFrame>

      {purchaseModal}
    </>
  );
}
