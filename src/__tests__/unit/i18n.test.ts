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
});
