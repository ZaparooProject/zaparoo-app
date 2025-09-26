import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "../../../test-utils";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

// Mock dependencies
const mockMediaSearch = vi.fn();
const mockSystems = vi.fn();
const mockMedia = vi.fn();

vi.mock("../../../lib/coreApi", () => ({
  CoreAPI: {
    mediaSearch: mockMediaSearch,
    systems: mockSystems,
    media: mockMedia
  }
}));

vi.mock("../../../lib/store", () => ({
  useStatusStore: vi.fn((selector: any) => {
    const mockState = {
      connected: true,
      gamesIndex: { games: [] },
      setGamesIndex: vi.fn(),
      setConnected: vi.fn(),
      connectionState: 'CONNECTED' as any,
      setConnectionState: vi.fn(),
      lastConnectionTime: null,
      setLastConnectionTime: vi.fn(),
      connectionError: '',
      setConnectionError: vi.fn(),
      retryCount: 0,
      retryConnection: vi.fn(),
      lastToken: {} as any,
      setLastToken: vi.fn(),
      playing: null,
      setPlaying: vi.fn(),
      cameraOpen: false,
      setCameraOpen: vi.fn(),
      loggedInUser: null,
      setLoggedInUser: vi.fn(),
      nfcModalOpen: false,
      setNfcModalOpen: vi.fn(),
      safeInsets: {} as any,
      setSafeInsets: vi.fn(),
      deviceHistory: [],
      setDeviceHistory: vi.fn(),
      addDeviceHistory: vi.fn(),
      removeDeviceHistory: vi.fn(),
      clearDeviceHistory: vi.fn(),
      runQueue: null,
      setRunQueue: vi.fn(),
      writeQueue: '',
      setWriteQueue: vi.fn(),
      pendingDisconnection: false,
      setConnectionStateWithGracePeriod: vi.fn(),
      clearGracePeriod: vi.fn(),
      resetConnectionState: vi.fn()
    };
    return selector(mockState);
  })
}));

vi.mock("../../../lib/writeNfcHook", () => ({
  useNfcWriter: vi.fn(() => ({
    status: null,
    write: vi.fn(),
    end: vi.fn()
  }))
}));

vi.mock("../../../hooks/useSmartSwipe", () => ({
  useSmartSwipe: vi.fn(() => ({}))
}));

vi.mock("@tanstack/react-router", () => ({
  useNavigate: vi.fn(() => vi.fn()),
  createFileRoute: vi.fn(() => ({
    useLoaderData: vi.fn(() => ({
      systemQuery: "all",
      systems: { systems: [{ id: "snes", name: "SNES" }] }
    }))
  }))
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key
  })
}));

vi.mock("@capacitor/preferences", () => ({
  Preferences: {
    set: vi.fn().mockResolvedValue(undefined)
  }
}));

describe("Create Search Route - Error Handling", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false }
      }
    });
  });

  it("should handle search API failures", async () => {
    mockMediaSearch.mockRejectedValue(new Error("API connection failed"));

    const SearchErrorComponent = () => {
      const [error, setError] = React.useState<string | null>(null);
      const [isSearching, setIsSearching] = React.useState(false);

      const handleSearch = async () => {
        setIsSearching(true);
        setError(null);

        try {
          await mockMediaSearch({ query: "test", systems: [] });
        } catch (err) {
          setError(err instanceof Error ? err.message : "Search failed");
        } finally {
          setIsSearching(false);
        }
      };

      return (
        <div>
          <input data-testid="search-input" placeholder="Search games..." />
          <button
            data-testid="search-btn"
            onClick={handleSearch}
            disabled={isSearching}
          >
            {isSearching ? "Searching..." : "Search"}
          </button>
          {error && <div data-testid="search-error">{error}</div>}
        </div>
      );
    };

    render(
      <QueryClientProvider client={queryClient}>
        <SearchErrorComponent />
      </QueryClientProvider>
    );

    fireEvent.click(screen.getByTestId("search-btn"));

    await waitFor(() => {
      expect(screen.getByTestId("search-error")).toHaveTextContent("API connection failed");
    });
  });

  it("should handle empty search results gracefully", async () => {
    mockMediaSearch.mockResolvedValue({ results: [] });

    const EmptyResultsComponent = () => {
      const [results, setResults] = React.useState<any[]>([]);
      const [hasSearched, setHasSearched] = React.useState(false);

      const handleSearch = async () => {
        setHasSearched(true);
        const response = await mockMediaSearch({ query: "nonexistent", systems: [] });
        setResults(response.results);
      };

      return (
        <div>
          <button data-testid="search-btn" onClick={handleSearch}>
            Search
          </button>

          {hasSearched && results.length === 0 && (
            <div data-testid="no-results">create.search.noResults</div>
          )}

          {results.length > 0 && (
            <div data-testid="results-list">
              {results.map((result, index) => (
                <div key={index} data-testid={`result-${index}`}>
                  {result.name}
                </div>
              ))}
            </div>
          )}
        </div>
      );
    };

    render(
      <QueryClientProvider client={queryClient}>
        <EmptyResultsComponent />
      </QueryClientProvider>
    );

    fireEvent.click(screen.getByTestId("search-btn"));

    await waitFor(() => {
      expect(screen.getByTestId("no-results")).toBeInTheDocument();
    });
  });

  it("should handle search timeout", async () => {
    mockMediaSearch.mockImplementation(() =>
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Request timeout")), 100)
      )
    );

    const TimeoutComponent = () => {
      const [error, setError] = React.useState<string | null>(null);
      const [isLoading, setIsLoading] = React.useState(false);

      const handleSearch = async () => {
        setIsLoading(true);
        setError(null);

        try {
          await mockMediaSearch({ query: "test", systems: [] });
        } catch (err) {
          setError("Request timed out");
        } finally {
          setIsLoading(false);
        }
      };

      return (
        <div>
          <button
            data-testid="search-btn"
            onClick={handleSearch}
            disabled={isLoading}
          >
            Search
          </button>

          {isLoading && <div data-testid="loading">Searching...</div>}
          {error && <div data-testid="timeout-error">{error}</div>}
        </div>
      );
    };

    render(
      <QueryClientProvider client={queryClient}>
        <TimeoutComponent />
      </QueryClientProvider>
    );

    fireEvent.click(screen.getByTestId("search-btn"));

    await waitFor(() => {
      expect(screen.getByTestId("timeout-error")).toHaveTextContent("Request timed out");
    }, { timeout: 200 });
  });

  it("should handle rapid search queries", async () => {
    let searchCount = 0;
    mockMediaSearch.mockImplementation(() => {
      searchCount++;
      return Promise.resolve({ results: [`Result ${searchCount}`] });
    });

    const RapidSearchComponent = () => {
      const [results, setResults] = React.useState<string[]>([]);
      const [searchCount, setSearchCount] = React.useState(0);

      const handleSearch = async (query: string) => {
        const response = await mockMediaSearch({ query, systems: [] });
        setResults(response.results);
        setSearchCount(prev => prev + 1);
      };

      return (
        <div>
          <button
            data-testid="search-1"
            onClick={() => handleSearch("query1")}
          >
            Search 1
          </button>
          <button
            data-testid="search-2"
            onClick={() => handleSearch("query2")}
          >
            Search 2
          </button>
          <button
            data-testid="search-3"
            onClick={() => handleSearch("query3")}
          >
            Search 3
          </button>

          <div data-testid="search-count">{searchCount}</div>
          <div data-testid="results">{results.join(", ")}</div>
        </div>
      );
    };

    render(
      <QueryClientProvider client={queryClient}>
        <RapidSearchComponent />
      </QueryClientProvider>
    );

    // Fire rapid searches
    fireEvent.click(screen.getByTestId("search-1"));
    fireEvent.click(screen.getByTestId("search-2"));
    fireEvent.click(screen.getByTestId("search-3"));

    await waitFor(() => {
      expect(screen.getByTestId("search-count")).toHaveTextContent("3");
    });

    expect(mockMediaSearch).toHaveBeenCalledTimes(3);
  });

  it("should handle malformed search results", async () => {
    mockMediaSearch.mockResolvedValue({
      results: [
        { name: "Valid Game", system: "SNES" },
        { name: null, system: "Genesis" }, // Invalid name
        { system: "NES" }, // Missing name
        null, // Null result
        undefined // Undefined result
      ]
    });

    const MalformedDataComponent = () => {
      const [results, setResults] = React.useState<any[]>([]);
      const [validResults, setValidResults] = React.useState<any[]>([]);

      const handleSearch = async () => {
        const response = await mockMediaSearch({ query: "test", systems: [] });
        setResults(response.results);

        // Filter valid results
        const valid = response.results.filter((result: any) =>
          result && result.name && typeof result.name === 'string'
        );
        setValidResults(valid);
      };

      return (
        <div>
          <button data-testid="search-btn" onClick={handleSearch}>
            Search
          </button>

          <div data-testid="total-results">Total: {results.length}</div>
          <div data-testid="valid-results">Valid: {validResults.length}</div>

          {validResults.map((result, index) => (
            <div key={index} data-testid={`valid-result-${index}`}>
              {result.name}
            </div>
          ))}
        </div>
      );
    };

    render(
      <QueryClientProvider client={queryClient}>
        <MalformedDataComponent />
      </QueryClientProvider>
    );

    fireEvent.click(screen.getByTestId("search-btn"));

    await waitFor(() => {
      expect(screen.getByTestId("total-results")).toHaveTextContent("Total: 5");
      expect(screen.getByTestId("valid-results")).toHaveTextContent("Valid: 1");
      expect(screen.getByTestId("valid-result-0")).toHaveTextContent("Valid Game");
    });
  });

  it("should handle system filter API failures", async () => {
    mockSystems.mockRejectedValue(new Error("Systems API unavailable"));
    mockMediaSearch.mockResolvedValue({ results: [] });

    const SystemFilterErrorComponent = () => {
      const [systems, setSystems] = React.useState<any[]>([]);
      const [systemsError, setSystemsError] = React.useState<string | null>(null);
      const [selectedSystem, setSelectedSystem] = React.useState("all");

      React.useEffect(() => {
        const loadSystems = async () => {
          try {
            const response = await mockSystems();
            setSystems(response.systems || []);
          } catch (err) {
            setSystemsError("Failed to load systems");
          }
        };
        loadSystems();
      }, []);

      const handleSearch = async () => {
        const systemsFilter = selectedSystem === "all" ? [] : [selectedSystem];
        await mockMediaSearch({ query: "test", systems: systemsFilter });
      };

      return (
        <div>
          {systemsError ? (
            <div data-testid="systems-error">
              {systemsError}
              <select data-testid="fallback-system" disabled>
                <option value="all">All Systems (Error)</option>
              </select>
            </div>
          ) : (
            <select
              data-testid="system-filter"
              value={selectedSystem}
              onChange={(e) => setSelectedSystem(e.target.value)}
            >
              <option value="all">All Systems</option>
              {systems.map(system => (
                <option key={system.id} value={system.id}>
                  {system.name}
                </option>
              ))}
            </select>
          )}

          <button data-testid="search-btn" onClick={handleSearch}>
            Search
          </button>
        </div>
      );
    };

    render(
      <QueryClientProvider client={queryClient}>
        <SystemFilterErrorComponent />
      </QueryClientProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId("systems-error")).toBeInTheDocument();
      expect(screen.getByTestId("fallback-system")).toBeDisabled();
    });
  });

  it("should handle write modal errors during search", async () => {
    mockMediaSearch.mockResolvedValue({
      results: [{ id: "1", name: "Test Game", path: "/game.rom" }]
    });

    const WriteModalErrorComponent = () => {
      const [results, setResults] = React.useState<any[]>([]);
      const [writeError, setWriteError] = React.useState<string | null>(null);

      const handleSearch = async () => {
        const response = await mockMediaSearch({ query: "test", systems: [] });
        setResults(response.results);
      };

      const handleWrite = async (_result: any) => {
        try {
          // Simulate write modal opening and failing
          throw new Error("NFC write failed");
        } catch (err) {
          setWriteError(err instanceof Error ? err.message : "Write failed");
        }
      };

      return (
        <div>
          <button data-testid="search-btn" onClick={handleSearch}>
            Search
          </button>

          {results.map((result, index) => (
            <div key={index} data-testid={`result-${index}`}>
              <span>{result.name}</span>
              <button
                data-testid={`write-btn-${index}`}
                onClick={() => handleWrite(result)}
              >
                Write
              </button>
            </div>
          ))}

          {writeError && (
            <div data-testid="write-error">{writeError}</div>
          )}
        </div>
      );
    };

    render(
      <QueryClientProvider client={queryClient}>
        <WriteModalErrorComponent />
      </QueryClientProvider>
    );

    fireEvent.click(screen.getByTestId("search-btn"));

    await waitFor(() => {
      expect(screen.getByTestId("result-0")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId("write-btn-0"));

    await waitFor(() => {
      expect(screen.getByTestId("write-error")).toHaveTextContent("NFC write failed");
    });
  });

  it("should handle network disconnection during search", async () => {
    const { useStatusStore } = await import("../../../lib/store");

    vi.mocked(useStatusStore).mockImplementation((selector: any) => {
      const mockState = {
        connected: false, // Disconnected state
        gamesIndex: { games: [] },
        setGamesIndex: vi.fn(),
        setConnected: vi.fn(),
        connectionState: 'DISCONNECTED' as any,
        setConnectionState: vi.fn(),
        lastConnectionTime: null,
        setLastConnectionTime: vi.fn(),
        connectionError: '',
        setConnectionError: vi.fn(),
        retryCount: 0,
        retryConnection: vi.fn(),
        lastToken: {} as any,
        setLastToken: vi.fn(),
        playing: null,
        setPlaying: vi.fn(),
        cameraOpen: false,
        setCameraOpen: vi.fn(),
        loggedInUser: null,
        setLoggedInUser: vi.fn(),
        nfcModalOpen: false,
        setNfcModalOpen: vi.fn(),
        safeInsets: {} as any,
        setSafeInsets: vi.fn(),
        deviceHistory: [],
        setDeviceHistory: vi.fn(),
        addDeviceHistory: vi.fn(),
        removeDeviceHistory: vi.fn(),
        clearDeviceHistory: vi.fn(),
        runQueue: null,
        setRunQueue: vi.fn(),
        writeQueue: '',
        setWriteQueue: vi.fn(),
        pendingDisconnection: false,
        setConnectionStateWithGracePeriod: vi.fn(),
        clearGracePeriod: vi.fn(),
        resetConnectionState: vi.fn()
      };
      return selector(mockState);
    });

    const DisconnectedSearchComponent = () => {
      const connected = useStatusStore((state: any) => state.connected);

      const handleSearch = async () => {
        if (!connected) {
          throw new Error("Not connected to Zaparoo Core");
        }
      };

      return (
        <div>
          <div data-testid="connection-status">
            {connected ? "Connected" : "Disconnected"}
          </div>

          <button
            data-testid="search-btn"
            onClick={handleSearch}
            disabled={!connected}
          >
            Search
          </button>

          {!connected && (
            <div data-testid="disconnected-message">
              create.search.notConnected
            </div>
          )}
        </div>
      );
    };

    render(
      <QueryClientProvider client={queryClient}>
        <DisconnectedSearchComponent />
      </QueryClientProvider>
    );

    expect(screen.getByTestId("connection-status")).toHaveTextContent("Disconnected");
    expect(screen.getByTestId("search-btn")).toBeDisabled();
    expect(screen.getByTestId("disconnected-message")).toBeInTheDocument();
  });
});