import type { TagInfo } from "@/lib/models";

const REGION_KEYS: Record<string, string> = {
  world: "world",
  ww: "world",
  us: "us",
  usa: "us",
  eu: "eu",
  europe: "eu",
  jp: "jp",
  japan: "jp",
  au: "au",
  kr: "kr",
  cn: "cn",
  tw: "tw",
  hk: "hk",
  br: "br",
  ca: "ca",
  uk: "uk",
  gb: "uk",
  fr: "fr",
  de: "de",
  it: "it",
  es: "es",
  scandinavia: "scandinavia",
  asia: "asia",
};
const LANGUAGE_KEYS: Record<string, string> = {
  en: "en",
  eng: "en",
  fr: "fr",
  fre: "fr",
  fra: "fr",
  de: "de",
  ger: "de",
  deu: "de",
  es: "es",
  spa: "es",
  it: "it",
  ita: "it",
  ja: "ja",
  jpn: "ja",
  ko: "ko",
  kor: "ko",
  zh: "zh",
  chi: "zh",
  zho: "zh",
  pt: "pt",
  por: "pt",
  nl: "nl",
  dut: "nl",
  nld: "nl",
  sv: "sv",
  no: "no",
  da: "da",
  fi: "fi",
  pl: "pl",
  pol: "pl",
  ru: "ru",
  rus: "ru",
  ar: "ar",
  ara: "ar",
  "en-us": "en-US",
  "en-gb": "en-GB",
};
const EDITION_KEYS: Record<string, string> = {
  "directors-cut": "directorsCut",
  collectors: "collectors",
  limited: "limited",
  special: "special",
  deluxe: "deluxe",
  ultimate: "ultimate",
  anniversary: "anniversary",
  remaster: "remastered",
  remastered: "remastered",
};

type TranslateTagLabel = (key: string, options?: { value: string }) => string;

/** Core labels are authoritative; only known codes receive local fallbacks. */
export function libraryTagDisplayLabel(
  tag: TagInfo,
  t: TranslateTagLabel,
): string {
  const raw = tag.tag.trim();
  const label = tag.label?.trim();
  if (label && label !== raw) return label;
  const type = tag.type.trim().toLowerCase();
  const value = raw.toLowerCase();
  const mappings =
    type === "region"
      ? REGION_KEYS
      : type === "lang"
        ? LANGUAGE_KEYS
        : type === "edition"
          ? EDITION_KEYS
          : undefined;
  if (mappings) {
    const key = Object.prototype.hasOwnProperty.call(mappings, value)
      ? mappings[value]
      : undefined;
    if (key) return t(`library.tagValues.${type}.${key}`);
  }
  if (type === "rev") {
    const revision = value.replace(
      /^(?:revision-|version-|revision|version|rev-|ver-)/,
      "",
    );
    if (/^\d+$/.test(revision))
      return t("library.revisionValue", { value: revision });
  }
  return label || tag.tag;
}
