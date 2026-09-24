import { beforeEach, describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { QueryClient } from "@tanstack/react-query";
import { act, render, screen, waitFor } from "@/test-utils";
import { MediaPreferenceActions } from "@/components/library/MediaPreferenceActions";
import { CoreAPI } from "@/lib/coreApi";
import { LIBRARY_QUERY_KEYS } from "@/lib/libraryMedia";
import { useStatusStore } from "@/lib/store";
import type { MediaBrowseEntry, MediaTagsUpdateResponse } from "@/lib/models";

const { mockErrorToast } = vi.hoisted(() => ({ mockErrorToast: vi.fn() }));
vi.mock("@/lib/toastUtils", () => ({
  showRateLimitedErrorToast: mockErrorToast,
}));

const entry: MediaBrowseEntry = {
  mediaId: 42,
  type: "media",
  name: "Game",
  systemId: "SNES",
  path: "/roms/SNES/game.sfc",
  tags: [
    { type: "user", tag: "favorite" },
    { type: "user", tag: "liked" },
    { type: "user", tag: "playlater" },
  ],
};

function actions(media: MediaBrowseEntry = entry, deviceKey = "device-a") {
  return (
    <MediaPreferenceActions
      entry={media}
      fallbackSystemId="SNES"
      deviceKey={deviceKey}
      context="modal"
    />
  );
}

describe("MediaPreferenceActions", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    CoreAPI.reset();
    mockErrorToast.mockClear();
    useStatusStore.setState({
      connected: true,
      coreVersion: "2.18.0-beta.2",
      coreVersionPending: false,
    });
  });

  it("uses Core's effective tags when a dislike clears both like and favorite", async () => {
    let finish!: (response: MediaTagsUpdateResponse) => void;
    const update = vi.spyOn(CoreAPI, "mediaTagsUpdate").mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const invalidate = vi.spyOn(QueryClient.prototype, "invalidateQueries");
    const user = userEvent.setup();
    render(actions());

    expect(
      screen.getByRole("button", { name: "library.removeFavorite" }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(
      screen.getByRole("button", { name: "library.removeLike" }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(
      screen.getByRole("button", { name: "library.removePlayLater" }),
    ).toHaveAttribute("aria-pressed", "true");
    const dislikeIcon = screen
      .getByRole("button", { name: "library.addDislike" })
      .querySelector("svg");
    await user.click(
      screen.getByRole("button", { name: "library.addDislike" }),
    );
    expect(
      screen
        .getByRole("button", { name: "library.updatingPreference" })
        .querySelector("svg"),
    ).toBe(dislikeIcon);
    expect(update).toHaveBeenCalledWith({
      mediaId: 42,
      add: ["user:disliked"],
    });
    expect(
      screen.getByRole("button", { name: "library.addFavorite" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "library.updatingPreference" }),
    ).toHaveTextContent("library.dislike");
    for (const label of [
      "library.favorite",
      "library.like",
      "library.playLater",
    ]) {
      expect(screen.getByText(label).closest("button")).toBeDisabled();
    }
    expect(
      screen.getByRole("button", { name: "library.addLike" }),
    ).toHaveAttribute("aria-pressed", "false");
    expect(
      screen.getByRole("button", { name: "library.removePlayLater" }),
    ).toHaveAttribute("aria-pressed", "true");

    await act(async () =>
      finish({
        tags: [
          { type: "user", tag: "disliked" },
          { type: "user", tag: "playlater" },
        ],
      }),
    );
    expect(
      await screen.findByRole("button", { name: "library.removeDislike" }),
    ).toBeEnabled();
    expect(
      screen.getByRole("button", { name: "library.addFavorite" }),
    ).toHaveAttribute("aria-pressed", "false");
    await waitFor(() =>
      expect(invalidate).toHaveBeenCalledWith({
        queryKey: [LIBRARY_QUERY_KEYS.collections, "device-a"],
      }),
    );
    const keys = invalidate.mock.calls.map(([arg]) => arg?.queryKey?.[0]);
    expect(keys.indexOf(LIBRARY_QUERY_KEYS.browseIndex)).toBeLessThan(
      keys.indexOf(LIBRARY_QUERY_KEYS.browse),
    );
  });

  it("adding favorite clears disliked but preserves play later", async () => {
    const update = vi.spyOn(CoreAPI, "mediaTagsUpdate").mockResolvedValue({
      tags: [
        { type: "user", tag: "favorite" },
        { type: "user", tag: "playlater" },
      ],
    });
    render(
      actions({
        ...entry,
        tags: [
          { type: "user", tag: "disliked" },
          { type: "user", tag: "playlater" },
        ],
      }),
    );
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "library.addFavorite" }));
    expect(update).toHaveBeenCalledWith({
      mediaId: 42,
      add: ["user:favorite"],
    });
    expect(
      await screen.findByRole("button", { name: "library.addDislike" }),
    ).toHaveAttribute("aria-pressed", "false");
    expect(
      screen.getByRole("button", { name: "library.removePlayLater" }),
    ).toHaveAttribute("aria-pressed", "true");
  });

  it("rolls back on error and does not carry a pending old game into a new selection", async () => {
    let fail!: (error: Error) => void;
    vi.spyOn(CoreAPI, "mediaTagsUpdate").mockImplementation(
      () =>
        new Promise((_, reject) => {
          fail = reject;
        }),
    );
    const { rerender } = render(actions());
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "library.addDislike" }));
    rerender(
      actions(
        { ...entry, mediaId: 43, path: "/roms/SNES/other.sfc", tags: [] },
        "device-b",
      ),
    );
    expect(
      screen.getByRole("button", { name: "library.addFavorite" }),
    ).toHaveAttribute("aria-pressed", "false");
    await act(async () => fail(new Error("update failed")));
    expect(
      screen.getByRole("button", { name: "library.addFavorite" }),
    ).toHaveAttribute("aria-pressed", "false");
    expect(mockErrorToast).toHaveBeenCalledWith("library.preferenceError");
  });

  it("hides new actions on older Core while preserving Favorite", () => {
    useStatusStore.setState({ coreVersion: "2.17.9" });
    render(actions());
    expect(
      screen.getByRole("button", { name: "library.removeFavorite" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "library.removeLike" }),
    ).not.toBeInTheDocument();
  });
});
