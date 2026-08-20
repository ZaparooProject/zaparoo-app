import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, waitFor } from "@/test-utils";
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
