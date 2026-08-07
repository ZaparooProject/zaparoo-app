import { describe, expect, it } from "vitest";
import { buildTitleZapScript, parseTitleZapScript } from "@/lib/titleZapScript";

describe("titleZapScript", () => {
  describe("parseTitleZapScript", () => {
    it("should parse Core title tags and preserve their order", () => {
      expect(
        parseTitleZapScript("@Genesis/Sonic (region:eu, region:us) (lang:en)"),
      ).toEqual({
        base: "@Genesis/Sonic",
        suffix: "",
        tags: [
          { type: "region", tag: "eu" },
          { type: "region", tag: "us" },
          { type: "lang", tag: "en" },
        ],
      });
    });

    it("should preserve title parentheses and advanced arguments", () => {
      expect(
        parseTitleZapScript(
          "@PSX/Formula One (1997) (region:eu)?launcher=retroarch",
        ),
      ).toEqual({
        base: "@PSX/Formula One (1997)",
        suffix: "?launcher=retroarch",
        tags: [{ type: "region", tag: "eu" }],
      });
    });

    it("should parse a title command without default tags", () => {
      expect(parseTitleZapScript("@SNES/Super Mario World")).toEqual({
        base: "@SNES/Super Mario World",
        suffix: "",
        tags: [],
      });
    });

    it.each([
      "SNES/Super Mario World",
      "**launch:SNES/Super Mario World.sfc",
      "@SNES/Super Mario World||**delay:1s",
      "@SNES/Super Mario World?tags=region:us",
      "@SNES/Super Mario World (-unfinished:beta)",
    ])("should reject unsupported script %s", (zapScript) => {
      expect(parseTitleZapScript(zapScript)).toBeNull();
    });
  });

  describe("buildTitleZapScript", () => {
    it("should group values by type in first-seen order", () => {
      const parsed = parseTitleZapScript("@SNES/Game");
      expect(parsed).not.toBeNull();

      expect(
        buildTitleZapScript(parsed!, [
          { type: "region", tag: "us" },
          { type: "rev", tag: "a" },
          { type: "region", tag: "eu" },
          { type: "lang", tag: "en" },
        ]),
      ).toBe("@SNES/Game (region:us, region:eu) (rev:a) (lang:en)");
    });

    it("should preserve suffix and remove all tags when none are selected", () => {
      const parsed = parseTitleZapScript(
        "@SNES/Game (region:us)?launcher=custom",
      );
      expect(parsed).not.toBeNull();

      expect(buildTitleZapScript(parsed!, [])).toBe(
        "@SNES/Game?launcher=custom",
      );
    });

    it("should ignore duplicate and unsafe tags", () => {
      const parsed = parseTitleZapScript("@SNES/Game");
      expect(parsed).not.toBeNull();

      expect(
        buildTitleZapScript(parsed!, [
          { type: "region", tag: "us" },
          { type: "region", tag: "us" },
          { type: "bad type", tag: "value" },
          { type: "lang", tag: "en) (-region:us" },
        ]),
      ).toBe("@SNES/Game (region:us)");
    });

    it("should round trip Core grouped output", () => {
      const zapScript =
        "@GBA/Game (unfinished:beta) (region:us) (lang:en, lang:fr)";
      const parsed = parseTitleZapScript(zapScript);
      expect(parsed).not.toBeNull();

      expect(buildTitleZapScript(parsed!, parsed!.tags)).toBe(zapScript);
    });
  });
});
