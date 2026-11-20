import { describe, it, expect } from "vitest";
import { isRandomLaunchScript } from "@/lib/shakeSheetStore";

describe("isRandomLaunchScript", () => {
  it.each([
    ["**launch.random:all", true],
    ["**launch.random:SNES,Genesis", true],
    ["**random:SNES", true],
    ["**input.keyboard:a||**launch.random:NES", true],
    ["**launch.search:mario", false],
    ["SNES/Super Mario World.sfc", false],
    ["", false],
  ])("%s -> %s", (script, expected) => {
    expect(isRandomLaunchScript(script)).toBe(expected);
  });
});
