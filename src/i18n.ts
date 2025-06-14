import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";

import en_US from "./translations/en-US.json";
import zh_CN from "./translations/zh-CN.json";
import ko_KR from "./translations/ko-KR.json";
import fr_FR from "./translations/fr-FR.json";
import nl_NL from "./translations/nl-NL.json";
import ja_JP from "./translations/ja-JP.json";
import de_DE from "./translations/de-DE.json";

const resources = {
  en: en_US,
  "en-US": en_US,
  "en-GB": en_US,
  fr: fr_FR,
  "fr-FR": fr_FR,
  zh: zh_CN,
  "zh-CN": zh_CN,
  ko: ko_KR,
  "ko-KR": ko_KR,
  nl: nl_NL,
  "nl-NL": nl_NL,
  ja: ja_JP,
  "ja-JP": ja_JP,
  "de-DE": de_DE
};

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: "en-US",
    // debug: true,
    interpolation: {
      escapeValue: false
    }
  });

export default i18n;
