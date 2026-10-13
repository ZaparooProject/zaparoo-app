import { describe, expect, it } from "vitest";
import { suggestZapButton } from "@/lib/zapButtonDefaults";

const describeKey = (key: string) => `described:${key}`;

describe("suggestZapButton", () => {
  it("names a media launch after its title, not its system or path", () => {
    expect(suggestZapButton("@NES/Dr. Mario", describeKey)).toEqual({
      label: "Dr. Mario",
      icon: "play",
    });
    expect(
      suggestZapButton("**launch:SNES/Super Metroid.sfc", describeKey),
    ).toEqual({ label: "Super Metroid", icon: "play" });
    expect(
      suggestZapButton(
        "@NES/Dr. Mario (region:jp, region:us) (rev:1)",
        describeKey,
      ).label,
    ).toBe("Dr. Mario");
  });

  it("names other commands from their plain-language description", () => {
    expect(suggestZapButton("**stop", describeKey)).toEqual({
      label: expect.stringMatching(/^described:/),
      icon: "stop",
    });
    expect(suggestZapButton("**playlist.next", describeKey).icon).toBe("next");
    expect(suggestZapButton("**playlist.pause", describeKey).icon).toBe(
      "pause",
    );
  });

  it("only names a button from the first step", () => {
    expect(suggestZapButton("**stop||@NES/Dr. Mario", describeKey).icon).toBe(
      "stop",
    );
  });

  it("suggests nothing for a script it cannot read", () => {
    expect(suggestZapButton("", describeKey)).toEqual({ label: "", icon: "" });
    expect(suggestZapButton("**nonsense", describeKey)).toEqual({
      label: "",
      icon: "",
    });
  });
});
