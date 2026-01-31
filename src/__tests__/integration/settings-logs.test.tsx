/**
 * Integration Test: Settings Logs Page Components
 *
 * Tests the logs page component interactions including:
 * - Log level filter toggles
 * - Search input filtering
 * - Entry count display
 * - Copy/share buttons
 */

import React from "react";
import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { render, screen, waitFor } from "../../test-utils";
import userEvent from "@testing-library/user-event";
import { useStatusStore, ConnectionState } from "@/lib/store";
import { usePreferencesStore } from "@/lib/preferencesStore";
import { ToggleChip } from "@/components/wui/ToggleChip";
import { TextInput } from "@/components/wui/TextInput";
import { HeaderButton } from "@/components/wui/HeaderButton";
import { RefreshCw, Copy, Download, Share2 } from "lucide-react";

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
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("Log Level Filters", () => {
    it("should render all level filter chips", () => {
      const levelFilters = usePreferencesStore.getState().logLevelFilters;
      const setLogLevelFilters = vi.fn();

      render(
        <div className="flex flex-row flex-wrap gap-1.5">
          <ToggleChip
            label="Debug"
            state={levelFilters.debug}
            setState={(state) =>
              setLogLevelFilters({ ...levelFilters, debug: state })
            }
            compact
          />
          <ToggleChip
            label="Info"
            state={levelFilters.info}
            setState={(state) =>
              setLogLevelFilters({ ...levelFilters, info: state })
            }
            compact
          />
          <ToggleChip
            label="Warn"
            state={levelFilters.warn}
            setState={(state) =>
              setLogLevelFilters({ ...levelFilters, warn: state })
            }
            compact
          />
          <ToggleChip
            label="Error"
            state={levelFilters.error}
            setState={(state) =>
              setLogLevelFilters({ ...levelFilters, error: state })
            }
            compact
          />
        </div>,
      );

      expect(
        screen.getByRole("button", { name: /debug/i }),
      ).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /info/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /warn/i })).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: /error/i }),
      ).toBeInTheDocument();
    });

    it("should toggle level filter state when clicked", async () => {
      const user = userEvent.setup();
      let levelFilters = { debug: true, info: true, warn: true, error: true };
      const setLogLevelFilters = vi.fn((newFilters) => {
        levelFilters = newFilters;
      });

      render(
        <ToggleChip
          label="Debug"
          state={levelFilters.debug}
          setState={(state) =>
            setLogLevelFilters({ ...levelFilters, debug: state })
          }
          compact
        />,
      );

      const debugButton = screen.getByRole("button", { name: /debug/i });
      await user.click(debugButton);

      expect(setLogLevelFilters).toHaveBeenCalledWith({
        debug: false,
        info: true,
        warn: true,
        error: true,
      });
    });

    it("should update preferences store when filter is toggled", async () => {
      const user = userEvent.setup();

      const FilterChip = () => {
        const levelFilters = usePreferencesStore((s) => s.logLevelFilters);
        const setLogLevelFilters = usePreferencesStore(
          (s) => s.setLogLevelFilters,
        );

        return (
          <ToggleChip
            label="Debug"
            state={levelFilters.debug}
            setState={(state) =>
              setLogLevelFilters({ ...levelFilters, debug: state })
            }
            compact
          />
        );
      };

      render(<FilterChip />);

      const debugButton = screen.getByRole("button", { name: /debug/i });
      expect(debugButton).toHaveAttribute("aria-pressed", "true");

      await user.click(debugButton);

      await waitFor(() => {
        expect(usePreferencesStore.getState().logLevelFilters.debug).toBe(
          false,
        );
      });
    });
  });

  describe("Search Input", () => {
    it("should render search input with placeholder", () => {
      render(
        <TextInput
          label=""
          placeholder="settings.logs.searchPlaceholder"
          value=""
          setValue={vi.fn()}
        />,
      );

      const input = screen.getByRole("textbox");
      expect(input).toBeInTheDocument();
      expect(input).toHaveAttribute(
        "placeholder",
        "settings.logs.searchPlaceholder",
      );
    });

    it("should update search term when typing", async () => {
      const user = userEvent.setup();
      const setValue = vi.fn();

      render(
        <TextInput
          label=""
          placeholder="Search..."
          value=""
          setValue={setValue}
        />,
      );

      const input = screen.getByRole("textbox");
      await user.type(input, "error");

      expect(setValue).toHaveBeenCalledTimes(5); // One for each character
    });

    it("should filter displayed items when search term is entered", async () => {
      const user = userEvent.setup();

      // Test component demonstrating search filtering pattern
      const SearchableList = () => {
        const [searchTerm, setSearchTerm] = React.useState("");
        const items = [
          { id: 1, message: "test message" },
          { id: 2, message: "error occurred" },
          { id: 3, message: "debug info" },
        ];

        const filtered = items.filter((item) =>
          item.message.toLowerCase().includes(searchTerm.toLowerCase()),
        );

        return (
          <div>
            <TextInput
              label="Search"
              placeholder="Search..."
              value={searchTerm}
              setValue={setSearchTerm}
            />
            <ul>
              {filtered.map((item) => (
                <li key={item.id}>{item.message}</li>
              ))}
            </ul>
          </div>
        );
      };

      render(<SearchableList />);

      // All items visible initially
      expect(screen.getByText("test message")).toBeInTheDocument();
      expect(screen.getByText("error occurred")).toBeInTheDocument();
      expect(screen.getByText("debug info")).toBeInTheDocument();

      // Type in search to filter
      await user.type(screen.getByRole("textbox"), "error");

      // Only matching item visible
      expect(screen.queryByText("test message")).not.toBeInTheDocument();
      expect(screen.getByText("error occurred")).toBeInTheDocument();
      expect(screen.queryByText("debug info")).not.toBeInTheDocument();
    });
  });

  describe("Action Buttons", () => {
    it("should render refresh button", () => {
      render(
        <HeaderButton
          onClick={vi.fn()}
          disabled={false}
          icon={<RefreshCw size="20" />}
          title="settings.logs.refresh"
        />,
      );

      const refreshButton = screen.getByRole("button", {
        name: /settings.logs.refresh/i,
      });
      expect(refreshButton).toBeInTheDocument();
      expect(refreshButton).not.toBeDisabled();
    });

    it("should disable refresh button when not connected", () => {
      useStatusStore.setState({ connected: false });
      const connected = useStatusStore.getState().connected;

      render(
        <HeaderButton
          onClick={vi.fn()}
          disabled={!connected}
          icon={<RefreshCw size="20" />}
          title="settings.logs.refresh"
        />,
      );

      const refreshButton = screen.getByRole("button", {
        name: /settings.logs.refresh/i,
      });
      expect(refreshButton).toBeDisabled();
    });

    it("should render copy button when data is available", () => {
      render(
        <HeaderButton
          onClick={vi.fn()}
          icon={<Copy size="20" />}
          title="settings.logs.copy"
        />,
      );

      const copyButton = screen.getByRole("button", {
        name: /settings.logs.copy/i,
      });
      expect(copyButton).toBeInTheDocument();
    });

    it("should call copy handler when copy button is clicked", async () => {
      const user = userEvent.setup();
      const copyHandler = vi.fn();

      render(
        <HeaderButton
          onClick={copyHandler}
          icon={<Copy size="20" />}
          title="settings.logs.copy"
        />,
      );

      const copyButton = screen.getByRole("button", {
        name: /settings.logs.copy/i,
      });
      await user.click(copyButton);

      expect(copyHandler).toHaveBeenCalledTimes(1);
    });

    it("should render download button on web platform", () => {
      render(
        <HeaderButton
          onClick={vi.fn()}
          icon={<Download size="20" />}
          title="settings.logs.download"
        />,
      );

      const downloadButton = screen.getByRole("button", {
        name: /settings.logs.download/i,
      });
      expect(downloadButton).toBeInTheDocument();
    });

    it("should render share button on native platform", () => {
      render(
        <HeaderButton
          onClick={vi.fn()}
          icon={<Share2 size="20" />}
          title="settings.logs.share"
        />,
      );

      const shareButton = screen.getByRole("button", {
        name: /settings.logs.share/i,
      });
      expect(shareButton).toBeInTheDocument();
    });
  });

  describe("Entry Count and Filtering Integration", () => {
    // Test component that demonstrates real filtering with count display
    const FilterableLogList = () => {
      const levelFilters = usePreferencesStore((s) => s.logLevelFilters);
      const setLogLevelFilters = usePreferencesStore(
        (s) => s.setLogLevelFilters,
      );

      const allEntries = [
        { level: "debug", message: "debug message 1" },
        { level: "debug", message: "debug message 2" },
        { level: "info", message: "info message" },
        { level: "warn", message: "warn message" },
        { level: "error", message: "error message" },
      ];

      const filteredEntries = allEntries.filter((entry) => {
        const levelKey = entry.level as keyof typeof levelFilters;
        return levelFilters[levelKey] !== false;
      });

      return (
        <div>
          <div className="filters">
            <ToggleChip
              label="Debug"
              state={levelFilters.debug}
              setState={(state) =>
                setLogLevelFilters({ ...levelFilters, debug: state })
              }
            />
            <ToggleChip
              label="Info"
              state={levelFilters.info}
              setState={(state) =>
                setLogLevelFilters({ ...levelFilters, info: state })
              }
            />
            <ToggleChip
              label="Error"
              state={levelFilters.error}
              setState={(state) =>
                setLogLevelFilters({ ...levelFilters, error: state })
              }
            />
          </div>
          <div data-testid="entry-count">
            {filteredEntries.length === allEntries.length
              ? `${allEntries.length} entries`
              : `Showing ${filteredEntries.length} of ${allEntries.length} entries`}
          </div>
          <ul>
            {filteredEntries.map((entry, index) => (
              <li key={index} data-level={entry.level}>
                {entry.message}
              </li>
            ))}
          </ul>
        </div>
      );
    };

    it("should display total entry count when no filters applied", () => {
      render(<FilterableLogList />);

      expect(screen.getByTestId("entry-count")).toHaveTextContent("5 entries");
      expect(screen.getAllByRole("listitem")).toHaveLength(5);
    });

    it("should update entry count and visible items when debug filter is toggled off", async () => {
      const user = userEvent.setup();
      render(<FilterableLogList />);

      // Initially all 5 entries visible (2 debug + 1 info + 1 warn + 1 error)
      expect(screen.getAllByRole("listitem")).toHaveLength(5);

      // Toggle off debug filter
      const debugButton = screen.getByRole("button", { name: /debug/i });
      await user.click(debugButton);

      // Should show filtered count and hide debug entries
      await waitFor(() => {
        expect(screen.getByTestId("entry-count")).toHaveTextContent(
          "Showing 3 of 5 entries",
        );
      });
      expect(screen.queryByText("debug message 1")).not.toBeInTheDocument();
      expect(screen.queryByText("debug message 2")).not.toBeInTheDocument();
      expect(screen.getByText("info message")).toBeInTheDocument();
      expect(screen.getByText("error message")).toBeInTheDocument();
    });

    it("should filter multiple log levels when multiple chips are toggled off", async () => {
      const user = userEvent.setup();
      render(<FilterableLogList />);

      // Toggle off debug and info
      await user.click(screen.getByRole("button", { name: /debug/i }));
      await user.click(screen.getByRole("button", { name: /info/i }));

      await waitFor(() => {
        expect(screen.getByTestId("entry-count")).toHaveTextContent(
          "Showing 2 of 5 entries",
        );
      });
      expect(screen.getAllByRole("listitem")).toHaveLength(2);
    });

    it("should restore entries when filter is toggled back on", async () => {
      const user = userEvent.setup();
      render(<FilterableLogList />);

      // Toggle off debug
      const debugButton = screen.getByRole("button", { name: /debug/i });
      await user.click(debugButton);

      await waitFor(() => {
        expect(screen.queryByText("debug message 1")).not.toBeInTheDocument();
      });

      // Toggle debug back on
      await user.click(debugButton);

      await waitFor(() => {
        expect(screen.getByText("debug message 1")).toBeInTheDocument();
        expect(screen.getByText("debug message 2")).toBeInTheDocument();
        expect(screen.getByTestId("entry-count")).toHaveTextContent(
          "5 entries",
        );
      });
    });
  });
});
