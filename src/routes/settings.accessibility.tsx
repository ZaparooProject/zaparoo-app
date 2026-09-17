import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { Capacitor } from "@capacitor/core";
import { ToggleSwitch } from "@/components/wui/ToggleSwitch";
import { usePreferencesStore } from "@/lib/preferencesStore";
import { PageFrame } from "@/components/PageFrame";
import { BackIcon } from "@/lib/images";
import { HeaderButton } from "@/components/wui/HeaderButton";
import { usePageHeadingFocus } from "@/hooks/usePageHeadingFocus";
import { useTextZoom } from "@/hooks/useTextZoom";
import { useHaptics } from "@/hooks/useHaptics";
import { appBackNavigationOptions } from "@/lib/tabSessionStore";
import { useTheme } from "@/components/theme-provider";
import { Segmented } from "@/components/wui/Segmented";
import { Card } from "@/components/wui/Card";

export const Route = createFileRoute("/settings/accessibility")({
  component: AccessibilitySettings,
});

const TEXT_ZOOM_PRESETS = [
  { key: "small", value: 0.85 },
  { key: "default", value: 1.0 },
  { key: "large", value: 1.15 },
  { key: "extraLarge", value: 1.3 },
] as const;

export function AccessibilitySettings() {
  const { t } = useTranslation();
  const { theme, setTheme } = useTheme();
  const headingRef = usePageHeadingFocus<HTMLHeadingElement>(
    t("settings.accessibility.title"),
  );

  const hapticsEnabled = usePreferencesStore((s) => s.hapticsEnabled);
  const setHapticsEnabled = usePreferencesStore((s) => s.setHapticsEnabled);
  const textZoomLevel = usePreferencesStore((s) => s.textZoomLevel);
  const setTextZoomLevel = usePreferencesStore((s) => s.setTextZoomLevel);
  const accessibleLists = usePreferencesStore((s) => s.accessibleLists);
  const setAccessibleLists = usePreferencesStore((s) => s.setAccessibleLists);

  const { set: applyZoomLevel, isAvailable: textZoomAvailable } = useTextZoom();
  const { impact } = useHaptics();

  // Find the closest preset to the current zoom level
  const currentPreset = TEXT_ZOOM_PRESETS.reduce((prev, curr) =>
    Math.abs(curr.value - textZoomLevel) < Math.abs(prev.value - textZoomLevel)
      ? curr
      : prev,
  );

  const handleZoomChange = (value: number) => {
    impact("light");
    setTextZoomLevel(value); // Persist to store
    applyZoomLevel(value); // Apply immediately
  };

  const router = useRouter();
  const goBack = () =>
    void router.navigate(appBackNavigationOptions("/settings"));

  return (
    <PageFrame
      onSwipeBack={goBack}
      headerLeft={
        <HeaderButton
          onClick={goBack}
          icon={<BackIcon size="24" />}
          aria-label={t("nav.back")}
        />
      }
      headerCenter={
        <h1 ref={headingRef} className="text-foreground text-xl">
          {t("settings.accessibility.title")}
        </h1>
      }
    >
      <Card className="flex flex-col gap-5">
        <Segmented
          label={t("settings.accessibility.appearance")}
          value={theme}
          options={(["system", "light", "dark"] as const).map((value) => ({
            value,
            label: t(
              `settings.accessibility.appearance${value.charAt(0).toUpperCase() + value.slice(1)}`,
            ),
          }))}
          onChange={(value) => {
            impact("light");
            setTheme(value);
          }}
        />
        {/* Text Size - native only */}
        {Capacitor.isNativePlatform() && textZoomAvailable && (
          <Segmented
            label={t("settings.accessibility.textSize")}
            value={currentPreset.key}
            options={TEXT_ZOOM_PRESETS.map((preset) => ({
              value: preset.key,
              label: t(
                `settings.accessibility.textSize${preset.key.charAt(0).toUpperCase() + preset.key.slice(1)}`,
              ),
            }))}
            onChange={(key) => {
              const preset = TEXT_ZOOM_PRESETS.find((item) => item.key === key);
              if (preset) handleZoomChange(preset.value);
            }}
          />
        )}

        <ToggleSwitch
          label={t("settings.accessibility.accessibleLists")}
          value={accessibleLists}
          setValue={setAccessibleLists}
        />

        {/* Haptic Feedback - native only */}
        {Capacitor.isNativePlatform() && (
          <ToggleSwitch
            label={t("settings.accessibility.haptics")}
            value={hapticsEnabled}
            setValue={setHapticsEnabled}
          />
        )}
      </Card>
    </PageFrame>
  );
}
