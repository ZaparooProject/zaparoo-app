import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@/test-utils";
import { CoreAPI } from "@/lib/coreApi";
import { useStatusStore } from "@/lib/store";
import { LibraryHistoryCollection } from "@/components/library/LibraryHistoryCollection";
import { seedActiveDevice } from "@/test-utils/deviceRegistry";

vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@tanstack/react-router")>();
  return {
    ...actual,
    createFileRoute: () => (options: unknown) => options,
    useNavigate: () => vi.fn(),
  };
});

vi.mock("@tanstack/react-virtual", () => ({
  useVirtualizer: ({ count }: { count: number }) => ({
    getVirtualItems: () =>
      Array.from({ length: count }, (_, index) => ({
        key: index,
        index,
        size: 104,
        start: index * 104,
      })),
    getTotalSize: () => count * 104,
    measureElement: vi.fn(),
    measure: vi.fn(),
    scrollToIndex: vi.fn(),
  }),
}));

vi.mock("@/hooks/usePageHeadingFocus", () => ({
  usePageHeadingFocus: () => undefined,
}));
vi.mock("@/hooks/useBackButtonHandler", () => ({
  useBackButtonHandler: vi.fn(),
}));
vi.mock("@/hooks/useSmartSwipe", () => ({ useSmartSwipe: () => ({}) }));
vi.mock("@/lib/libraryImages", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/libraryImages")>();
  return {
    ...actual,
    requestLibraryImage: vi.fn().mockResolvedValue(null),
  };
});

const historyEntry = (name: string, startedAt: string) => ({
  systemId: "SNES",
  systemName: "Super Nintendo",
  mediaName: name,
  mediaPath: `/roms/SNES/${name}.sfc`,
  startedAt,
  playTime: 60,
});

describe("LibraryHistoryCollection", () => {
  beforeEach(async () => {
    vi.restoreAllMocks();
    CoreAPI.reset();
    await seedActiveDevice({ recordId: "device-a" });
    useStatusStore.setState({
      connected: true,
      coreVersion: "2.17.0",
      coreVersionPending: false,
      gamesIndex: { exists: true, indexing: false },
    });
    vi.spyOn(CoreAPI, "systems").mockResolvedValue({
      systems: [{ id: "SNES", name: "Super Nintendo" }],
    });
  });

  it("lists recently played media once per game", async () => {
    vi.spyOn(CoreAPI, "mediaHistory").mockResolvedValue({
      entries: [
        historyEntry("Chrono Trigger", "2026-09-01T10:00:00Z"),
        historyEntry("Chrono Trigger", "2026-08-30T10:00:00Z"),
        historyEntry("EarthBound", "2026-08-29T10:00:00Z"),
      ],
    });

    render(<LibraryHistoryCollection kind="recent" />);

    expect(
      await screen.findByRole("button", { name: /Chrono Trigger/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /EarthBound/ }),
    ).toBeInTheDocument();
    expect(
      screen.getAllByRole("button", { name: /Chrono Trigger/ }),
    ).toHaveLength(1);
    expect(
      screen.getAllByText(new Date("2026-09-01T10:00:00Z").toLocaleString()),
    ).toHaveLength(1);
    expect(CoreAPI.mediaHistory).toHaveBeenCalledWith(
      expect.objectContaining({ distinctMedia: true }),
      expect.anything(),
    );
  });

  it("lists top played media in Core's order", async () => {
    vi.spyOn(CoreAPI, "mediaHistoryTop").mockResolvedValue({
      entries: [
        {
          systemId: "SNES",
          systemName: "Super Nintendo",
          mediaName: "Super Metroid",
          mediaPath: "/roms/SNES/Super Metroid.sfc",
          lastPlayedAt: "2026-09-01T10:00:00Z",
          totalPlayTime: 7200,
          sessionCount: 4,
        },
        {
          systemId: "SNES",
          systemName: "Super Nintendo",
          mediaName: "F-Zero",
          mediaPath: "/roms/SNES/F-Zero.sfc",
          lastPlayedAt: "2026-08-01T10:00:00Z",
          totalPlayTime: 600,
          sessionCount: 1,
        },
      ],
    });

    render(<LibraryHistoryCollection kind="top" />);

    const first = await screen.findByRole("button", { name: /Super Metroid/ });
    const second = screen.getByRole("button", { name: /F-Zero/ });
    expect(
      first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(CoreAPI.mediaHistoryTop).toHaveBeenCalled();
    expect(screen.getByText("2h")).toBeInTheDocument();
    expect(screen.getByText("10m")).toBeInTheDocument();
  });

  it("shows an empty state when nothing has been played", async () => {
    vi.spyOn(CoreAPI, "mediaHistoryTop").mockResolvedValue({ entries: [] });

    render(<LibraryHistoryCollection kind="top" />);

    expect(await screen.findByText("library.noTopPlayed")).toBeInTheDocument();
  });

  it("offers an update instead of querying on older Core", () => {
    useStatusStore.setState({ coreVersion: "2.11.0" });
    const spy = vi.spyOn(CoreAPI, "mediaHistory");

    render(<LibraryHistoryCollection kind="recent" />);

    expect(screen.getByText("library.updateCore")).toBeInTheDocument();
    expect(spy).not.toHaveBeenCalled();
  });
});
