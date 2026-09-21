/**
 * Integration Test: Home cover rows
 *
 * Shared interaction for recently played and favourites.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { fireEvent, render, screen, within } from "@/test-utils";
import { MediaCoverRow } from "@/components/home/MediaCoverRow";
import { useStatusStore, ConnectionState } from "@/lib/store";
import type { MediaBrowseEntry } from "@/lib/models";

function entry(overrides: Partial<MediaBrowseEntry> = {}): MediaBrowseEntry {
  return {
    name: "Super Mario World",
    path: "/games/smw.sfc",
    type: "media",
    systemId: "SNES",
    systemName: "Super Nintendo",
    ...overrides,
  };
}

describe("Home cover rows", () => {
  beforeEach(() => {
    useStatusStore.setState({
      ...useStatusStore.getInitialState(),
      connected: true,
      connectionState: ConnectionState.CONNECTED,
      coreVersion: "2.17.0",
      coreVersionPending: false,
    });
  });

  it("renders nothing when there is nothing to show", () => {
    render(
      <MediaCoverRow
        headingLabel="scan.recentsHeading"
        entries={[]}
        onSelect={() => {}}
      />,
    );

    expect(
      screen.queryByRole("region", { name: "scan.recentsHeading" }),
    ).not.toBeInTheDocument();
  });

  it("opens media details on tap instead of launching immediately", async () => {
    const user = userEvent.setup();
    const media = entry();
    const onSelect = vi.fn();
    render(
      <MediaCoverRow
        headingLabel="scan.recentsHeading"
        entries={[media]}
        onSelect={onSelect}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: "scan.coverRowDetails" }),
    );

    expect(onSelect).toHaveBeenCalledWith(media);
  });

  it("shows tactile pressed state", () => {
    render(
      <MediaCoverRow
        headingLabel="scan.recentsHeading"
        entries={[entry()]}
        onSelect={() => {}}
      />,
    );

    const tile = screen.getByRole("button", {
      name: "scan.coverRowDetails",
    });
    fireEvent.mouseDown(tile);
    expect(tile).toHaveAttribute("data-pressed", "true");

    fireEvent.mouseUp(tile);
    expect(tile).not.toHaveAttribute("data-pressed");
  });

  it("scrolls an overflowing row with a desktop mouse wheel", () => {
    render(
      <MediaCoverRow
        headingLabel="scan.recentsHeading"
        entries={[entry(), entry({ name: "Zelda", path: "/games/zelda.sfc" })]}
        onSelect={() => {}}
      />,
    );

    const row = screen.getByRole("list");
    Object.defineProperties(row, {
      clientWidth: { value: 240, configurable: true },
      scrollWidth: { value: 480, configurable: true },
      scrollLeft: { value: 0, writable: true, configurable: true },
    });

    fireEvent.wheel(row, { deltaY: 120 });

    expect(row.scrollLeft).toBe(120);
  });

  it("labels each row so the two are distinguishable", () => {
    render(
      <>
        <MediaCoverRow
          headingLabel="scan.recentsHeading"
          entries={[entry()]}
          onSelect={() => {}}
        />
        <MediaCoverRow
          headingLabel="scan.favouritesHeading"
          entries={[entry({ name: "Zelda", path: "/games/zelda.sfc" })]}
          onSelect={() => {}}
        />
      </>,
    );

    const favourites = within(
      screen.getByRole("region", { name: "scan.favouritesHeading" }),
    );
    expect(favourites.getByText("Zelda")).toBeVisible();
  });
});
