import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { HeaderButton } from "@/components/wui/HeaderButton";
import { PageFrame } from "@/components/PageFrame";
import { usePageHeadingFocus } from "@/hooks/usePageHeadingFocus";
import i18n from "@/i18n";
import { BackIcon } from "@/lib/images";
import { usePreferencesStore } from "@/lib/preferencesStore";
import type { SystemNameRegionPreference } from "@/lib/systemNames";
import { appBackNavigationOptions } from "@/lib/tabSessionStore";

export const Route = createFileRoute("/settings/language-region")({
  component: LanguageRegionSettings,
});

const LANGUAGE_OPTIONS = [
  { value: "de-DE", label: "Deutsch" },
  { value: "en-GB", label: "English (UK)" },
  { value: "en-US", label: "English (US)" },
  { value: "fr-FR", label: "Français" },
  { value: "nl-NL", label: "Nederlands" },
  { value: "es-ES", label: "Español" },
  { value: "zh-CN", label: "中文" },
  { value: "ja-JP", label: "日本語" },
  { value: "ko-KR", label: "한국어" },
] as const;

const SYSTEM_NAME_REGION_OPTIONS: Array<{
  value: SystemNameRegionPreference;
  labelKey: string;
}> = [
  { value: "auto", labelKey: "settings.systemNames.auto" },
  { value: "us", labelKey: "settings.systemNames.us" },
  { value: "eu", labelKey: "settings.systemNames.eu" },
  { value: "jp", labelKey: "settings.systemNames.jp" },
];

const BASE_LANGUAGE_TO_LOCALE: Record<string, string> = {
  en: "en-US",
  fr: "fr-FR",
  zh: "zh-CN",
  ko: "ko-KR",
  nl: "nl-NL",
  ja: "ja-JP",
  de: "de-DE",
  es: "es-ES",
};

export function LanguageRegionSettings() {
  const { t } = useTranslation();
  const headingRef = usePageHeadingFocus<HTMLHeadingElement>(
    t("settings.languageRegion.title"),
  );

  const systemNameRegion = usePreferencesStore(
    (state) => state.systemNameRegion,
  );
  const setSystemNameRegion = usePreferencesStore(
    (state) => state.setSystemNameRegion,
  );
  const resolvedLanguage = i18n.resolvedLanguage ?? "en-US";
  const selectedLanguage =
    BASE_LANGUAGE_TO_LOCALE[resolvedLanguage] ?? resolvedLanguage;

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
          {t("settings.languageRegion.title")}
        </h1>
      }
    >
      <div className="flex flex-col gap-5">
        <div>
          <label htmlFor="settings-language" className="mb-1 block">
            {t("settings.languageRegion.appLanguage")}
          </label>
          <select
            id="settings-language"
            className="border-bd-input bg-background text-foreground w-full rounded-md border border-solid p-3"
            value={selectedLanguage}
            onChange={(event) => i18n.changeLanguage(event.target.value)}
          >
            {LANGUAGE_OPTIONS.map(({ value, label }) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="settings-system-names" className="mb-1 block">
            {t("settings.systemNames.label")}
          </label>
          <select
            id="settings-system-names"
            className="border-bd-input bg-background text-foreground w-full rounded-md border border-solid p-3"
            value={systemNameRegion}
            onChange={(event) =>
              setSystemNameRegion(
                event.target.value as SystemNameRegionPreference,
              )
            }
          >
            {SYSTEM_NAME_REGION_OPTIONS.map(({ value, labelKey }) => (
              <option key={value} value={value}>
                {t(labelKey)}
              </option>
            ))}
          </select>
        </div>
      </div>
    </PageFrame>
  );
}
