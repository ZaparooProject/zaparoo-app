import { readdirSync, readFileSync } from "fs";
import { resolve } from "path";
import { describe, expect, it } from "vitest";

type TranslationValue = string | number | boolean | null;

const translationsDirectory = resolve(__dirname, "../../translations");
const sourceLocale = "en-US.json";
const localeFiles = readdirSync(translationsDirectory)
  .filter((file) => file.endsWith(".json") && file !== sourceLocale)
  .sort();

function flattenTranslations(
  value: unknown,
  prefix = "",
  result = new Map<string, TranslationValue>(),
): Map<string, TranslationValue> {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    for (const [key, child] of Object.entries(value)) {
      flattenTranslations(child, prefix ? `${prefix}.${key}` : key, result);
    }
    return result;
  }

  result.set(prefix, value as TranslationValue);
  return result;
}

function loadTranslations(file: string): Map<string, TranslationValue> {
  return flattenTranslations(
    JSON.parse(readFileSync(resolve(translationsDirectory, file), "utf8")),
  );
}

function interpolationVariables(value: string): string[] {
  return Array.from(
    value.matchAll(/\{\{\s*([^},\s]+)[^}]*\}\}/g),
    (match) => match[1]!,
  ).sort();
}

const sourceTranslations = loadTranslations(sourceLocale);
const sourceKeys = [...sourceTranslations.keys()].sort();

describe.each(localeFiles)("%s translation parity", (localeFile) => {
  const translations = loadTranslations(localeFile);

  it("should match the source locale keys and value types", () => {
    expect([...translations.keys()].sort()).toEqual(sourceKeys);

    const typeMismatches = [...sourceTranslations]
      .filter(
        ([key, sourceValue]) =>
          typeof translations.get(key) !== typeof sourceValue,
      )
      .map(([key]) => key);
    expect(typeMismatches).toEqual([]);
  });

  it("should not contain blank translations", () => {
    const blankKeys = [...translations]
      .filter(([, value]) => typeof value === "string" && value.trim() === "")
      .map(([key]) => key);

    expect(blankKeys).toEqual([]);
  });

  it("should preserve interpolation variables", () => {
    const interpolationMismatches = [...sourceTranslations]
      .filter(([key, sourceValue]) => {
        const translatedValue = translations.get(key);
        if (
          typeof sourceValue !== "string" ||
          typeof translatedValue !== "string"
        ) {
          return false;
        }

        return (
          interpolationVariables(translatedValue).join("|") !==
          interpolationVariables(sourceValue).join("|")
        );
      })
      .map(([key]) => key);

    expect(interpolationMismatches).toEqual([]);
  });
});
