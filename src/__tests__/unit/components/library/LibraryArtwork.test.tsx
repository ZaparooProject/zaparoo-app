import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render as renderWithWrapper } from "@testing-library/react";
import {
  act,
  createProvidersWithQueryClient,
  createTestQueryClient,
  render,
  screen,
  waitFor,
} from "@/test-utils";
import { LibraryArtwork } from "@/components/library/LibraryArtwork";
import { requestLibraryImage } from "@/lib/libraryImages";
import { CoreAPI } from "@/lib/coreApi";

vi.mock("@/lib/libraryImages", () => ({
  requestLibraryImage: vi.fn(),
}));

describe("LibraryArtwork", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    CoreAPI.reset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should use a delayed spinner for detail artwork loading", () => {
    vi.useFakeTimers();
    vi.mocked(requestLibraryImage).mockReturnValue(new Promise(() => {}));

    const { container } = render(
      <LibraryArtwork
        entry={{
          mediaId: 42,
          name: "Super Game",
          path: "/roms/SNES/Super Game.sfc",
          type: "media",
          systemId: "SNES",
        }}
        systemId="SNES"
        deviceKey="device-a"
        maxSize={512}
        priority="detail"
      />,
    );

    expect(container.querySelector("svg")).not.toBeInTheDocument();

    act(() => vi.advanceTimersByTime(300));

    expect(container.querySelector("svg")).toBeInTheDocument();
  });

  it("keeps an in-flight image request and loaded artwork when loading-only sizing changes", async () => {
    type ImageResult = Awaited<ReturnType<typeof requestLibraryImage>>;
    let resolveImage!: (value: ImageResult) => void;
    vi.mocked(requestLibraryImage).mockReturnValue(
      new Promise<ImageResult>((resolve) => {
        resolveImage = resolve;
      }),
    );
    const wrapper = createProvidersWithQueryClient(createTestQueryClient());
    const props = {
      entry: {
        mediaId: 42,
        name: "Super Game",
        path: "/roms/SNES/Super Game.sfc",
        type: "media" as const,
        systemId: "SNES",
      },
      systemId: "SNES",
      deviceKey: "device-a",
      maxSize: 512,
      priority: "detail" as const,
      alt: "Super Game artwork",
      onAvailabilityChange: vi.fn(),
      onTypeTag: vi.fn(),
    };
    const { rerender } = renderWithWrapper(
      <LibraryArtwork {...props} loadingClassName="mx-auto" />,
      { wrapper },
    );
    const signal = vi.mocked(requestLibraryImage).mock.calls[0]?.[2]?.signal;
    expect(signal).toBeInstanceOf(AbortSignal);
    rerender(
      <LibraryArtwork
        {...props}
        loadingClassName="mx-auto max-w-[21.333rem]"
      />,
    );
    expect(requestLibraryImage).toHaveBeenCalledTimes(1);
    expect(signal?.aborted).toBe(false);
    expect(
      screen.queryByRole("img", { name: "Super Game artwork" }),
    ).not.toBeInTheDocument();
    await act(async () =>
      resolveImage({
        url: "data:image/png;base64,AAAA",
        typeTag: "property:image-boxart",
      }),
    );
    const image = await screen.findByRole("img", {
      name: "Super Game artwork",
    });
    expect(image).toHaveAttribute("src", "data:image/png;base64,AAAA");
    expect(props.onAvailabilityChange).toHaveBeenCalledWith(true);
    expect(props.onTypeTag).toHaveBeenCalledWith("property:image-boxart");
    rerender(<LibraryArtwork {...props} loadingClassName="mx-auto" />);
    expect(screen.getByRole("img", { name: "Super Game artwork" })).toBe(image);
    expect(requestLibraryImage).toHaveBeenCalledTimes(1);
  });

  it("should retain a skeleton for thumbnail artwork loading", () => {
    vi.useFakeTimers();
    vi.mocked(requestLibraryImage).mockReturnValue(new Promise(() => {}));

    const { container } = render(
      <LibraryArtwork
        entry={{
          mediaId: 42,
          name: "Super Game",
          path: "/roms/SNES/Super Game.sfc",
          type: "media",
          systemId: "SNES",
        }}
        systemId="SNES"
        deviceKey="device-a"
        maxSize={320}
        priority="thumbnail"
      />,
    );

    act(() => vi.advanceTimersByTime(300));

    expect(container.querySelector("span > div")).toBeInTheDocument();
    expect(container.querySelector("svg")).not.toBeInTheDocument();
  });

  it("uses the supplied media-type placeholder when artwork is unavailable", () => {
    render(
      <LibraryArtwork
        entry={{ name: "Game", path: "/game.sfc", type: "media" }}
        systemId="SNES"
        deviceKey=""
        maxSize={192}
        priority="detail"
        placeholderIcon={<span>Game placeholder</span>}
      />,
    );

    expect(screen.getByText("Game placeholder")).toBeVisible();
    expect(requestLibraryImage).not.toHaveBeenCalled();
  });

  it("should report unavailable artwork when the image request fails", async () => {
    vi.mocked(requestLibraryImage).mockRejectedValue(new Error("unavailable"));
    const onAvailabilityChange = vi.fn();

    render(
      <LibraryArtwork
        entry={{
          mediaId: 42,
          name: "Super Game",
          path: "/roms/SNES/Super Game.sfc",
          type: "media",
          systemId: "SNES",
        }}
        systemId="SNES"
        deviceKey="device-a"
        maxSize={320}
        priority="thumbnail"
        onAvailabilityChange={onAvailabilityChange}
      />,
    );

    await waitFor(() =>
      expect(onAvailabilityChange).toHaveBeenCalledWith(false),
    );
    expect(requestLibraryImage).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["SNES", "lucide-gamepad-2"],
    ["Movie", "lucide-film"],
    ["TVEpisode", "lucide-tv"],
    ["MusicTrack", "lucide-music-2"],
  ])(
    "should show a media-specific placeholder for %s",
    (systemId, iconClass) => {
      const { container } = render(
        <LibraryArtwork
          entry={{
            name: "Missing artwork",
            path: "/media/missing",
            type: "media",
            systemId,
            hasCover: false,
          }}
          systemId={systemId}
          deviceKey="device-a"
          maxSize={320}
          priority="thumbnail"
        />,
      );

      expect(container.querySelector(`.${iconClass}`)).toBeInTheDocument();
      expect(requestLibraryImage).not.toHaveBeenCalled();
    },
  );

  it("should retry one transient connection failure", async () => {
    vi.mocked(requestLibraryImage)
      .mockRejectedValueOnce(new Error("Request timeout"))
      .mockResolvedValueOnce({
        url: "data:image/webp;base64,AAAA",
        typeTag: "property:image-boxart",
      });
    const onAvailabilityChange = vi.fn();

    render(
      <LibraryArtwork
        entry={{
          mediaId: 42,
          name: "Super Game",
          path: "/roms/SNES/Super Game.sfc",
          type: "media",
          systemId: "SNES",
        }}
        systemId="SNES"
        deviceKey="device-a"
        maxSize={320}
        priority="thumbnail"
        onAvailabilityChange={onAvailabilityChange}
      />,
    );

    await waitFor(() =>
      expect(onAvailabilityChange).toHaveBeenCalledWith(true),
    );
    expect(requestLibraryImage).toHaveBeenCalledTimes(2);
  });
});
