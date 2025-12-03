import { describe, it, expect } from "vitest";
import { render } from "../../test-utils";

describe("Test Utilities", () => {
  it("should import test utilities without errors", () => {
    expect(render).toBeDefined();
  });
});
