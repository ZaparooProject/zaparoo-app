import { beforeEach, describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { QueryClient } from "@tanstack/react-query";
import { render, screen, waitFor } from "@/test-utils";
import { FavoriteButton } from "@/components/library/FavoriteButton";
import { CoreAPI } from "@/lib/coreApi";
import { LIBRARY_QUERY_KEYS } from "@/lib/libraryMedia";
import { logger } from "@/lib/logger";
import type { MediaBrowseEntry } from "@/lib/models";
import { useStatusStore } from "@/lib/store";

const { mockErrorToast } = vi.hoisted(() => ({
  mockErrorToast: vi.fn(),
}));

vi.mock("@/lib/toastUtils", () => ({
  showRateLimitedErrorToast: mockErrorToast,
}));

function mediaEntry(
  overrides: Partial<MediaBrowseEntry> = {},
): MediaBrowseEntry {
  return {
    mediaId: 42,
    name: "Favorite Game",
    path: "/roms/SNES/Favorite Game.sfc",
    type: "media",
    systemId: "SNES",
    tags: [],
    ...overrides,
  };
}

describe("FavoriteButton", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockErrorToast.mockClear();
    useStatusStore.setState({
      connected: true,
      coreVersion: "2.15.0",
      coreVersionPending: false,
    });
  });

  it("should optimistically add a favorite by media ID", async () => {
    const updateSpy = vi.spyOn(CoreAPI, "mediaTagsUpdate").mockResolvedValue({
      tags: [{ type: "user", tag: "favorite" }],
    });
    const user = userEvent.setup();

    render(
      <FavoriteButton
        entry={mediaEntry()}
        fallbackSystemId="SNES"
        deviceKey="device-a"
      />,
    );
    const button = screen.getByRole("button", {
      name: "library.addFavorite",
    });
    await user.click(button);

    expect(button).toHaveAttribute("aria-pressed", "true");
    expect(updateSpy).toHaveBeenCalledWith({
      mediaId: 42,
      add: ["user:favorite"],
    });
    expect(
      await screen.findByRole("button", { name: "library.removeFavorite" }),
    ).toBeInTheDocument();
  });

  it("should refresh letter cursors before browse lists after a change", async () => {
    vi.spyOn(CoreAPI, "mediaTagsUpdate").mockResolvedValue({
      tags: [{ type: "user", tag: "favorite" }],
    });
    const invalidateSpy = vi.spyOn(QueryClient.prototype, "invalidateQueries");
    const user = userEvent.setup();

    render(
      <FavoriteButton
        entry={mediaEntry()}
        fallbackSystemId="SNES"
        deviceKey="device-a"
      />,
    );
    await user.click(
      screen.getByRole("button", { name: "library.addFavorite" }),
    );

    await waitFor(() => expect(invalidateSpy).toHaveBeenCalled());
    const invalidated = invalidateSpy.mock.calls.map(
      ([filters]) => filters?.queryKey,
    );
    const indexAt = invalidated.findIndex(
      (key) => key?.[0] === LIBRARY_QUERY_KEYS.browseIndex,
    );
    const browseAt = invalidated.findIndex(
      (key) => key?.[0] === LIBRARY_QUERY_KEYS.browse,
    );
    expect(invalidated[indexAt]).toEqual([
      LIBRARY_QUERY_KEYS.browseIndex,
      "device-a",
    ]);
    expect(indexAt).toBeLessThan(browseAt);
  });

  it("should remove a favorite using system and path fallback", async () => {
    const updateSpy = vi.spyOn(CoreAPI, "mediaTagsUpdate").mockResolvedValue({
      tags: [],
    });
    const user = userEvent.setup();

    render(
      <FavoriteButton
        entry={mediaEntry({
          mediaId: undefined,
          systemId: undefined,
          tags: [{ type: "user", tag: "favorite" }],
        })}
        fallbackSystemId="SNES"
        deviceKey="device-a"
      />,
    );
    await user.click(
      screen.getByRole("button", { name: "library.removeFavorite" }),
    );

    expect(updateSpy).toHaveBeenCalledWith({
      system: "SNES",
      path: "/roms/SNES/Favorite Game.sfc",
      remove: ["user:favorite"],
    });
    expect(
      await screen.findByRole("button", { name: "library.addFavorite" }),
    ).toBeInTheDocument();
  });

  it("should roll back optimistic state after an update error", async () => {
    vi.spyOn(CoreAPI, "mediaTagsUpdate").mockRejectedValue(
      new Error("update failed"),
    );
    const user = userEvent.setup();

    render(
      <FavoriteButton
        entry={mediaEntry()}
        fallbackSystemId="SNES"
        deviceKey="device-a"
      />,
    );
    await user.click(
      screen.getByRole("button", { name: "library.addFavorite" }),
    );

    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "library.addFavorite" }),
      ).toHaveAttribute("aria-pressed", "false"),
    );
    expect(mockErrorToast).toHaveBeenCalledWith("library.favoriteError");
  });

  it("should explain without reporting when Core has not indexed the media", async () => {
    const send = vi.fn();
    CoreAPI.setWsInstance({ isConnected: true, send });
    const loggerError = vi.spyOn(logger, "error");
    const user = userEvent.setup();

    render(
      <FavoriteButton
        entry={mediaEntry({
          mediaId: undefined,
          systemId: "PC",
          path: "steam://rungameid/620",
        })}
        fallbackSystemId="PC"
        deviceKey="device-a"
      />,
    );
    await user.click(
      screen.getByRole("button", { name: "library.addFavorite" }),
    );
    await waitFor(() => expect(send).toHaveBeenCalled());
    const request = JSON.parse(send.mock.calls[0]![0] as string);
    expect(request).toMatchObject({
      method: "media.tags.update",
      params: { system: "PC", path: "steam://rungameid/620" },
    });
    await CoreAPI.processReceived({
      data: JSON.stringify({
        jsonrpc: "2.0",
        id: request.id,
        error: { code: 1, message: "system not found: PC" },
      }),
    } as MessageEvent);

    await waitFor(() =>
      expect(mockErrorToast).toHaveBeenCalledWith("library.favoriteNotIndexed"),
    );
    expect(
      screen.getByRole("button", { name: "library.addFavorite" }),
    ).toHaveAttribute("aria-pressed", "false");
    expect(mockErrorToast).not.toHaveBeenCalledWith("library.favoriteError");
    expect(loggerError).not.toHaveBeenCalled();
  });

  it("should render a compact accessible toggle when requested", () => {
    render(
      <FavoriteButton
        entry={mediaEntry()}
        fallbackSystemId="SNES"
        deviceKey="device-a"
        iconOnly
      />,
    );

    const button = screen.getByRole("button", {
      name: "library.addFavorite",
    });
    expect(button).toHaveAccessibleName("library.addFavorite");
    expect(button).not.toHaveTextContent("library.addFavorite");
    expect(button).toHaveAttribute("aria-pressed", "false");
  });

  it("should keep a stable visible label with a state-specific accessible name", async () => {
    vi.spyOn(CoreAPI, "mediaTagsUpdate").mockResolvedValue({
      tags: [{ type: "user", tag: "favorite" }],
    });
    const user = userEvent.setup();

    render(
      <FavoriteButton
        entry={mediaEntry()}
        fallbackSystemId="SNES"
        deviceKey="device-a"
        displayLabel="library.favorite"
      />,
    );

    const button = screen.getByRole("button", {
      name: "library.addFavorite",
    });
    expect(button).toHaveTextContent("library.favorite");
    expect(button).toHaveAttribute("aria-pressed", "false");

    await user.click(button);

    const favoritedButton = await screen.findByRole("button", {
      name: "library.removeFavorite",
    });
    expect(favoritedButton).toHaveTextContent("library.favorite");
    expect(favoritedButton).toHaveAttribute("aria-pressed", "true");
  });

  it("should keep favorite controls disabled on unsupported Core", () => {
    useStatusStore.setState({ coreVersion: "2.14.9" });

    render(
      <FavoriteButton
        entry={mediaEntry()}
        fallbackSystemId="SNES"
        deviceKey="device-a"
      />,
    );

    expect(
      screen.getByRole("button", { name: "library.addFavorite" }),
    ).toBeDisabled();
  });
});
