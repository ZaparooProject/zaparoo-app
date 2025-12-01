import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { Capacitor } from "@capacitor/core";
import { ToggleSwitch } from "../components/wui/ToggleSwitch";
import { useSmartSwipe } from "../hooks/useSmartSwipe";
import { usePreferencesStore } from "../lib/preferencesStore";
import { PageFrame } from "../components/PageFrame";
import { BackIcon } from "../lib/images";
import { HeaderButton } from "../components/wui/HeaderButton";
import { useTextZoom } from "../hooks/useTextZoom";
import { useScreenReaderActive } from "../hooks/useScreenReaderActive";
import { Card } from "../components/wui/Card";
import { usePageHeadingFocus } from "../hooks/usePageHeadingFocus";

export const Route = createFileRoute("/settings/accessibility")({
  component: AccessibilitySettings,
});

function AccessibilitySettings() {
  const { t } = useTranslation();
  usePageHeadingFocus(t("settings.accessibility.title"));

  const hapticsEnabled = usePreferencesStore((s) => s.hapticsEnabled);
  const setHapticsEnabled = usePreferencesStore((s) => s.setHapticsEnabled);

  const { zoomLevel, isAvailable: textZoomAvailable } = useTextZoom();
  const { isActive: screenReaderActive } = useScreenReaderActive();

  const router = useRouter();
  const goBack = () => router.history.back();
  const swipeHandlers = useSmartSwipe({
    onSwipeRight: goBack,
    preventScrollOnSwipe: false,
  });

  return (
    <PageFrame
      {...swipeHandlers}
      headerLeft={
        <HeaderButton
          onClick={goBack}
          icon={<BackIcon size="24" />}
          aria-label={t("nav.back")}
        />
      }
      headerCenter={
        <h1 className="text-foreground text-xl">
          {t("settings.accessibility.title")}
        </h1>
      }
    >
      <div className="flex flex-col gap-5">
        {/* Haptic Feedback Toggle */}
        {Capacitor.isNativePlatform() && (
          <div className="space-y-1">
            <ToggleSwitch
              label={t("settings.accessibility.haptics")}
              value={hapticsEnabled}
              setValue={setHapticsEnabled}
            />
            <p className="text-foreground-muted text-sm">
              {t("settings.accessibility.hapticsDescription")}
            </p>
          </div>
        )}

        {/* Status Information Card */}
        {Capacitor.isNativePlatform() && (
          <Card className="space-y-3">
            <h2 className="font-semibold">
              {t("settings.accessibility.systemStatus")}
            </h2>

            <div className="text-foreground-secondary space-y-2 text-sm">
              {/* Screen Reader Status */}
              <div className="flex items-center justify-between">
                <span>{t("settings.accessibility.screenReader")}</span>
                <span
                  className={
                    screenReaderActive
                      ? "text-success"
                      : "text-foreground-muted"
                  }
                >
                  {screenReaderActive
                    ? t("settings.accessibility.active")
                    : t("settings.accessibility.inactive")}
                </span>
              </div>

              {/* Text Zoom Status */}
              {textZoomAvailable && (
                <div className="flex items-center justify-between">
                  <span>{t("settings.accessibility.textZoom")}</span>
                  <span>{Math.round(zoomLevel * 100)}%</span>
                </div>
              )}
            </div>

            <p className="text-foreground-muted mt-2 text-xs">
              {t("settings.accessibility.systemStatusNote")}
            </p>
          </Card>
        )}
      </div>
    </PageFrame>
  );
}
