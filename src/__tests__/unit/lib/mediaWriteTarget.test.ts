import { describe, expect, it } from "vitest";
import {
  getDefaultMediaWriteValue,
  getMediaWritePath,
  hasMultipleMediaWriteTargets,
  shouldSelectMediaWriteTarget,
  type MediaWriteSource,
} from "@/lib/mediaWriteTarget";

const media: MediaWriteSource = {
  path: "/roms/SNES/Super Game.sfc",
  relativePath: "SNES/Super Game.sfc",
  zapScript: "@SNES/Super Game",
  tags: [],
};

describe("mediaWriteTarget", () => {
  it("should prefer the relative path for the path choice", () => {
    expect(getMediaWritePath(media)).toBe("SNES/Super Game.sfc");
  });

  it("should default to ZapScript when available", () => {
    expect(getDefaultMediaWriteValue(media)).toBe("@SNES/Super Game");
  });

  it("should trim write values before returning or comparing them", () => {
    expect(
      getMediaWritePath({
        ...media,
        relativePath: "  SNES/Super Game.sfc  ",
      }),
    ).toBe("SNES/Super Game.sfc");
    expect(
      getDefaultMediaWriteValue({
        ...media,
        zapScript: "  @SNES/Super Game  ",
      }),
    ).toBe("@SNES/Super Game");
    expect(
      hasMultipleMediaWriteTargets({
        ...media,
        relativePath: "  SNES/Super Game.sfc  ",
        zapScript: " SNES/Super Game.sfc ",
      }),
    ).toBe(false);
  });

  it("should fall back from ZapScript to relative then absolute path", () => {
    expect(
      getDefaultMediaWriteValue({
        ...media,
        zapScript: undefined,
      }),
    ).toBe("SNES/Super Game.sfc");
    expect(
      getDefaultMediaWriteValue({
        ...media,
        zapScript: undefined,
        relativePath: undefined,
      }),
    ).toBe("/roms/SNES/Super Game.sfc");
  });

  it("should detect distinct ZapScript and path values", () => {
    expect(hasMultipleMediaWriteTargets(media)).toBe(true);
    expect(
      hasMultipleMediaWriteTargets({ ...media, zapScript: undefined }),
    ).toBe(false);
    expect(
      hasMultipleMediaWriteTargets({
        ...media,
        zapScript: media.relativePath,
      }),
    ).toBe(false);
  });

  it("should select a customizable ZapScript even without a path", () => {
    expect(
      shouldSelectMediaWriteTarget({
        ...media,
        path: "",
        relativePath: undefined,
      }),
    ).toBe(true);
    expect(
      shouldSelectMediaWriteTarget({
        ...media,
        path: "",
        relativePath: undefined,
        zapScript: "**launch.system:SNES",
      }),
    ).toBe(false);
  });
});
