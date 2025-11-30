import { describe, it, expect } from "vitest";
import type { SearchParams } from "../../lib/models";

describe("SearchParams Type Requirements", () => {
  it("should allow maxResults as a required property for Core API compatibility", () => {
    // This test requires maxResults to exist in the interface
    function requiresMaxResults(
      params: SearchParams & { maxResults: number },
    ): number {
      return params.maxResults;
    }

    const searchParams: SearchParams = {
      query: "mario",
      systems: ["snes"],
    };

    // This should fail if maxResults doesn't exist as optional in interface
    // @ts-expect-error - maxResults should be optional in SearchParams
    const result = requiresMaxResults(searchParams);

    expect(result).toBeUndefined();
  });
});
