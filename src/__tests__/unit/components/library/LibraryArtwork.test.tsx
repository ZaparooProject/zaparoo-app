import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, waitFor } from "@/test-utils";
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
        targetDeviceAddress="device-a"
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
        targetDeviceAddress="device-a"
        maxSize={320}
        priority="thumbnail"
        onAvailabilityChange={onAvailabilityChange}
      />,
    );

    await waitFor(
      () => expect(onAvailabilityChange).toHaveBeenCalledWith(true),
      { timeout: 3000 },
    );
    expect(requestLibraryImage).toHaveBeenCalledTimes(2);
  });
});
