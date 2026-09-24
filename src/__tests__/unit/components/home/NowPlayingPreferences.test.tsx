import { beforeEach, describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { act, render, screen, waitFor, within } from "@/test-utils";
import { NowPlayingInfo } from "@/components/home/NowPlayingInfo";
import { CoreAPI } from "@/lib/coreApi";
import type { MediaMetaResponse } from "@/lib/models";
import { useStatusStore } from "@/lib/store";

const primary = {
  deviceKey: "device-a",
  mediaName: "Game",
  mediaPath: "/roms/SNES/game.sfc",
  systemId: "SNES",
  systemName: "SNES",
  onStop: vi.fn(),
};

function meta(
  path: string,
  tags: MediaMetaResponse["media"]["tags"] = [],
): MediaMetaResponse {
  return {
    media: {
      path,
      parentDir: "/roms/SNES",
      isMissing: false,
      tags,
      properties: {},
      title: {
        slug: "game",
        name: "Game",
        slugLength: 4,
        slugWordCount: 1,
        system: { id: "SNES", name: "SNES" },
        tags: [],
        properties: {},
      },
    },
  };
}

describe("Now Playing preferences", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    CoreAPI.reset();
    useStatusStore.setState({
      connected: true,
      coreVersion: "2.18.0",
      coreVersionPending: false,
      gamesIndex: { exists: true, indexing: false },
    });
  });

  it("fetches path metadata independently for primary and background and updates the selected item", async () => {
    const lookup = vi
      .spyOn(CoreAPI, "mediaMeta")
      .mockImplementation(({ path }) =>
        Promise.resolve(
          meta(
            path!,
            path?.includes("background")
              ? [{ type: "user", tag: "disliked" }]
              : [{ type: "user", tag: "favorite" }],
          ),
        ),
      );
    const update = vi.spyOn(CoreAPI, "mediaTagsUpdate").mockResolvedValue({
      tags: [{ type: "user", tag: "playlater" }],
    });
    render(
      <>
        <NowPlayingInfo {...primary} />
        <NowPlayingInfo
          {...primary}
          mediaName="Background"
          mediaPath="/roms/SNES/background.sfc"
          headingLabel="scan.backgroundMediaHeading"
        />
      </>,
    );

    const foreground = within(
      screen.getByRole("region", { name: "scan.nowPlayingHeading" }),
    );
    const background = within(
      screen.getByRole("region", { name: "scan.backgroundMediaHeading" }),
    );
    expect(
      await foreground.findByRole("button", { name: "library.removeFavorite" }),
    ).toBeEnabled();
    expect(
      await background.findByRole("button", { name: "library.removeDislike" }),
    ).toBeEnabled();
    const preferenceGroup = foreground.getByRole("group", {
      name: "scan.mediaPreferences",
    });
    for (const name of [
      "library.removeFavorite",
      "library.addLike",
      "library.addDislike",
      "library.addPlayLater",
    ]) {
      const button = within(preferenceGroup).getByRole("button", { name });
      expect(button).toHaveAccessibleName(name);
      expect(button.textContent).toBe("");
    }
    expect(lookup).toHaveBeenCalledWith(
      { system: "SNES", path: primary.mediaPath },
      expect.any(AbortSignal),
    );
    expect(lookup).toHaveBeenCalledWith(
      { system: "SNES", path: "/roms/SNES/background.sfc" },
      expect.any(AbortSignal),
    );

    await userEvent
      .setup()
      .click(background.getByRole("button", { name: "library.addPlayLater" }));
    expect(update).toHaveBeenCalledWith({
      system: "SNES",
      path: "/roms/SNES/background.sfc",
      add: ["user:playlater"],
    });
    expect(
      await background.findByRole("button", {
        name: "library.removePlayLater",
      }),
    ).toBeInTheDocument();
    expect(
      foreground.getByRole("button", { name: "library.removeFavorite" }),
    ).toHaveAttribute("aria-pressed", "true");
  });

  it("keeps cover, title and preferences compact while opening metadata in details", async () => {
    const lookup = vi.spyOn(CoreAPI, "mediaMeta").mockResolvedValue(
      meta(primary.mediaPath!, [
        { type: "genre", tag: "Platformer" },
        { type: "year", tag: "1994" },
        { type: "players", tag: "2" },
        { type: "region", tag: "us" },
        { type: "developer", tag: "Nintendo" },
        { type: "user", tag: "favorite" },
        { type: "scraper.provider", tag: "hidden" },
      ]),
    );
    const image = vi.spyOn(CoreAPI, "mediaImage").mockResolvedValue({
      contentType: "image/png",
      data: "aGVsbG8=",
      typeTag: "property:image-cover",
    });
    const { container } = render(<NowPlayingInfo {...primary} />);

    await waitFor(() =>
      expect(container.querySelector("img")).toHaveAttribute(
        "src",
        "data:image/png;base64,aGVsbG8=",
      ),
    );
    expect(container.querySelector("img")).toHaveAttribute("alt", "");
    expect(screen.queryByText("Platformer")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("region us")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "scan.stopPlayingButton" }),
    ).toBeEnabled();
    expect(
      screen.getByRole("button", { name: "library.removeFavorite" }),
    ).toBeEnabled();
    const details = screen.getByRole("button", {
      name: "library.details: Game",
    });
    expect(details).toHaveTextContent("Game");
    expect(details).not.toHaveTextContent("library.details");
    await userEvent.setup().click(details);
    const dialog = screen.getByRole("dialog", { name: "Game" });
    expect(within(dialog).getByText("Platformer")).toBeInTheDocument();
    expect(within(dialog).getByLabelText("region us")).toBeInTheDocument();
    expect(within(dialog).getByText("Nintendo")).toBeInTheDocument();
    expect(
      within(dialog).queryByLabelText("user favorite"),
    ).not.toBeInTheDocument();
    expect(
      within(dialog).queryByLabelText("scraper.provider hidden"),
    ).not.toBeInTheDocument();
    expect(
      within(dialog).queryByRole("button", { name: "library.launch" }),
    ).not.toBeInTheDocument();
    expect(
      within(dialog).getByRole("button", { name: "library.write" }),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByRole("button", { name: "library.removeFavorite" }),
    ).toBeInTheDocument();
    expect(lookup).toHaveBeenCalledTimes(1);
    expect(image).toHaveBeenCalledWith(
      { system: "SNES", path: primary.mediaPath, maxSize: 192 },
      undefined,
    );
  });

  it("opens the same read-only details when the cover is pressed", async () => {
    const lookup = vi
      .spyOn(CoreAPI, "mediaMeta")
      .mockResolvedValue(
        meta(primary.mediaPath!, [{ type: "genre", tag: "Platformer" }]),
      );
    vi.spyOn(CoreAPI, "mediaImage").mockResolvedValue({
      contentType: "image/png",
      data: "aGVsbG8=",
      typeTag: "property:image-cover",
    });
    render(<NowPlayingInfo {...primary} />);

    const cover = await screen.findByRole("button", {
      name: "library.details: library.imageAlt",
    });
    await userEvent.setup().click(cover);

    const dialog = screen.getByRole("dialog", { name: "Game" });
    expect(within(dialog).getByText("Platformer")).toBeInTheDocument();
    expect(
      within(dialog).queryByRole("button", { name: "library.launch" }),
    ).not.toBeInTheDocument();
    expect(lookup).toHaveBeenCalledTimes(1);
  });

  it("keeps text and controls when indexed art is unavailable", async () => {
    vi.spyOn(CoreAPI, "mediaMeta").mockResolvedValue(
      meta(primary.mediaPath!, [{ type: "genre", tag: "Puzzle" }]),
    );
    const image = vi.spyOn(CoreAPI, "mediaImage").mockResolvedValue({
      contentType: "text/plain",
      data: "",
      typeTag: "",
    });
    const { container } = render(<NowPlayingInfo {...primary} />);

    await waitFor(() => expect(image).toHaveBeenCalledOnce());
    expect(screen.queryByText("Puzzle")).not.toBeInTheDocument();
    expect(container.querySelector("img")).not.toBeInTheDocument();
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "library.details: Game" }));
    expect(
      within(screen.getByRole("dialog", { name: "Game" })).getByText("Puzzle"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "scan.stopPlayingButton" }),
    ).toBeEnabled();
    expect(
      within(
        screen.getByRole("group", { name: "scan.mediaPreferences" }),
      ).getByRole("button", { name: "library.addLike" }),
    ).toBeEnabled();
  });

  it("does not offer actions for empty or playlist-only media, missing index, or unsupported Core", () => {
    const lookup = vi.spyOn(CoreAPI, "mediaMeta");
    const { rerender } = render(
      <NowPlayingInfo {...primary} mediaName="" mediaPath="" />,
    );
    expect(
      screen.queryByRole("group", { name: "scan.mediaPreferences" }),
    ).not.toBeInTheDocument();
    rerender(<NowPlayingInfo {...primary} mediaPath="" />);
    expect(
      screen.queryByRole("group", { name: "scan.mediaPreferences" }),
    ).not.toBeInTheDocument();
    act(() =>
      useStatusStore.setState({
        gamesIndex: { exists: false, indexing: false },
      }),
    );
    rerender(<NowPlayingInfo {...primary} />);
    expect(
      screen.queryByRole("group", { name: "scan.mediaPreferences" }),
    ).not.toBeInTheDocument();
    act(() =>
      useStatusStore.setState({
        gamesIndex: { exists: true, indexing: false },
        coreVersion: "2.14.9",
      }),
    );
    rerender(<NowPlayingInfo {...primary} />);
    expect(
      screen.queryByRole("group", { name: "scan.mediaPreferences" }),
    ).not.toBeInTheDocument();
    expect(lookup).not.toHaveBeenCalled();
  });

  it("can mark indexed media identified by path even without a display name", async () => {
    const lookup = vi
      .spyOn(CoreAPI, "mediaMeta")
      .mockResolvedValue(meta(primary.mediaPath!));
    render(<NowPlayingInfo {...primary} mediaName="" />);
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "library.addLike" }),
      ).toBeEnabled(),
    );
    expect(lookup).toHaveBeenCalledWith(
      { system: "SNES", path: primary.mediaPath },
      expect.any(AbortSignal),
    );
  });

  it("keeps Favorite available on 2.17 and disables controls when a path cannot be indexed", async () => {
    useStatusStore.setState({ coreVersion: "2.17.9" });
    vi.spyOn(CoreAPI, "mediaMeta").mockRejectedValue(
      new Error("media not found"),
    );
    render(<NowPlayingInfo {...primary} />);
    expect(
      await screen.findByRole("button", { name: "library.addFavorite" }),
    ).toBeDisabled();
    expect(
      screen.queryByRole("button", { name: "library.addLike" }),
    ).not.toBeInTheDocument();
  });

  it("discards an old path's metadata when active media switches", async () => {
    let finish!: (response: MediaMetaResponse) => void;
    vi.spyOn(CoreAPI, "mediaMeta").mockImplementation(({ path }) =>
      path === primary.mediaPath
        ? new Promise((resolve) => {
            finish = resolve;
          })
        : Promise.resolve(
            meta(path!, [
              { type: "user", tag: "liked" },
              { type: "genre", tag: "Puzzle" },
            ]),
          ),
    );
    const { rerender } = render(<NowPlayingInfo {...primary} />);
    await waitFor(() => expect(finish).toBeTypeOf("function"));
    rerender(<NowPlayingInfo {...primary} mediaPath="/roms/SNES/second.sfc" />);
    expect(
      await screen.findByRole("button", { name: "library.removeLike" }),
    ).toHaveAttribute("aria-pressed", "true");
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "library.details: Game" }));
    expect(
      within(screen.getByRole("dialog", { name: "Game" })).getByText("Puzzle"),
    ).toBeInTheDocument();
    await act(async () =>
      finish(
        meta(primary.mediaPath!, [
          { type: "user", tag: "favorite" },
          { type: "genre", tag: "Platformer" },
        ]),
      ),
    );
    expect(screen.queryByText("Platformer")).not.toBeInTheDocument();
    expect(
      within(
        screen.getByRole("group", { name: "scan.mediaPreferences" }),
      ).getByRole("button", { name: "library.addFavorite" }),
    ).toHaveAttribute("aria-pressed", "false");
  });
});
