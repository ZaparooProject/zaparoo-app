import { beforeEach, describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { render, screen } from "@/test-utils";
import { CoreAPI } from "@/lib/coreApi";
import { useStatusStore } from "@/lib/store";
import { useLibrarySessionStore } from "@/lib/librarySessionStore";
import { LibraryGameSearch } from "@/components/library/LibraryGameSearch";
import { seedActiveDevice } from "@/test-utils/deviceRegistry";

const { mockNavigate, mockSearchOptions } = vi.hoisted(() => ({
  mockNavigate: vi.fn(),
  mockSearchOptions: vi.fn(),
}));

vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@tanstack/react-router")>();
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
  };
});

vi.mock("@tanstack/react-virtual", () => ({
  useVirtualizer: vi.fn(({ count }) => ({
    getVirtualItems: () =>
      Array.from({ length: count }, (_, index) => ({
        index,
        key: index,
        size: 93,
        start: index * 93,
      })),
    getTotalSize: () => count * 93,
    measureElement: vi.fn(),
    measure: vi.fn(),
  })),
}));

vi.mock("@/hooks/useVirtualInfiniteSearch", () => ({
  useVirtualInfiniteSearch: (options: unknown) => {
    mockSearchOptions(options);
    return {
      allItems: [
        {
          system: { id: "NES", name: "Nintendo Entertainment System" },
          name: "Super Mario Bros.",
          path: "/games/nes/Super Mario Bros.nes",
          tags: [],
        },
      ],
      totalCount: 1,
      isLoading: false,
      isFetchingNextPage: false,
      hasNextPage: false,
      isError: false,
      fetchNextPage: vi.fn(),
      refetch: vi.fn(),
    };
  },
}));

vi.mock("@/components/SystemSelector", () => ({
  SystemSelectorTrigger: ({
    selectedSystems,
    onClick,
  }: {
    selectedSystems: string[];
    onClick: () => void;
  }) => (
    <button onClick={onClick} aria-label="system filter">
      {selectedSystems[0] ?? "all"}
    </button>
  ),
  SystemSelector: ({
    isOpen,
    onSelect,
  }: {
    isOpen: boolean;
    onSelect: (systems: string[]) => void;
  }) =>
    isOpen ? (
      <div role="dialog" aria-label="system selector">
        <button onClick={() => onSelect([])}>select all systems</button>
      </div>
    ) : null,
}));

vi.mock("@/components/TagSelector", () => ({
  TagSelectorTrigger: ({
    selectedTags,
    onClick,
  }: {
    selectedTags: string[];
    onClick: () => void;
  }) => (
    <button onClick={onClick} aria-label="tag filter">
      {selectedTags.join(", ") || "all"}
    </button>
  ),
  TagSelector: ({
    isOpen,
    onClose,
    onSelect,
  }: {
    isOpen: boolean;
    onClose: () => void;
    onSelect: (tags: string[]) => void;
  }) =>
    isOpen ? (
      <div role="dialog" aria-label="tag selector">
        <button
          onClick={() => {
            onSelect(["genre:Action"]);
            onClose();
          }}
        >
          select action
        </button>
      </div>
    ) : null,
}));

vi.mock("@/hooks/usePageHeadingFocus", () => ({
  usePageHeadingFocus: () => undefined,
}));

vi.mock("@/hooks/useHaptics", () => ({
  useHaptics: () => ({ impact: vi.fn() }),
}));

describe("Library game search", () => {
  beforeEach(async () => {
    vi.restoreAllMocks();
    CoreAPI.reset();
    mockNavigate.mockClear();
    mockSearchOptions.mockClear();
    useLibrarySessionStore.getState().reset();
    await seedActiveDevice({ recordId: "device-a" });
    useStatusStore.setState({
      connected: true,
      coreVersion: "2.15.0",
      coreVersionPending: false,
      gamesIndex: { exists: true, indexing: false },
    });
    vi.spyOn(CoreAPI, "systems").mockResolvedValue({
      systems: [{ id: "SNES", name: "Super Nintendo" }],
    });
    vi.spyOn(CoreAPI, "mediaMeta").mockResolvedValue({
      media: {
        path: "/games/nes/Super Mario Bros.nes",
        parentDir: "/games/nes",
        isMissing: false,
        tags: [],
        properties: {},
        title: {
          slug: "super-mario-bros",
          name: "Super Mario Bros.",
          slugLength: 16,
          slugWordCount: 3,
          system: { id: "NES", name: "Nintendo Entertainment System" },
          tags: [],
          properties: {},
        },
      },
    });
    vi.spyOn(CoreAPI, "mediaImage").mockResolvedValue({
      contentType: "image/png",
      data: "aGVsbG8=",
      typeTag: "property:image",
    });
  });

  it("should show search results in the main page content", async () => {
    const user = userEvent.setup();
    render(<LibraryGameSearch />);

    expect(
      screen.getByRole("heading", { name: "library.searchTitle" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("dialog", { name: "library.searchTitle" }),
    ).not.toBeInTheDocument();

    await user.type(
      screen.getByRole("searchbox", { name: "library.searchInput" }),
      "Mario",
    );
    await user.click(
      screen.getByRole("button", { name: "library.searchAction" }),
    );

    expect(
      await screen.findByRole("button", { name: /Super Mario Bros\./ }),
    ).toBeInTheDocument();
  });

  it("should default to the current system and support tag filters", async () => {
    const user = userEvent.setup();
    render(<LibraryGameSearch initialSystemId="SNES" />);

    expect(
      screen.getByRole("button", { name: "system filter" }),
    ).toHaveTextContent("SNES");
    await user.click(screen.getByRole("button", { name: "tag filter" }));
    await user.click(screen.getByRole("button", { name: "select action" }));
    await user.click(
      screen.getByRole("button", { name: "library.searchAction" }),
    );

    expect(mockSearchOptions).toHaveBeenLastCalledWith(
      expect.objectContaining({
        query: "",
        systems: ["SNES"],
        tags: ["genre:Action"],
        enabled: true,
      }),
    );
  });

  it("should keep fixed favorites scope out of editable and saved tags", async () => {
    const user = userEvent.setup();
    render(
      <LibraryGameSearch
        fixedTags={["user:favorite"]}
        sessionScope="favorites"
      />,
    );

    expect(
      screen.getByRole("button", { name: "tag filter" }),
    ).toHaveTextContent("all");
    await user.click(
      screen.getByRole("button", { name: "library.searchAction" }),
    );

    expect(mockSearchOptions).toHaveBeenLastCalledWith(
      expect.objectContaining({
        query: "",
        systems: [],
        tags: ["user:favorite"],
        enabled: true,
      }),
    );
    expect(useLibrarySessionStore.getState().searches.favorites?.tags).toEqual(
      [],
    );
  });

  it("should restore the last submitted contextual search", () => {
    const session = useLibrarySessionStore.getState();
    session.activateDevice("device-a");
    session.setSearch("SNES", {
      query: "Zelda",
      system: "SNES",
      tags: ["genre:Action"],
    });

    render(<LibraryGameSearch initialSystemId="SNES" />);

    expect(
      screen.getByRole("searchbox", { name: "library.searchInput" }),
    ).toHaveValue("Zelda");
    expect(
      screen.getByRole("button", { name: "tag filter" }),
    ).toHaveTextContent("genre:Action");
    expect(mockSearchOptions).toHaveBeenLastCalledWith(
      expect.objectContaining({
        query: "Zelda",
        systems: ["SNES"],
        tags: ["genre:Action"],
        enabled: true,
      }),
    );
  });

  it("should let users widen a contextual search to all systems", async () => {
    const user = userEvent.setup();
    render(<LibraryGameSearch initialSystemId="SNES" />);

    await user.click(screen.getByRole("button", { name: "system filter" }));
    await user.click(
      screen.getByRole("button", { name: "select all systems" }),
    );

    expect(
      screen.getByRole("button", { name: "system filter" }),
    ).toHaveTextContent("all");
  });

  it("should open Library launch details for a selected result", async () => {
    const user = userEvent.setup();
    render(<LibraryGameSearch />);
    await user.type(
      screen.getByRole("searchbox", { name: "library.searchInput" }),
      "Mario",
    );
    await user.click(
      screen.getByRole("button", { name: "library.searchAction" }),
    );
    await user.click(
      await screen.findByRole("button", { name: /Super Mario Bros\./ }),
    );

    expect(
      await screen.findByRole("dialog", { name: "Super Mario Bros." }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "library.launch" }),
    ).toBeInTheDocument();
  });

  it("should use a contextual back action when provided", async () => {
    const user = userEvent.setup();
    const onBack = vi.fn();
    render(<LibraryGameSearch initialSystemId="SNES" onBack={onBack} />);

    await user.click(screen.getByRole("button", { name: "nav.back" }));

    expect(onBack).toHaveBeenCalledOnce();
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it("should return to the Library system browser", async () => {
    const user = userEvent.setup();
    render(<LibraryGameSearch />);

    await user.click(screen.getByRole("button", { name: "nav.back" }));

    expect(mockNavigate).toHaveBeenCalledWith({
      to: "/library",
      resetScroll: false,
    });
  });
});
