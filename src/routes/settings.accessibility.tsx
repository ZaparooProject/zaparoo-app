import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { Capacitor } from "@capacitor/core";
import classNames from "classnames";
import { ToggleSwitch } from "@/components/wui/ToggleSwitch";
import { usePreferencesStore } from "@/lib/preferencesStore";
import { PageFrame } from "@/components/PageFrame";
import { BackIcon, CheckIcon } from "@/lib/images";
import { HeaderButton } from "@/components/wui/HeaderButton";
import { usePageHeadingFocus } from "@/hooks/usePageHeadingFocus";
import { handleRadioGroupKeyDown } from "@/lib/radioGroup";
import { useTextZoom } from "@/hooks/useTextZoom";
import { useHaptics } from "@/hooks/useHaptics";
import { appBackNavigationOptions } from "@/lib/tabSessionStore";

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
      <div className="flex flex-col gap-5">
        {/* Text Size - native only */}
        {Capacitor.isNativePlatform() && textZoomAvailable && (
          <div className="py-2">
            <span id="text-size-label">
              {t("settings.accessibility.textSize")}
            </span>
            <div
              className="mt-2 flex flex-row"
              role="radiogroup"
              aria-labelledby="text-size-label"
              onKeyDown={handleRadioGroupKeyDown}
              tabIndex={-1}
            >
              {TEXT_ZOOM_PRESETS.map((preset, index) => {
                const isFirst = index === 0;
                const isLast = index === TEXT_ZOOM_PRESETS.length - 1;
                const isSelected = currentPreset.key === preset.key;

                return (
                  <button
                    key={preset.key}
                    type="button"
                    role="radio"
                    aria-checked={isSelected}
                    tabIndex={isSelected ? 0 : -1}
                    className={classNames(
                      "flex",
                      "flex-row",
                      "w-full",
                      "items-center",
                      "justify-center",
                      "py-1",
                      "font-medium",
                      "gap-1",
                      "tracking-[0.1px]",
                      "h-9",
                      "border",
                      "border-solid",
                      "border-bd-filled",
                      {
                        "rounded-s-full": isFirst,
                        "rounded-e-full": isLast,
                        "bg-button-pattern text-primary-foreground": isSelected,
                        "bg-background": !isSelected,
                      },
                    )}
                    onClick={() => handleZoomChange(preset.value)}
                  >
                    {isSelected && (
                      <span aria-hidden="true">
                        <CheckIcon size="28" />
                      </span>
                    )}
                    {t(
                      `settings.accessibility.textSize${preset.key.charAt(0).toUpperCase() + preset.key.slice(1)}`,
                    )}
                  </button>
                );
              })}
            </div>
          </div>
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
      </div>
    </PageFrame>
  );
}
