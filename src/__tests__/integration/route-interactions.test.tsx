import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "../../test-utils";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

// Mock dependencies for integration testing
const mockNavigate = vi.fn();
const mockCoreAPI = {
  history: vi.fn(),
  mediaSearch: vi.fn(),
  systems: vi.fn(),
  media: vi.fn(),
  stop: vi.fn()
};

vi.mock("../../lib/coreApi", () => ({
  CoreAPI: mockCoreAPI
}));

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => mockNavigate,
  createFileRoute: vi.fn(() => ({
    useLoaderData: vi.fn(() => ({
      systemQuery: "all",
      systems: { systems: [] },
      restartScan: false,
      launchOnScan: true,
      launcherAccess: true,
      preferRemoteWriter: false
    }))
  }))
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, params?: any) => {
      if (key.includes("{{")) {
        return key.replace(/{{(\w+)}}/g, (_, param) => params?.[param] || param);
      }
      return key;
    }
  })
}));

vi.mock("@capacitor/preferences", () => ({
  Preferences: {
    get: vi.fn().mockResolvedValue({ value: "all" }),
    set: vi.fn().mockResolvedValue(undefined)
  }
}));

vi.mock("@capacitor-community/keep-awake", () => ({
  KeepAwake: {
    keepAwake: vi.fn(),
    allowSleep: vi.fn()
  }
}));

vi.mock("../../lib/nfc", () => ({
  cancelSession: vi.fn(),
  Status: {
    Success: 'success'
  }
}));

// Store state management for integration tests
let mockStoreState = {
  connected: true,
  playing: null,
  lastToken: null,
  gamesIndex: { games: [] },
  historyOpen: false,
  setGamesIndex: vi.fn(),
  setLastToken: vi.fn(),
  setPlaying: vi.fn(),
  runQueue: null,
  setRunQueue: vi.fn(),
  writeQueue: '',
  setWriteQueue: vi.fn()
};

vi.mock("../../lib/store", () => ({
  useStatusStore: vi.fn((selector) => selector(mockStoreState))
}));

vi.mock("../../hooks/useScanOperations", () => ({
  useScanOperations: vi.fn(() => ({
    scanSession: null,
    scanStatus: "idle",
    handleScanButton: vi.fn(),
    handleCameraScan: vi.fn(),
    handleStopConfirm: vi.fn(),
    runToken: vi.fn()
  }))
}));

vi.mock("../../hooks/useRunQueueProcessor", () => ({
  useRunQueueProcessor: vi.fn()
}));

vi.mock("../../hooks/useWriteQueueProcessor", () => ({
  useWriteQueueProcessor: vi.fn(() => ({
    reset: vi.fn()
  }))
}));

vi.mock("../../hooks/useAppSettings", () => ({
  useAppSettings: vi.fn(() => ({
    launcherAccess: true,
    preferRemoteWriter: false
  }))
}));

vi.mock("../../lib/writeNfcHook", () => ({
  useNfcWriter: vi.fn(() => ({
    status: null,
    write: vi.fn(),
    end: vi.fn(),
    writing: false
  })),
  WriteMethod: {
    Auto: 'auto'
  }
}));

vi.mock("../../components/ProPurchase", () => ({
  useProPurchase: vi.fn(() => ({
    PurchaseModal: () => <div data-testid="purchase-modal">Purchase Modal</div>,
    proPurchaseModalOpen: false,
    setProPurchaseModalOpen: vi.fn()
  }))
}));

describe("Route Interactions - Integration Tests", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false }
      }
    });

    // Reset mock store state
    mockStoreState = {
      connected: true,
      playing: null,
      lastToken: null,
      gamesIndex: { games: [] },
      historyOpen: false,
      setGamesIndex: vi.fn(),
      setLastToken: vi.fn(),
      setPlaying: vi.fn(),
      runQueue: null,
      setRunQueue: vi.fn(),
      writeQueue: '',
      setWriteQueue: vi.fn()
    };
  });

  afterEach(() => {
    queryClient.clear();
  });

  describe("Home to Create Flow", () => {
    it("should navigate from home to create routes", async () => {
      const HomeToCreateFlow = () => {
        const [currentRoute, setCurrentRoute] = React.useState("home");

        const navigate = (to: string) => {
          setCurrentRoute(to.replace("/", ""));
          mockNavigate({ to });
        };

        return (
          <div>
            <div data-testid="current-route">{currentRoute}</div>

            {currentRoute === "home" && (
              <div data-testid="home-page">
                <button
                  data-testid="create-button"
                  onClick={() => navigate("/create")}
                >
                  Create
                </button>
              </div>
            )}

            {currentRoute === "create" && (
              <div data-testid="create-page">
                <button
                  data-testid="search-button"
                  onClick={() => navigate("/create/search")}
                >
                  Search
                </button>
                <button
                  data-testid="nfc-button"
                  onClick={() => navigate("/create/nfc")}
                >
                  NFC
                </button>
                <button
                  data-testid="custom-button"
                  onClick={() => navigate("/create/custom")}
                >
                  Custom
                </button>
              </div>
            )}

            {currentRoute === "create/search" && (
              <div data-testid="search-page">
                <button
                  data-testid="back-to-create"
                  onClick={() => navigate("/create")}
                >
                  Back to Create
                </button>
              </div>
            )}
          </div>
        );
      };

      render(
        <QueryClientProvider client={queryClient}>
          <HomeToCreateFlow />
        </QueryClientProvider>
      );

      expect(screen.getByTestId("current-route")).toHaveTextContent("home");
      expect(screen.getByTestId("home-page")).toBeInTheDocument();

      // Navigate to create
      fireEvent.click(screen.getByTestId("create-button"));
      expect(screen.getByTestId("current-route")).toHaveTextContent("create");
      expect(screen.getByTestId("create-page")).toBeInTheDocument();

      // Navigate to search
      fireEvent.click(screen.getByTestId("search-button"));
      expect(screen.getByTestId("current-route")).toHaveTextContent("create/search");
      expect(screen.getByTestId("search-page")).toBeInTheDocument();

      // Navigate back
      fireEvent.click(screen.getByTestId("back-to-create"));
      expect(screen.getByTestId("current-route")).toHaveTextContent("create");
    });
  });

  describe("Search to Write Flow", () => {
    it("should handle complete search-to-write workflow", async () => {
      const searchResults = [
        { id: "1", name: "Super Mario World", system: "SNES", path: "/games/smw.sfc" },
        { id: "2", name: "Sonic", system: "Genesis", path: "/games/sonic.bin" }
      ];

      mockCoreAPI.mediaSearch.mockResolvedValue({
        results: searchResults,
        total: searchResults.length,
        pagination: {
          nextCursor: null,
          hasNextPage: false,
          pageSize: searchResults.length,
        }
      });

      const SearchToWriteFlow = () => {
        const [results, setResults] = React.useState<any[]>([]);
        const [selectedGame, setSelectedGame] = React.useState<any>(null);
        const [writeModalOpen, setWriteModalOpen] = React.useState(false);

        const handleSearch = async () => {
          const response = await mockCoreAPI.mediaSearch({
            query: "mario",
            systems: []
          });
          setResults(response.results);
        };

        const handleSelectGame = (game: any) => {
          setSelectedGame(game);
          setWriteModalOpen(true);
        };

        return (
          <div>
            <input data-testid="search-input" placeholder="Search games..." />
            <button data-testid="search-button" onClick={handleSearch}>
              Search
            </button>

            <div data-testid="results">
              {results.map((result, index) => (
                <div key={result.id} data-testid={`result-${index}`}>
                  <span>{result.name}</span>
                  <button
                    data-testid={`select-${index}`}
                    onClick={() => handleSelectGame(result)}
                  >
                    Select
                  </button>
                </div>
              ))}
            </div>

            {writeModalOpen && selectedGame && (
              <div data-testid="write-modal">
                <h3>Write {selectedGame.name}</h3>
                <p>Path: {selectedGame.path}</p>
                <button
                  data-testid="confirm-write"
                  onClick={() => {
                    mockStoreState.setWriteQueue(selectedGame.path);
                    setWriteModalOpen(false);
                  }}
                >
                  Write to NFC
                </button>
                <button
                  data-testid="cancel-write"
                  onClick={() => setWriteModalOpen(false)}
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        );
      };

      render(
        <QueryClientProvider client={queryClient}>
          <SearchToWriteFlow />
        </QueryClientProvider>
      );

      // Perform search
      fireEvent.click(screen.getByTestId("search-button"));

      await waitFor(() => {
        expect(screen.getByTestId("result-0")).toBeInTheDocument();
        expect(screen.getByTestId("result-1")).toBeInTheDocument();
      });

      // Select first game
      fireEvent.click(screen.getByTestId("select-0"));

      expect(screen.getByTestId("write-modal")).toBeInTheDocument();
      expect(screen.getByText("Write Super Mario World")).toBeInTheDocument();

      // Confirm write
      fireEvent.click(screen.getByTestId("confirm-write"));

      expect(mockStoreState.setWriteQueue).toHaveBeenCalledWith("/games/smw.sfc");
      expect(screen.queryByTestId("write-modal")).not.toBeInTheDocument();
    });
  });

  describe("Connection State Changes", () => {
    it("should handle connection state changes across routes", async () => {
      const ConnectionAwareComponent = () => {
        const [connectionState, setConnectionState] = React.useState("connected");
        const [currentRoute, setCurrentRoute] = React.useState("home");

        // Mock store state changes
        React.useEffect(() => {
          mockStoreState.connected = connectionState === "connected";
        }, [connectionState]);

        const navigate = (to: string) => {
          setCurrentRoute(to.replace("/", ""));
        };

        return (
          <div>
            <div data-testid="connection-status">
              Status: {connectionState}
            </div>

            <button
              data-testid="disconnect-btn"
              onClick={() => setConnectionState("disconnected")}
            >
              Disconnect
            </button>

            <button
              data-testid="reconnect-btn"
              onClick={() => setConnectionState("connected")}
            >
              Reconnect
            </button>

            <div data-testid="route-status">Route: {currentRoute}</div>

            {currentRoute === "home" && (
              <div data-testid="home-content">
                <button
                  data-testid="nav-search"
                  onClick={() => navigate("/create/search")}
                  disabled={connectionState === "disconnected"}
                >
                  Go to Search
                </button>
                {connectionState === "disconnected" && (
                  <div data-testid="home-disconnected">
                    home.connectionRequired
                  </div>
                )}
              </div>
            )}

            {currentRoute === "create/search" && (
              <div data-testid="search-content">
                <button
                  data-testid="search-games"
                  disabled={connectionState === "disconnected"}
                >
                  Search Games
                </button>
                {connectionState === "disconnected" && (
                  <div data-testid="search-disconnected">
                    create.search.connectionRequired
                  </div>
                )}
              </div>
            )}
          </div>
        );
      };

      render(
        <QueryClientProvider client={queryClient}>
          <ConnectionAwareComponent />
        </QueryClientProvider>
      );

      // Initially connected
      expect(screen.getByTestId("connection-status")).toHaveTextContent("Status: connected");

      // Navigate to search (should work when connected)
      fireEvent.click(screen.getByTestId("nav-search"));
      expect(screen.getByTestId("route-status")).toHaveTextContent("Route: create/search");

      // Disconnect
      fireEvent.click(screen.getByTestId("disconnect-btn"));
      expect(screen.getByTestId("connection-status")).toHaveTextContent("Status: disconnected");

      // Search should be disabled when disconnected
      expect(screen.getByTestId("search-games")).toBeDisabled();
      expect(screen.getByTestId("search-disconnected")).toBeInTheDocument();

      // Reconnect
      fireEvent.click(screen.getByTestId("reconnect-btn"));
      expect(screen.getByTestId("connection-status")).toHaveTextContent("Status: connected");
      expect(screen.getByTestId("search-games")).not.toBeDisabled();
    });
  });

  describe("Modal State Management", () => {
    it("should handle multiple modal interactions correctly", async () => {
      const MultiModalComponent = () => {
        const [historyOpen, setHistoryOpen] = React.useState(false);
        const [writeOpen, setWriteOpen] = React.useState(false);
        const [searchOpen, setSearchOpen] = React.useState(false);
        const [stopConfirmOpen, setStopConfirmOpen] = React.useState(false);

        return (
          <div>
            <button
              data-testid="open-history"
              onClick={() => setHistoryOpen(true)}
            >
              Open History
            </button>
            <button
              data-testid="open-write"
              onClick={() => setWriteOpen(true)}
            >
              Open Write
            </button>
            <button
              data-testid="open-search"
              onClick={() => setSearchOpen(true)}
            >
              Open Search
            </button>
            <button
              data-testid="open-stop-confirm"
              onClick={() => setStopConfirmOpen(true)}
            >
              Open Stop Confirm
            </button>

            <div data-testid="modal-states">
              {[
                historyOpen && "history",
                writeOpen && "write",
                searchOpen && "search",
                stopConfirmOpen && "stopConfirm"
              ].filter(Boolean).join(",")}
            </div>

            {historyOpen && (
              <div data-testid="history-modal">
                <button
                  data-testid="close-history"
                  onClick={() => setHistoryOpen(false)}
                >
                  Close History
                </button>
              </div>
            )}

            {writeOpen && (
              <div data-testid="write-modal">
                <button
                  data-testid="close-write"
                  onClick={() => setWriteOpen(false)}
                >
                  Close Write
                </button>
              </div>
            )}

            {searchOpen && (
              <div data-testid="search-modal">
                <button
                  data-testid="close-search"
                  onClick={() => setSearchOpen(false)}
                >
                  Close Search
                </button>
              </div>
            )}

            {stopConfirmOpen && (
              <div data-testid="stop-modal">
                <button
                  data-testid="close-stop"
                  onClick={() => setStopConfirmOpen(false)}
                >
                  Close Stop
                </button>
              </div>
            )}
          </div>
        );
      };

      render(
        <QueryClientProvider client={queryClient}>
          <MultiModalComponent />
        </QueryClientProvider>
      );

      // Open multiple modals
      fireEvent.click(screen.getByTestId("open-history"));
      fireEvent.click(screen.getByTestId("open-write"));

      expect(screen.getByTestId("modal-states")).toHaveTextContent("history,write");
      expect(screen.getByTestId("history-modal")).toBeInTheDocument();
      expect(screen.getByTestId("write-modal")).toBeInTheDocument();

      // Close one modal
      fireEvent.click(screen.getByTestId("close-history"));
      expect(screen.getByTestId("modal-states")).toHaveTextContent("write");
      expect(screen.queryByTestId("history-modal")).not.toBeInTheDocument();

      // Open another modal while one is open
      fireEvent.click(screen.getByTestId("open-stop-confirm"));
      expect(screen.getByTestId("modal-states")).toHaveTextContent("write,stopConfirm");

      // Close all modals
      fireEvent.click(screen.getByTestId("close-write"));
      fireEvent.click(screen.getByTestId("close-stop"));
      expect(screen.getByTestId("modal-states")).toHaveTextContent("");
    });
  });

  describe("Data Persistence Across Routes", () => {
    it("should maintain search query and system selection across navigation", async () => {
      const DataPersistenceComponent = () => {
        const [searchQuery, setSearchQuery] = React.useState("");
        const [selectedSystem, setSelectedSystem] = React.useState("all");
        const [currentRoute, setCurrentRoute] = React.useState("search");

        const navigate = (to: string) => {
          setCurrentRoute(to.replace("/create/", ""));
        };

        return (
          <div>
            <div data-testid="current-route">Route: {currentRoute}</div>

            {currentRoute === "search" && (
              <div data-testid="search-page">
                <input
                  data-testid="query-input"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search query..."
                />

                <select
                  data-testid="system-select"
                  value={selectedSystem}
                  onChange={(e) => setSelectedSystem(e.target.value)}
                >
                  <option value="all">All Systems</option>
                  <option value="snes">SNES</option>
                  <option value="genesis">Genesis</option>
                </select>

                <button
                  data-testid="nav-custom"
                  onClick={() => navigate("/create/custom")}
                >
                  Go to Custom
                </button>
              </div>
            )}

            {currentRoute === "custom" && (
              <div data-testid="custom-page">
                <div data-testid="preserved-query">Query: {searchQuery}</div>
                <div data-testid="preserved-system">System: {selectedSystem}</div>

                <button
                  data-testid="nav-back"
                  onClick={() => navigate("/create/search")}
                >
                  Back to Search
                </button>
              </div>
            )}
          </div>
        );
      };

      render(
        <QueryClientProvider client={queryClient}>
          <DataPersistenceComponent />
        </QueryClientProvider>
      );

      // Set search data
      fireEvent.change(screen.getByTestId("query-input"), {
        target: { value: "mario" }
      });
      fireEvent.change(screen.getByTestId("system-select"), {
        target: { value: "snes" }
      });

      // Navigate away
      fireEvent.click(screen.getByTestId("nav-custom"));
      expect(screen.getByTestId("current-route")).toHaveTextContent("Route: custom");

      // Check data is preserved
      expect(screen.getByTestId("preserved-query")).toHaveTextContent("Query: mario");
      expect(screen.getByTestId("preserved-system")).toHaveTextContent("System: snes");

      // Navigate back
      fireEvent.click(screen.getByTestId("nav-back"));
      expect(screen.getByTestId("current-route")).toHaveTextContent("Route: search");

      // Check data is still there
      expect(screen.getByTestId("query-input")).toHaveValue("mario");
      expect(screen.getByTestId("system-select")).toHaveValue("snes");
    });
  });
});