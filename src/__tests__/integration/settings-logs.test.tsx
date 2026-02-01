/**
 * Integration Test: Settings Logs Page
 *
 * Tests the REAL Logs component from src/routes/settings.logs.tsx including:
 * - Log level filter toggles
 * - Search input filtering
 * - Entry count display
 * - Copy/share buttons
 * - Log entry rendering
 * - Disconnected state
 */

import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { render, screen, waitFor } from "../../test-utils";
import userEvent from "@testing-library/user-event";
import { useStatusStore, ConnectionState } from "@/lib/store";
import { usePreferencesStore } from "@/lib/preferencesStore";

// Mock the router
vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    useRouter: vi.fn(() => ({
      history: {
        back: vi.fn(),
      },
    })),
    createFileRoute: vi.fn(() => () => ({
      component: null,
    })),
  };
});

// Mock CoreAPI
vi.mock("@/lib/coreApi", () => ({
  CoreAPI: {
    settingsLogsDownload: vi.fn(),
  },
}));

// Mock state that can be modified per-test
const mockState = {
  queryData: null as {
    content: string;
    filename: string;
    size: number;
  } | null,
  isLoading: false,
  isError: false,
  refetch: vi.fn(),
};

vi.mock("@tanstack/react-query", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    useQuery: vi.fn(() => ({
      data: mockState.queryData,
      isLoading: mockState.isLoading,
      isError: mockState.isError,
      refetch: mockState.refetch,
    })),
  };
});

// Mock useSmartSwipe
vi.mock("@/hooks/useSmartSwipe", () => ({
  useSmartSwipe: vi.fn(() => ({})),
}));

// Mock useHaptics
vi.mock("@/hooks/useHaptics", () => ({
  useHaptics: vi.fn(() => ({
    impact: vi.fn(),
    notification: vi.fn(),
    vibrate: vi.fn(),
  })),
}));

// Mock usePageHeadingFocus
vi.mock("@/hooks/usePageHeadingFocus", () => ({
  usePageHeadingFocus: vi.fn(),
}));

// Track native platform state for testing - hoisted to be available in vi.mock
const { mockCapacitorState } = vi.hoisted(() => ({
  mockCapacitorState: {
    isNative: false,
  },
}));

// Mock Capacitor
vi.mock("@capacitor/core", () => ({
  Capacitor: {
    isNativePlatform: () => mockCapacitorState.isNative,
    getPlatform: () => (mockCapacitorState.isNative ? "ios" : "web"),
  },
}));

// Mock Capacitor Filesystem
const mockFilesystemWrite = vi.fn().mockResolvedValue(undefined);
const mockFilesystemGetUri = vi
  .fn()
  .mockResolvedValue({ uri: "file://cache/test.log" });
vi.mock("@capacitor/filesystem", () => ({
  Filesystem: {
    writeFile: (...args: unknown[]) => mockFilesystemWrite(...args),
    getUri: (...args: unknown[]) => mockFilesystemGetUri(...args),
  },
  Directory: { Cache: "CACHE" },
  Encoding: { UTF8: "utf8" },
}));

// Mock Capacitor Share
const mockShareShare = vi.fn().mockResolvedValue({ activityType: "share" });
vi.mock("@capacitor/share", () => ({
  Share: {
    share: (...args: unknown[]) => mockShareShare(...args),
  },
}));

// Mock clipboard (using configurable to allow userEvent to override)
if (!navigator.clipboard) {
  Object.defineProperty(navigator, "clipboard", {
    value: {
      writeText: vi.fn().mockResolvedValue(undefined),
    },
    writable: true,
    configurable: true,
  });
}

// Mock URL APIs
global.URL.createObjectURL = vi.fn(() => "mock-url");
global.URL.revokeObjectURL = vi.fn();

// Helper to create base64 encoded log content
function createMockLogContent(
  entries: Array<{
    level: string;
    time: string;
    message: string;
    [key: string]: unknown;
  }>,
) {
  const content = entries.map((e) => JSON.stringify(e)).join("\n");
  return btoa(content);
}

// Import the REAL component after mocks are set up
import { Logs } from "@/routes/settings.logs";

describe("Settings Logs Integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Reset stores to initial state
    useStatusStore.setState({
      ...useStatusStore.getInitialState(),
      connected: true,
      connectionState: ConnectionState.CONNECTED,
    });
    usePreferencesStore.setState({
      ...usePreferencesStore.getInitialState(),
      _hasHydrated: true,
      logLevelFilters: {
        debug: true,
        info: true,
        warn: true,
        error: true,
      },
    });

    // Reset mock query state
    mockState.queryData = null;
    mockState.isLoading = false;
    mockState.isError = false;

    // Reset Capacitor native state
    mockCapacitorState.isNative = false;

    // Reset Capacitor mocks
    mockFilesystemWrite.mockClear();
    mockFilesystemGetUri.mockClear();
    mockShareShare.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("Page Structure", () => {
    it("should render the logs page with header and title", () => {
      render(<Logs />);

      expect(
        screen.getByRole("heading", { name: /settings.logs.title/i }),
      ).toBeInTheDocument();
    });

    it("should render back button in header", () => {
      render(<Logs />);

      expect(
        screen.getByRole("button", { name: /nav.back/i }),
      ).toBeInTheDocument();
    });

    it("should render refresh button", () => {
      render(<Logs />);

      const refreshButton = screen.getByRole("button", {
        name: /settings.logs.refresh/i,
      });
      expect(refreshButton).toBeInTheDocument();
    });

    it("should render search input with placeholder", () => {
      render(<Logs />);

      const searchInput = screen.getByPlaceholderText(
        /settings.logs.searchPlaceholder/i,
      );
      expect(searchInput).toBeInTheDocument();
    });

    it("should render all level filter chips", () => {
      render(<Logs />);

      expect(
        screen.getByRole("button", { name: /debug/i }),
      ).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /info/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /warn/i })).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: /error/i }),
      ).toBeInTheDocument();
    });
  });

  describe("Connected/Disconnected States", () => {
    it("should show not connected message when disconnected", () => {
      useStatusStore.setState({ connected: false });

      render(<Logs />);

      expect(screen.getByText(/notConnected/i)).toBeInTheDocument();
    });

    it("should disable refresh button when disconnected", () => {
      useStatusStore.setState({ connected: false });

      render(<Logs />);

      const refreshButton = screen.getByRole("button", {
        name: /settings.logs.refresh/i,
      });
      expect(refreshButton).toBeDisabled();
    });

    it("should enable refresh button when connected", () => {
      render(<Logs />);

      const refreshButton = screen.getByRole("button", {
        name: /settings.logs.refresh/i,
      });
      expect(refreshButton).not.toBeDisabled();
    });
  });

  describe("Log Data Display", () => {
    it("should render log entries when data is available", () => {
      mockState.queryData = {
        filename: "test.log",
        content: createMockLogContent([
          {
            level: "info",
            time: "2025-01-15T10:30:00Z",
            message: "Test info message",
          },
          {
            level: "error",
            time: "2025-01-15T10:31:00Z",
            message: "Test error message",
          },
        ]),
        size: 100,
      };

      render(<Logs />);

      expect(screen.getByText(/Test info message/)).toBeInTheDocument();
      expect(screen.getByText(/Test error message/)).toBeInTheDocument();
    });

    it("should show entry count when data is available", () => {
      mockState.queryData = {
        filename: "test.log",
        content: createMockLogContent([
          { level: "info", time: "2025-01-15T10:30:00Z", message: "Message 1" },
          {
            level: "debug",
            time: "2025-01-15T10:31:00Z",
            message: "Message 2",
          },
          { level: "warn", time: "2025-01-15T10:32:00Z", message: "Message 3" },
        ]),
        size: 100,
      };

      render(<Logs />);

      expect(screen.getByText(/3 entries/)).toBeInTheDocument();
    });

    it("should show copy button when data is available", () => {
      mockState.queryData = {
        filename: "test.log",
        content: createMockLogContent([
          { level: "info", time: "2025-01-15T10:30:00Z", message: "Test" },
        ]),
        size: 50,
      };

      render(<Logs />);

      expect(
        screen.getByRole("button", { name: /settings.logs.copy/i }),
      ).toBeInTheDocument();
    });

    it("should show download button on web platform", () => {
      mockState.queryData = {
        filename: "test.log",
        content: createMockLogContent([
          { level: "info", time: "2025-01-15T10:30:00Z", message: "Test" },
        ]),
        size: 50,
      };

      render(<Logs />);

      expect(
        screen.getByRole("button", { name: /settings.logs.download/i }),
      ).toBeInTheDocument();
    });

    it("should show no entries found when connected but data has no matching entries", () => {
      mockState.queryData = {
        filename: "empty.log",
        content: "",
        size: 0,
      };

      render(<Logs />);

      expect(
        screen.getByText(/settings.logs.noEntriesFound/i),
      ).toBeInTheDocument();
    });
  });

  describe("Search Functionality", () => {
    it("should filter entries based on search term", async () => {
      const user = userEvent.setup();
      mockState.queryData = {
        filename: "test.log",
        content: createMockLogContent([
          {
            level: "info",
            time: "2025-01-15T10:30:00Z",
            message: "User logged in",
          },
          {
            level: "error",
            time: "2025-01-15T10:31:00Z",
            message: "Connection failed",
          },
          {
            level: "debug",
            time: "2025-01-15T10:32:00Z",
            message: "Debug trace",
          },
        ]),
        size: 150,
      };

      render(<Logs />);

      // Initially all entries visible
      expect(screen.getByText(/User logged in/)).toBeInTheDocument();
      expect(screen.getByText(/Connection failed/)).toBeInTheDocument();
      expect(screen.getByText(/Debug trace/)).toBeInTheDocument();

      // Type search term
      const searchInput = screen.getByPlaceholderText(
        /settings.logs.searchPlaceholder/i,
      );
      await user.type(searchInput, "Connection");

      // Only matching entry visible
      await waitFor(() => {
        expect(screen.queryByText(/User logged in/)).not.toBeInTheDocument();
        expect(screen.getByText(/Connection failed/)).toBeInTheDocument();
        expect(screen.queryByText(/Debug trace/)).not.toBeInTheDocument();
      });
    });

    it("should show filtered entry count when search term is active", async () => {
      const user = userEvent.setup();
      mockState.queryData = {
        filename: "test.log",
        content: createMockLogContent([
          { level: "info", time: "2025-01-15T10:30:00Z", message: "Message A" },
          { level: "info", time: "2025-01-15T10:31:00Z", message: "Message B" },
          { level: "info", time: "2025-01-15T10:32:00Z", message: "Different" },
        ]),
        size: 100,
      };

      render(<Logs />);

      const searchInput = screen.getByPlaceholderText(
        /settings.logs.searchPlaceholder/i,
      );
      await user.type(searchInput, "Message");

      await waitFor(() => {
        expect(screen.getByText(/Showing 2 of 3 entries/i)).toBeInTheDocument();
      });
    });
  });

  describe("Level Filter Functionality", () => {
    it("should toggle level filter state when clicked", async () => {
      const user = userEvent.setup();
      mockState.queryData = {
        filename: "test.log",
        content: createMockLogContent([
          {
            level: "debug",
            time: "2025-01-15T10:30:00Z",
            message: "Debug message",
          },
          {
            level: "info",
            time: "2025-01-15T10:31:00Z",
            message: "Info message",
          },
        ]),
        size: 100,
      };

      render(<Logs />);

      // Both entries initially visible
      expect(screen.getByText(/Debug message/)).toBeInTheDocument();
      expect(screen.getByText(/Info message/)).toBeInTheDocument();

      // Toggle off debug filter
      const debugButton = screen.getByRole("button", { name: /debug/i });
      await user.click(debugButton);

      // Debug entries should be filtered out
      await waitFor(() => {
        expect(usePreferencesStore.getState().logLevelFilters.debug).toBe(
          false,
        );
      });
    });

    it("should filter entries by level when filter is toggled off", async () => {
      const user = userEvent.setup();
      mockState.queryData = {
        filename: "test.log",
        content: createMockLogContent([
          {
            level: "debug",
            time: "2025-01-15T10:30:00Z",
            message: "Debug only message",
          },
          {
            level: "info",
            time: "2025-01-15T10:31:00Z",
            message: "Info only message",
          },
          {
            level: "error",
            time: "2025-01-15T10:32:00Z",
            message: "Error only message",
          },
        ]),
        size: 150,
      };

      render(<Logs />);

      // Toggle off debug filter
      const debugButton = screen.getByRole("button", { name: /debug/i });
      await user.click(debugButton);

      // Debug entry should be hidden, others visible
      await waitFor(() => {
        expect(
          screen.queryByText(/Debug only message/),
        ).not.toBeInTheDocument();
      });
      expect(screen.getByText(/Info only message/)).toBeInTheDocument();
      expect(screen.getByText(/Error only message/)).toBeInTheDocument();
    });

    it("should update entry count when filters are applied", async () => {
      const user = userEvent.setup();
      mockState.queryData = {
        filename: "test.log",
        content: createMockLogContent([
          { level: "debug", time: "2025-01-15T10:30:00Z", message: "Debug 1" },
          { level: "debug", time: "2025-01-15T10:31:00Z", message: "Debug 2" },
          { level: "info", time: "2025-01-15T10:32:00Z", message: "Info 1" },
          { level: "error", time: "2025-01-15T10:33:00Z", message: "Error 1" },
        ]),
        size: 200,
      };

      render(<Logs />);

      // Initially shows 4 entries
      expect(screen.getByText(/4 entries/)).toBeInTheDocument();

      // Toggle off debug
      const debugButton = screen.getByRole("button", { name: /debug/i });
      await user.click(debugButton);

      // Should show filtered count
      await waitFor(() => {
        expect(screen.getByText(/Showing 2 of 4 entries/i)).toBeInTheDocument();
      });
    });
  });

  describe("Copy Functionality", () => {
    it("should render copy button when data is available", () => {
      const logContent = [
        {
          level: "info",
          time: "2025-01-15T10:30:00Z",
          message: "Test message",
        },
      ];
      mockState.queryData = {
        filename: "test.log",
        content: createMockLogContent(logContent),
        size: 100,
      };

      render(<Logs />);

      // Verify copy button is present and clickable
      const copyButton = screen.getByRole("button", {
        name: /settings.logs.copy/i,
      });
      expect(copyButton).toBeInTheDocument();
      expect(copyButton).not.toBeDisabled();
    });
  });

  describe("Refresh Functionality", () => {
    it("should call refetch when refresh button is clicked", async () => {
      const user = userEvent.setup();

      render(<Logs />);

      const refreshButton = screen.getByRole("button", {
        name: /settings.logs.refresh/i,
      });
      await user.click(refreshButton);

      expect(mockState.refetch).toHaveBeenCalled();
    });
  });

  describe("Message Truncation", () => {
    it("should show 'show more' button for long messages", () => {
      const longMessage = "A".repeat(250);
      mockState.queryData = {
        filename: "test.log",
        content: createMockLogContent([
          { level: "info", time: "2025-01-15T10:30:00Z", message: longMessage },
        ]),
        size: 300,
      };

      render(<Logs />);

      expect(
        screen.getByRole("button", { name: /settings.logs.showMore/i }),
      ).toBeInTheDocument();
    });

    it("should expand message when show more is clicked", async () => {
      const user = userEvent.setup();
      const longMessage = "B".repeat(250);
      mockState.queryData = {
        filename: "test.log",
        content: createMockLogContent([
          { level: "info", time: "2025-01-15T10:30:00Z", message: longMessage },
        ]),
        size: 300,
      };

      render(<Logs />);

      const showMoreButton = screen.getByRole("button", {
        name: /settings.logs.showMore/i,
      });
      await user.click(showMoreButton);

      await waitFor(() => {
        expect(
          screen.getByRole("button", { name: /settings.logs.showLess/i }),
        ).toBeInTheDocument();
      });
    });
  });

  describe("Log Level Styling", () => {
    it("should render log entries with appropriate level badges", () => {
      mockState.queryData = {
        filename: "test.log",
        content: createMockLogContent([
          {
            level: "error",
            time: "2025-01-15T10:30:00Z",
            message: "Error level test",
          },
          {
            level: "warn",
            time: "2025-01-15T10:31:00Z",
            message: "Warn level test",
          },
          {
            level: "info",
            time: "2025-01-15T10:32:00Z",
            message: "Info level test",
          },
          {
            level: "debug",
            time: "2025-01-15T10:33:00Z",
            message: "Debug level test",
          },
        ]),
        size: 200,
      };

      render(<Logs />);

      // Verify log messages are displayed
      expect(screen.getByText(/Error level test/)).toBeInTheDocument();
      expect(screen.getByText(/Warn level test/)).toBeInTheDocument();
      expect(screen.getByText(/Info level test/)).toBeInTheDocument();
      expect(screen.getByText(/Debug level test/)).toBeInTheDocument();
    });
  });

  describe("Additional Fields", () => {
    it("should render additional fields in log entries", () => {
      mockState.queryData = {
        filename: "test.log",
        content: createMockLogContent([
          {
            level: "error",
            time: "2025-01-15T10:30:00Z",
            message: "Error with context",
            userId: "user123",
            requestId: "req456",
          },
        ]),
        size: 150,
      };

      render(<Logs />);

      expect(screen.getByText(/userId:/)).toBeInTheDocument();
      expect(screen.getByText(/requestId:/)).toBeInTheDocument();
    });
  });

  describe("Error Handling", () => {
    it("should show error message when fetch fails", () => {
      mockState.isError = true;
      mockState.queryData = null;

      render(<Logs />);

      expect(screen.getByText(/settings.logs.fetchError/i)).toBeInTheDocument();
    });

    it("should handle malformed log data gracefully", () => {
      mockState.queryData = {
        filename: "bad.log",
        content: btoa("invalid json line\nmore invalid"),
        size: 50,
      };

      // Should render without crashing
      render(<Logs />);

      expect(
        screen.getByRole("heading", { name: /settings.logs.title/i }),
      ).toBeInTheDocument();
    });
  });

  describe("Native Platform Share", () => {
    it("should show share button on native platforms instead of download", () => {
      mockCapacitorState.isNative = true;
      mockState.queryData = {
        filename: "test.log",
        content: createMockLogContent([
          { level: "info", time: "2025-01-15T10:30:00Z", message: "Test" },
        ]),
        size: 50,
      };

      render(<Logs />);

      expect(
        screen.getByRole("button", { name: /settings.logs.share/i }),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: /settings.logs.download/i }),
      ).not.toBeInTheDocument();
    });

    it("should call native share API when share button is clicked", async () => {
      mockCapacitorState.isNative = true;
      const user = userEvent.setup();
      mockState.queryData = {
        filename: "test.log",
        content: createMockLogContent([
          {
            level: "info",
            time: "2025-01-15T10:30:00Z",
            message: "Share test",
          },
        ]),
        size: 100,
      };

      render(<Logs />);

      const shareButton = screen.getByRole("button", {
        name: /settings.logs.share/i,
      });
      await user.click(shareButton);

      await waitFor(() => {
        expect(mockFilesystemWrite).toHaveBeenCalled();
        expect(mockShareShare).toHaveBeenCalled();
      });
    });
  });

  describe("Download Functionality", () => {
    it("should trigger download when download button is clicked on web", async () => {
      const user = userEvent.setup();
      mockState.queryData = {
        filename: "zaparoo.log",
        content: createMockLogContent([
          {
            level: "info",
            time: "2025-01-15T10:30:00Z",
            message: "Download test",
          },
        ]),
        size: 100,
      };

      // Mock document.createElement for link element
      const mockClick = vi.fn();
      let createdAnchor: HTMLAnchorElement | null = null;
      const originalCreateElement = document.createElement.bind(document);

      vi.spyOn(document, "createElement").mockImplementation(
        (tagName: string) => {
          if (tagName === "a") {
            const anchor = originalCreateElement("a");
            anchor.click = mockClick;
            createdAnchor = anchor;
            return anchor;
          }
          return originalCreateElement(tagName);
        },
      );

      render(<Logs />);

      const downloadButton = screen.getByRole("button", {
        name: /settings.logs.download/i,
      });
      await user.click(downloadButton);

      await waitFor(() => {
        expect(mockClick).toHaveBeenCalled();
        expect(createdAnchor?.download).toBe("zaparoo.log");
      });
    });
  });

  describe("Copy to Clipboard", () => {
    it("should copy log content to clipboard when copy button is clicked", async () => {
      const user = userEvent.setup();
      const mockWriteText = vi.fn().mockResolvedValue(undefined);
      Object.defineProperty(navigator, "clipboard", {
        value: { writeText: mockWriteText },
        writable: true,
        configurable: true,
      });

      mockState.queryData = {
        filename: "test.log",
        content: createMockLogContent([
          { level: "info", time: "2025-01-15T10:30:00Z", message: "Copy test" },
        ]),
        size: 100,
      };

      render(<Logs />);

      const copyButton = screen.getByRole("button", {
        name: /settings.logs.copy/i,
      });
      await user.click(copyButton);

      await waitFor(() => {
        expect(mockWriteText).toHaveBeenCalled();
      });
    });
  });

  describe("Loading State", () => {
    it("should show loading state in refresh button title", () => {
      mockState.isLoading = true;

      render(<Logs />);

      // The refresh button title should indicate loading
      const refreshButton = screen.getByRole("button", { name: /loading/i });
      expect(refreshButton).toBeInTheDocument();
    });

    it("should disable refresh button while loading", () => {
      mockState.isLoading = true;

      render(<Logs />);

      const refreshButton = screen.getByRole("button", { name: /loading/i });
      expect(refreshButton).toBeDisabled();
    });
  });

  describe("Field Value Expansion", () => {
    it("should show show more button for long field values", () => {
      const longValue = "x".repeat(250);
      mockState.queryData = {
        filename: "test.log",
        content: createMockLogContent([
          {
            level: "info",
            time: "2025-01-15T10:30:00Z",
            message: "Test",
            customField: longValue,
          },
        ]),
        size: 400,
      };

      render(<Logs />);

      expect(screen.getByText(/customField:/)).toBeInTheDocument();
      // Should have show more buttons (one for message potentially, one for field)
      const showMoreButtons = screen.getAllByRole("button", {
        name: /settings.logs.showMore/i,
      });
      expect(showMoreButtons.length).toBeGreaterThan(0);
    });

    it("should expand field value when show more is clicked", async () => {
      const user = userEvent.setup();
      const longValue = "y".repeat(250);
      mockState.queryData = {
        filename: "test.log",
        content: createMockLogContent([
          {
            level: "info",
            time: "2025-01-15T10:30:00Z",
            message: "Short msg",
            expandableField: longValue,
          },
        ]),
        size: 400,
      };

      render(<Logs />);

      expect(screen.getByText(/expandableField:/)).toBeInTheDocument();

      // Find and click the show more button
      const showMoreButton = screen.getByRole("button", {
        name: /settings.logs.showMore/i,
      });
      await user.click(showMoreButton);

      // Should now show "show less" button
      await waitFor(() => {
        expect(
          screen.getByRole("button", { name: /settings.logs.showLess/i }),
        ).toBeInTheDocument();
      });
    });
  });
});
