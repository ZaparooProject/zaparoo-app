import { afterEach, describe, expect, it } from "vitest";
import i18n from "@/i18n";

describe("document language", () => {
  const originalLanguage = i18n.resolvedLanguage ?? "en-US";

  afterEach(async () => {
    await i18n.changeLanguage(originalLanguage);
  });

  it("should follow the active app language", async () => {
    await i18n.changeLanguage("ja-JP");

    expect(document.documentElement).toHaveAttribute("lang", "ja-JP");

    await i18n.changeLanguage("es-ES");

    expect(document.documentElement).toHaveAttribute("lang", "es-ES");
  });

  it("should use British English copy for en-GB", async () => {
    await i18n.changeLanguage("en-GB");

    expect(i18n.t("library.favorites")).toBe("Favourites");
    expect(document.documentElement).toHaveAttribute("lang", "en-GB");
  });

  it("should pluralize the pairing rate-limit countdown", async () => {
    await i18n.changeLanguage("en-US");

    expect(i18n.t("pairing.error.rate_limited", { count: 1 })).toContain(
      "Wait 1 second",
    );
    expect(i18n.t("pairing.error.rate_limited", { count: 2 })).toContain(
      "Wait 2 seconds",
    );
  });
});
