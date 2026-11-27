import { describe, expect, it } from "vitest";
import {
  requestedTarget,
  splitSegments,
  splitTraits,
} from "@/lib/localPlayback/traits";

describe("splitSegments", () => {
  it("splits on top-level ||", () => {
    expect(splitSegments("@Audio/Song||#app")).toEqual(["@Audio/Song", "#app"]);
  });

  it("keeps escaped pipes in a segment", () => {
    expect(splitSegments("@Audio/A ^|^| B||#app")).toEqual([
      "@Audio/A ^|^| B",
      "#app",
    ]);
  });

  it("keeps pipes inside a quoted trait value", () => {
    expect(splitSegments('@Audio/Song||#note="a||b"')).toEqual([
      "@Audio/Song",
      '#note="a||b"',
    ]);
  });
});

describe("splitTraits", () => {
  it("separates trait segments from commands", () => {
    expect(splitTraits("@Audio/Song||#app #vol=5")).toEqual({
      commands: ["@Audio/Song"],
      traits: { app: true, vol: 5 },
    });
  });

  it("reads the **traits command", () => {
    expect(splitTraits('@Video/Clip||**traits:{"Device":true}')).toEqual({
      commands: ["@Video/Clip"],
      traits: { device: true },
    });
  });

  it("leaves a segment that is not all traits as a command", () => {
    expect(splitTraits("#app and more").commands).toEqual(["#app and more"]);
  });
});

describe("requestedTarget", () => {
  it.each([
    [{ app: true }, "app"],
    [{ app: false }, "device"],
    [{ device: true }, "device"],
    [{ device: "no" }, "app"],
    [{ app: "yes" }, "app"],
    [{ app: 0 }, "device"],
    [{ app: true, device: false }, "app"],
  ] as const)("reads %j as %s", (traits, target) => {
    expect(requestedTarget(traits)).toBe(target);
  });

  it.each([
    [{}],
    [{ app: true, device: true }],
    [{ app: false, device: false }],
    [{ app: "maybe" }],
  ])("reads %j as no target", (traits) => {
    expect(requestedTarget(traits)).toBeUndefined();
  });
});
