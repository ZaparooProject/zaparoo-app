import { beforeEach, describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { render, screen } from "@/test-utils";
import { CoreAPI } from "@/lib/coreApi";
import { ConnectionState, useStatusStore } from "@/lib/store";
import { DeckItemDetailsModal } from "@/components/library/DeckItemDetailsModal";
import type { DeckItem } from "@/lib/models";

const item: DeckItem = {
  id: 1,
  position: 1,
  kind: "script",
  name: "Game",
  zapscript: "@SNES/Game",
};

describe("DeckItemDetailsModal launching", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    useStatusStore.setState({ connectionState: ConnectionState.CONNECTED });
  });

  it("keeps a stable Play caption and announces launching through the accessible name", async () => {
    const user = userEvent.setup();
    let finish: () => void = () => undefined;
    vi.spyOn(CoreAPI, "run").mockReturnValue(
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
    );
    render(
      <DeckItemDetailsModal
        item={item}
        deckId="deck1"
        isOpen
        close={vi.fn()}
        canRemove={false}
        onRemove={vi.fn()}
        writeAvailable={false}
      />,
    );

    await user.click(screen.getByRole("button", { name: "decks.play" }));

    const launching = await screen.findByRole("button", {
      name: "library.launching",
    });
    expect(launching).toHaveTextContent("decks.play");
    expect(launching).toBeDisabled();
    expect(launching.querySelector("svg.animate-spin")).not.toBeNull();

    finish();
    expect(
      await screen.findByRole("button", { name: "decks.play" }),
    ).toBeEnabled();
  });
});
