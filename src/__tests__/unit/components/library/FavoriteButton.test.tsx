import { beforeEach, describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { render, screen, waitFor } from "@/test-utils";
import { FavoriteButton } from "@/components/library/FavoriteButton";
import { CoreAPI } from "@/lib/coreApi";
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
      targetDeviceAddress: "device-a",
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
        targetDeviceAddress="device-a"
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
        targetDeviceAddress="device-a"
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
        targetDeviceAddress="device-a"
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

  it("should render a compact accessible toggle when requested", () => {
    render(
      <FavoriteButton
        entry={mediaEntry()}
        fallbackSystemId="SNES"
        targetDeviceAddress="device-a"
        iconOnly
      />,
    );

    const button = screen.getByRole("button", {
      name: "library.addFavorite",
    });
    expect(button).toHaveClass("h-12", "w-12");
    expect(button).toHaveTextContent("");
    expect(button).toHaveAttribute("aria-pressed", "false");
  });

  it("should omit favorite controls on unsupported Core", () => {
    useStatusStore.setState({ coreVersion: "2.14.9" });

    render(
      <FavoriteButton
        entry={mediaEntry()}
        fallbackSystemId="SNES"
        targetDeviceAddress="device-a"
      />,
    );

    expect(
      screen.queryByRole("button", { name: "library.addFavorite" }),
    ).not.toBeInTheDocument();
  });
});
