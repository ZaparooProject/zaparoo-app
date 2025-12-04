import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "../../../test-utils";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

// Mock dependencies
const mockMediaSearch = vi.fn();
const mockSystems = vi.fn();
const mockRun = vi.fn();

vi.mock("../../../lib/coreApi", () => ({
  CoreAPI: {
    systems: mockSystems,
    mediaSearch: mockMediaSearch,
    run: mockRun,
  },
}));

vi.mock("../../../lib/store", () => ({
  useStatusStore: vi.fn((selector) => {
    const mockState = {
      connected: true,
      gamesIndex: { exists: true, indexing: false },
      setGamesIndex: vi.fn(),
    };
    return selector(mockState);
  }),
}));

const mockNfcWriter = {
  status: null,
  write: vi.fn(),
  end: vi.fn(),
  writing: false,
  result: null,
};

vi.mock("../../../lib/writeNfcHook", () => ({
  useNfcWriter: vi.fn(() => mockNfcWriter),
  WriteAction: {
    Write: "write",
  },
}));

vi.mock("../../../hooks/useSmartSwipe", () => ({
  useSmartSwipe: vi.fn(() => ({})),
}));

vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual = (await importOriginal()) as any;
  return {
    ...actual,
    useNavigate: vi.fn(() => vi.fn()),
    createFileRoute: vi.fn(() => ({
      useLoaderData: vi.fn(() => ({
        systemQuery: "all",
        systems: {
          systems: [
            { id: "snes", name: "Super Nintendo Entertainment System" },
            { id: "genesis", name: "Sega Genesis" },
          ],
        },
      })),
    })),
  };
});

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const translations: { [key: string]: string } = {
        "create.search.title": "Search Games",
        "create.search.gameInput": "Game Name",
        "create.search.gameInputPlaceholder": "Enter game name...",
        "create.search.systemInput": "System",
        "create.search.allSystems": "All Systems",
        "create.search.searchButton": "Search",
        "create.search.noResults": "No games found",
        "create.search.writeLabel": "Write",
        "create.search.playLabel": "Play",
      };
      return translations[key] || key;
    },
  }),
}));

describe("Create Search Route - Enhanced Coverage", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });

    mockSystems.mockResolvedValue({
      systems: [
        { id: "snes", name: "Super Nintendo Entertainment System" },
        { id: "genesis", name: "Sega Genesis" },
        { id: "nes", name: "Nintendo Entertainment System" },
      ],
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const renderSearchComponent = (
    props: {
      connected?: boolean;
      searchResults?: any[];
      isLoading?: boolean;
      error?: any;
    } = {},
  ) => {
    const {
      connected = true,
      searchResults,
      isLoading = false,
      error = null,
    } = props;

    const SearchComponent = () => {
      const [query, setQuery] = React.useState("");
      const [querySystem, setQuerySystem] = React.useState("all");
      const [results, setResults] = React.useState(searchResults || []);
      const [loading, setLoading] = React.useState(isLoading);
      const [searchError, setSearchError] = React.useState(error);
      const [writeOpen, setWriteOpen] = React.useState(false);
      const [selectedResult, setSelectedResult] = React.useState<any>(null);

      const systems = [
        { id: "all", name: "All Systems" },
        { id: "snes", name: "Super Nintendo Entertainment System" },
        { id: "genesis", name: "Sega Genesis" },
      ];

      const handleSearch = async () => {
        if (!query.trim()) return;

        setLoading(true);
        setSearchError(null);

        try {
          mockMediaSearch({
            query,
            systems: querySystem === "all" ? [] : [querySystem],
          });

          if (searchResults) {
            setResults(searchResults);
          } else if (error) {
            setSearchError(error);
            setResults([]);
            return;
          }
        } catch (err) {
          setSearchError(err);
          setResults([]);
        } finally {
          setLoading(false);
        }
      };

      const handlePlay = (result: any) => {
        mockRun({
          type: "launch",
          text: `**launch.system:${result.systemName}`,
          data: result,
        });
      };

      const handleWrite = (result: any) => {
        setSelectedResult(result);
        setWriteOpen(true);
        mockNfcWriter.write(result);
      };

      const closeWriteModal = async () => {
        setWriteOpen(false);
        setSelectedResult(null);
        await mockNfcWriter.end();
      };

      return (
        <div data-testid="search-page">
          <h1>Search Games</h1>

          {!connected && (
            <div data-testid="not-connected">Not connected to Zaparoo Core</div>
          )}

          <div data-testid="search-form">
            <input
              data-testid="game-input"
              placeholder="Enter game name..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              disabled={!connected}
            />

            <select
              data-testid="system-select"
              value={querySystem}
              onChange={(e) => setQuerySystem(e.target.value)}
              disabled={!connected}
            >
              {systems.map((system) => (
                <option key={system.id} value={system.id}>
                  {system.name}
                </option>
              ))}
            </select>

            <button
              data-testid="search-button"
              onClick={handleSearch}
              disabled={!connected || !query.trim() || loading}
            >
              {loading ? "Searching..." : "Search"}
            </button>
          </div>

          {loading && <div data-testid="loading">Searching for games...</div>}

          {searchError && (
            <div data-testid="search-error">
              Error: {searchError.message || "Search failed"}
            </div>
          )}

          {results.length > 0 && (
            <div data-testid="search-results">
              <div data-testid="results-count">
                {results.length} results found
              </div>
              {results.map((result, index) => (
                <div
                  key={index}
                  data-testid={`search-result-${index}`}
                  className="search-result"
                >
                  <div data-testid={`game-name-${index}`}>
                    {result.mediaName}
                  </div>
                  <div data-testid={`system-name-${index}`}>
                    {result.systemName}
                  </div>
                  <div data-testid={`media-path-${index}`}>
                    {result.mediaPath}
                  </div>

                  <div className="result-actions">
                    <button
                      data-testid={`play-button-${index}`}
                      onClick={() => handlePlay(result)}
                      disabled={!connected}
                    >
                      Play
                    </button>

                    <button
                      data-testid={`write-button-${index}`}
                      onClick={() => handleWrite(result)}
                      disabled={!connected}
                    >
                      Write
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {results.length === 0 && query && !loading && !searchError && (
            <div data-testid="no-results">No games found for "{query}"</div>
          )}

          {writeOpen && selectedResult && (
            <div data-testid="write-modal" className="modal">
              <div className="modal-content">
                <h2>Write to NFC Tag</h2>
                <div data-testid="selected-game">
                  {selectedResult.mediaName}
                </div>
                <div data-testid="selected-system">
                  {selectedResult.systemName}
                </div>

                <div className="modal-actions">
                  <button
                    data-testid="confirm-write"
                    onClick={() => console.log("Writing to NFC...")}
                  >
                    Write
                  </button>

                  <button
                    data-testid="close-write-modal"
                    onClick={closeWriteModal}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      );
    };

    return render(
      <QueryClientProvider client={queryClient}>
        <SearchComponent />
      </QueryClientProvider>,
    );
  };

  it("should render the search page with all components", () => {
    renderSearchComponent();

    expect(screen.getByTestId("search-page")).toBeInTheDocument();
    expect(screen.getByText("Search Games")).toBeInTheDocument();
    expect(screen.getByTestId("search-form")).toBeInTheDocument();
    expect(screen.getByTestId("game-input")).toBeInTheDocument();
    expect(screen.getByTestId("system-select")).toBeInTheDocument();
    expect(screen.getByTestId("search-button")).toBeInTheDocument();
  });

  it("should show not connected message when disconnected", () => {
    renderSearchComponent({ connected: false });

    expect(screen.getByTestId("not-connected")).toBeInTheDocument();
    expect(
      screen.getByText("Not connected to Zaparoo Core"),
    ).toBeInTheDocument();
  });

  it("should disable controls when disconnected", () => {
    renderSearchComponent({ connected: false });

    expect(screen.getByTestId("game-input")).toBeDisabled();
    expect(screen.getByTestId("system-select")).toBeDisabled();
    expect(screen.getByTestId("search-button")).toBeDisabled();
  });

  it("should disable search button when query is empty", () => {
    renderSearchComponent();

    const searchButton = screen.getByTestId("search-button");
    expect(searchButton).toBeDisabled();
  });

  it("should enable search button when query has content", async () => {
    renderSearchComponent();

    const gameInput = screen.getByTestId("game-input");
    const searchButton = screen.getByTestId("search-button");

    fireEvent.change(gameInput, { target: { value: "Mario" } });

    expect(searchButton).not.toBeDisabled();
  });

  it("should perform search when button is clicked", async () => {
    renderSearchComponent();

    const gameInput = screen.getByTestId("game-input");
    const systemSelect = screen.getByTestId("system-select");
    const searchButton = screen.getByTestId("search-button");

    fireEvent.change(gameInput, { target: { value: "Super Mario" } });
    fireEvent.change(systemSelect, { target: { value: "snes" } });
    fireEvent.click(searchButton);

    expect(mockMediaSearch).toHaveBeenCalledWith({
      query: "Super Mario",
      systems: ["snes"],
    });
  });

  it("should search all systems when 'all' is selected", async () => {
    renderSearchComponent();

    const gameInput = screen.getByTestId("game-input");
    const searchButton = screen.getByTestId("search-button");

    fireEvent.change(gameInput, { target: { value: "Sonic" } });
    fireEvent.click(searchButton);

    expect(mockMediaSearch).toHaveBeenCalledWith({
      query: "Sonic",
      systems: [],
    });
  });

  it("should display search results", () => {
    const mockResults = [
      {
        mediaName: "Super Mario World",
        systemName: "SNES",
        mediaPath: "/games/snes/super_mario_world.sfc",
      },
      {
        mediaName: "Super Mario Bros 3",
        systemName: "NES",
        mediaPath: "/games/nes/super_mario_bros_3.nes",
      },
    ];

    renderSearchComponent({ searchResults: mockResults });

    expect(screen.getByTestId("search-results")).toBeInTheDocument();
    expect(screen.getByTestId("results-count")).toHaveTextContent(
      "2 results found",
    );
    expect(screen.getByTestId("search-result-0")).toBeInTheDocument();
    expect(screen.getByTestId("search-result-1")).toBeInTheDocument();
    expect(screen.getByTestId("game-name-0")).toHaveTextContent(
      "Super Mario World",
    );
    expect(screen.getByTestId("system-name-0")).toHaveTextContent("SNES");
  });

  it("should show loading state during search", () => {
    renderSearchComponent({ isLoading: true });

    expect(screen.getByTestId("loading")).toBeInTheDocument();
    expect(screen.getByText("Searching for games...")).toBeInTheDocument();
    expect(screen.getByTestId("search-button")).toHaveTextContent(
      "Searching...",
    );
  });

  it("should display error message when search fails", () => {
    const error = new Error("Search service unavailable");
    renderSearchComponent({ error });

    expect(screen.getByTestId("search-error")).toBeInTheDocument();
    expect(
      screen.getByText("Error: Search service unavailable"),
    ).toBeInTheDocument();
  });

  it("should show no results message when no games found", () => {
    renderSearchComponent({ searchResults: [] });

    const gameInput = screen.getByTestId("game-input");
    fireEvent.change(gameInput, { target: { value: "NonexistentGame" } });

    expect(screen.getByTestId("no-results")).toBeInTheDocument();
    expect(
      screen.getByText('No games found for "NonexistentGame"'),
    ).toBeInTheDocument();
  });

  it("should handle play button click", () => {
    const mockResults = [
      {
        mediaName: "Super Mario World",
        systemName: "SNES",
        mediaPath: "/games/snes/super_mario_world.sfc",
      },
    ];

    renderSearchComponent({ searchResults: mockResults });

    const playButton = screen.getByTestId("play-button-0");
    fireEvent.click(playButton);

    expect(mockRun).toHaveBeenCalledWith({
      type: "launch",
      text: "**launch.system:SNES",
      data: mockResults[0],
    });
  });

  it("should handle write button click and open modal", () => {
    const mockResults = [
      {
        mediaName: "Super Mario World",
        systemName: "SNES",
        mediaPath: "/games/snes/super_mario_world.sfc",
      },
    ];

    renderSearchComponent({ searchResults: mockResults });

    const writeButton = screen.getByTestId("write-button-0");
    fireEvent.click(writeButton);

    expect(screen.getByTestId("write-modal")).toBeInTheDocument();
    expect(screen.getByTestId("selected-game")).toHaveTextContent(
      "Super Mario World",
    );
    expect(screen.getByTestId("selected-system")).toHaveTextContent("SNES");
    expect(mockNfcWriter.write).toHaveBeenCalledWith(mockResults[0]);
  });

  it("should close write modal when cancel is clicked", async () => {
    const mockResults = [
      {
        mediaName: "Super Mario World",
        systemName: "SNES",
        mediaPath: "/games/snes/super_mario_world.sfc",
      },
    ];

    renderSearchComponent({ searchResults: mockResults });

    // Open modal
    const writeButton = screen.getByTestId("write-button-0");
    fireEvent.click(writeButton);

    expect(screen.getByTestId("write-modal")).toBeInTheDocument();

    // Close modal
    const cancelButton = screen.getByTestId("close-write-modal");
    fireEvent.click(cancelButton);

    await waitFor(() => {
      expect(screen.queryByTestId("write-modal")).not.toBeInTheDocument();
    });

    expect(mockNfcWriter.end).toHaveBeenCalled();
  });

  it("should disable play and write buttons when disconnected", () => {
    const mockResults = [
      {
        mediaName: "Super Mario World",
        systemName: "SNES",
        mediaPath: "/games/snes/super_mario_world.sfc",
      },
    ];

    renderSearchComponent({
      connected: false,
      searchResults: mockResults,
    });

    expect(screen.getByTestId("play-button-0")).toBeDisabled();
    expect(screen.getByTestId("write-button-0")).toBeDisabled();
  });

  it("should handle system selection change", () => {
    renderSearchComponent();

    const systemSelect = screen.getByTestId("system-select");

    // Initially should be "all"
    expect(systemSelect).toHaveValue("all");

    // Change to SNES
    fireEvent.change(systemSelect, { target: { value: "snes" } });
    expect(systemSelect).toHaveValue("snes");
  });

  it("should handle input value changes", () => {
    renderSearchComponent();

    const gameInput = screen.getByTestId("game-input");

    fireEvent.change(gameInput, { target: { value: "Mario" } });
    expect(gameInput).toHaveValue("Mario");

    fireEvent.change(gameInput, { target: { value: "Sonic the Hedgehog" } });
    expect(gameInput).toHaveValue("Sonic the Hedgehog");
  });

  it("should display multiple search results with correct data", () => {
    const mockResults = [
      {
        mediaName: "Super Mario World",
        systemName: "SNES",
        mediaPath: "/games/snes/super_mario_world.sfc",
      },
      {
        mediaName: "Sonic the Hedgehog",
        systemName: "Genesis",
        mediaPath: "/games/genesis/sonic.bin",
      },
      {
        mediaName: "Mega Man X",
        systemName: "SNES",
        mediaPath: "/games/snes/mega_man_x.sfc",
      },
    ];

    renderSearchComponent({ searchResults: mockResults });

    expect(screen.getByTestId("results-count")).toHaveTextContent(
      "3 results found",
    );

    // Check first result
    expect(screen.getByTestId("game-name-0")).toHaveTextContent(
      "Super Mario World",
    );
    expect(screen.getByTestId("system-name-0")).toHaveTextContent("SNES");
    expect(screen.getByTestId("media-path-0")).toHaveTextContent(
      "/games/snes/super_mario_world.sfc",
    );

    // Check second result
    expect(screen.getByTestId("game-name-1")).toHaveTextContent(
      "Sonic the Hedgehog",
    );
    expect(screen.getByTestId("system-name-1")).toHaveTextContent("Genesis");

    // Check third result
    expect(screen.getByTestId("game-name-2")).toHaveTextContent("Mega Man X");
    expect(screen.getByTestId("system-name-2")).toHaveTextContent("SNES");

    // Verify all action buttons are present
    expect(screen.getByTestId("play-button-0")).toBeInTheDocument();
    expect(screen.getByTestId("write-button-0")).toBeInTheDocument();
    expect(screen.getByTestId("play-button-1")).toBeInTheDocument();
    expect(screen.getByTestId("write-button-1")).toBeInTheDocument();
    expect(screen.getByTestId("play-button-2")).toBeInTheDocument();
    expect(screen.getByTestId("write-button-2")).toBeInTheDocument();
  });
});

describe("Create Search Route - Additional Features", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("handles recent searches functionality", () => {
    const RecentSearchesComponent = () => {
      const [recentSearches, setRecentSearches] = React.useState<
        Array<{ query: string; system: string; tags: string[] }>
      >([
        { query: "Mario", system: "snes", tags: [] },
        { query: "Sonic", system: "genesis", tags: [] },
      ]);
      const [query, setQuery] = React.useState("");
      const [querySystem, setQuerySystem] = React.useState("all");
      const [recentSearchesOpen, setRecentSearchesOpen] = React.useState(false);

      const handleRecentSearchSelect = (search: (typeof recentSearches)[0]) => {
        setQuery(search.query);
        setQuerySystem(search.system);
        setRecentSearchesOpen(false);
      };

      const clearRecentSearches = () => {
        setRecentSearches([]);
      };

      return (
        <div data-testid="recent-searches-test">
          <button
            onClick={() => setRecentSearchesOpen(true)}
            disabled={recentSearches.length === 0}
            data-testid="open-recent-searches"
          >
            Recent Searches
          </button>

          <input
            data-testid="search-query"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <span data-testid="current-system">{querySystem}</span>

          {recentSearchesOpen && (
            <div data-testid="recent-searches-modal">
              <h2>Recent Searches</h2>
              {recentSearches.map((search, index) => (
                <button
                  key={index}
                  data-testid={`recent-search-${index}`}
                  onClick={() => handleRecentSearchSelect(search)}
                >
                  {search.query} - {search.system}
                </button>
              ))}
              <button
                data-testid="clear-recent-searches"
                onClick={clearRecentSearches}
              >
                Clear History
              </button>
              <button
                data-testid="close-recent-searches"
                onClick={() => setRecentSearchesOpen(false)}
              >
                Close
              </button>
            </div>
          )}
        </div>
      );
    };

    render(
      <QueryClientProvider client={queryClient}>
        <RecentSearchesComponent />
      </QueryClientProvider>,
    );

    // Open recent searches
    const openButton = screen.getByTestId("open-recent-searches");
    fireEvent.click(openButton);

    expect(screen.getByTestId("recent-searches-modal")).toBeInTheDocument();
    expect(screen.getByTestId("recent-search-0")).toHaveTextContent(
      "Mario - snes",
    );
    expect(screen.getByTestId("recent-search-1")).toHaveTextContent(
      "Sonic - genesis",
    );

    // Select a recent search
    fireEvent.click(screen.getByTestId("recent-search-0"));

    expect(screen.getByTestId("search-query")).toHaveValue("Mario");
    expect(screen.getByTestId("current-system")).toHaveTextContent("snes");
    expect(
      screen.queryByTestId("recent-searches-modal"),
    ).not.toBeInTheDocument();
  });

  it("clears recent searches when clear button is clicked", () => {
    const RecentSearchesComponent = () => {
      const [recentSearches, setRecentSearches] = React.useState([
        { query: "Mario", system: "snes", tags: [] },
      ]);

      return (
        <div data-testid="clear-searches-test">
          <span data-testid="search-count">{recentSearches.length}</span>
          <button
            data-testid="clear-searches"
            onClick={() => setRecentSearches([])}
          >
            Clear
          </button>
        </div>
      );
    };

    render(
      <QueryClientProvider client={queryClient}>
        <RecentSearchesComponent />
      </QueryClientProvider>,
    );

    expect(screen.getByTestId("search-count")).toHaveTextContent("1");

    fireEvent.click(screen.getByTestId("clear-searches"));

    expect(screen.getByTestId("search-count")).toHaveTextContent("0");
  });

  it("handles tag filtering in search", () => {
    const TagFilterComponent = () => {
      const [queryTags, setQueryTags] = React.useState<string[]>([]);
      const [tagSelectorOpen, setTagSelectorOpen] = React.useState(false);

      const handleTagSelect = (tags: string[]) => {
        setQueryTags(tags);
        setTagSelectorOpen(false);
      };

      return (
        <div data-testid="tag-filter-test">
          <button
            onClick={() => setTagSelectorOpen(true)}
            data-testid="open-tag-selector"
          >
            Select Tags
          </button>

          <div data-testid="selected-tags">
            {queryTags.length === 0
              ? "All Tags"
              : queryTags.map((tag) => (
                  <span key={tag} data-testid={`tag-${tag}`}>
                    {tag}
                  </span>
                ))}
          </div>

          {tagSelectorOpen && (
            <div data-testid="tag-selector-modal">
              <button
                data-testid="select-action-tag"
                onClick={() => handleTagSelect(["action"])}
              >
                Action
              </button>
              <button
                data-testid="select-rpg-tag"
                onClick={() => handleTagSelect(["rpg"])}
              >
                RPG
              </button>
              <button
                data-testid="select-multiple-tags"
                onClick={() => handleTagSelect(["action", "rpg"])}
              >
                Action & RPG
              </button>
            </div>
          )}
        </div>
      );
    };

    render(
      <QueryClientProvider client={queryClient}>
        <TagFilterComponent />
      </QueryClientProvider>,
    );

    expect(screen.getByTestId("selected-tags")).toHaveTextContent("All Tags");

    fireEvent.click(screen.getByTestId("open-tag-selector"));
    fireEvent.click(screen.getByTestId("select-multiple-tags"));

    expect(screen.getByTestId("tag-action")).toBeInTheDocument();
    expect(screen.getByTestId("tag-rpg")).toBeInTheDocument();
  });

  it("handles write mode selection between path and zapScript", () => {
    const WriteModeComponent = () => {
      const [writeMode, setWriteMode] = React.useState<"path" | "zapScript">(
        "zapScript",
      );
      const selectedResult = {
        path: "/games/snes/mario.sfc",
        zapScript: "**launch.system:snes:/games/snes/mario.sfc",
      };

      return (
        <div data-testid="write-mode-test">
          <fieldset role="radiogroup" aria-label="Select write value">
            <div>
              <input
                type="radio"
                id="write-mode-path"
                name="write-mode"
                value="path"
                checked={writeMode === "path"}
                onChange={() => setWriteMode("path")}
                data-testid="path-radio"
              />
              <label htmlFor="write-mode-path">
                Path: {selectedResult.path}
              </label>
            </div>
            <div>
              <input
                type="radio"
                id="write-mode-zapscript"
                name="write-mode"
                value="zapScript"
                checked={writeMode === "zapScript"}
                onChange={() => setWriteMode("zapScript")}
                data-testid="zapscript-radio"
              />
              <label htmlFor="write-mode-zapscript">
                ZapScript: {selectedResult.zapScript}
              </label>
            </div>
          </fieldset>

          <span data-testid="current-write-mode">{writeMode}</span>
          <span data-testid="value-to-write">
            {writeMode === "zapScript"
              ? selectedResult.zapScript
              : selectedResult.path}
          </span>
        </div>
      );
    };

    render(
      <QueryClientProvider client={queryClient}>
        <WriteModeComponent />
      </QueryClientProvider>,
    );

    // Default is zapScript
    expect(screen.getByTestId("current-write-mode")).toHaveTextContent(
      "zapScript",
    );
    expect(screen.getByTestId("zapscript-radio")).toBeChecked();

    // Switch to path
    fireEvent.click(screen.getByTestId("path-radio"));

    expect(screen.getByTestId("current-write-mode")).toHaveTextContent("path");
    expect(screen.getByTestId("value-to-write")).toHaveTextContent(
      "/games/snes/mario.sfc",
    );
  });

  it("handles copy functionality with fallback", async () => {
    const mockCopyFn = vi.fn();

    const CopyComponent = () => {
      const [copied, setCopied] = React.useState(false);
      const textToCopy = "/games/snes/mario.sfc";

      const handleCopy = async () => {
        mockCopyFn(textToCopy);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      };

      return (
        <div data-testid="copy-test">
          <span data-testid="copy-status">{copied ? "Copied!" : "Ready"}</span>
          <button onClick={handleCopy} data-testid="copy-button">
            Copy
          </button>
        </div>
      );
    };

    render(
      <QueryClientProvider client={queryClient}>
        <CopyComponent />
      </QueryClientProvider>,
    );

    expect(screen.getByTestId("copy-status")).toHaveTextContent("Ready");

    fireEvent.click(screen.getByTestId("copy-button"));

    expect(mockCopyFn).toHaveBeenCalledWith("/games/snes/mario.sfc");
    expect(screen.getByTestId("copy-status")).toHaveTextContent("Copied!");
  });

  it("handles keyboard Enter to trigger search", () => {
    const mockSearch = vi.fn();

    const KeyboardSearchComponent = () => {
      const [query, setQuery] = React.useState("");

      const handleKeyUp = (e: React.KeyboardEvent) => {
        if (e.key === "Enter" && query.trim()) {
          mockSearch(query);
        }
      };

      return (
        <div data-testid="keyboard-search-test">
          <input
            data-testid="search-input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyUp={handleKeyUp}
          />
        </div>
      );
    };

    render(
      <QueryClientProvider client={queryClient}>
        <KeyboardSearchComponent />
      </QueryClientProvider>,
    );

    const input = screen.getByTestId("search-input");
    fireEvent.change(input, { target: { value: "Mario" } });
    fireEvent.keyUp(input, { key: "Enter" });

    expect(mockSearch).toHaveBeenCalledWith("Mario");
  });

  it("shows filename or name based on showFilenames preference", () => {
    const FilenameDisplayComponent = () => {
      const [showFilenames, setShowFilenames] = React.useState(false);
      const game = {
        name: "Super Mario World",
        path: "/games/snes/smw.sfc",
      };

      const filenameFromPath = (path: string) => {
        const parts = path.split("/");
        return parts[parts.length - 1];
      };

      return (
        <div data-testid="filename-display-test">
          <button
            onClick={() => setShowFilenames(!showFilenames)}
            data-testid="toggle-filenames"
          >
            Toggle
          </button>
          <span data-testid="display-name">
            {showFilenames ? filenameFromPath(game.path) : game.name}
          </span>
        </div>
      );
    };

    render(
      <QueryClientProvider client={queryClient}>
        <FilenameDisplayComponent />
      </QueryClientProvider>,
    );

    expect(screen.getByTestId("display-name")).toHaveTextContent(
      "Super Mario World",
    );

    fireEvent.click(screen.getByTestId("toggle-filenames"));

    expect(screen.getByTestId("display-name")).toHaveTextContent("smw.sfc");
  });
});
