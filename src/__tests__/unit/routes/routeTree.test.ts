import { describe, expect, it, vi } from "vitest";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "@/routeTree.gen";

vi.mock("@/lib/mfaAuthentication", () => ({}));

describe("route tree", () => {
  it("renders the custom deck item page as its own screen, not inside deck details", () => {
    const router = createRouter({ routeTree });
    const add = router.routesByPath["/library/decks/$deckId/add"];
    expect(add.parentRoute.id).toBe("__root__");
  });
});
