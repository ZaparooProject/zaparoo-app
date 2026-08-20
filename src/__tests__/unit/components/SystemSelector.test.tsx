/**
 * Unit Tests: SystemSelector Component
 *
 * Tests the system selection modal including:
 * - Rendering category tabs
 * - Filtering systems by search query (debounced)
 * - Filtering systems by selected category tab
 * - Single-select mode (closes on selection)
 * - Multi-select mode (stays open, shows count)
 * - "All Systems" option when includeAllOption is true
 * - Selection remains available during indexing
 */

import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { render, screen, waitFor, act } from "../../../test-utils";
import userEvent from "@testing-library/user-event";
import { useQuery } from "@tanstack/react-query";
import { useStatusStore } from "@/lib/store";
import { usePreferencesStore } from "@/lib/preferencesStore";
import {
  seedActiveDevice,
  seedDeviceRegistry,
  mockDeviceRecord,
} from "@/test-utils/deviceRegistry";
import {
  SystemSelector,
  SystemSelectorTrigger,
  System,
} from "@/components/SystemSelector";

// Mock CoreAPI - interface to external JSON-RPC API
vi.mock("@/lib/coreApi", () => ({
  CoreAPI: {
    systems: vi.fn(),
    reset: vi.fn(),
  },
}));

// Mock useVirtualizer - external library, needed for virtualized list testing
vi.mock("@tanstack/react-virtual", () => ({
  useVirtualizer: vi.fn(({ count }) => ({
    getVirtualItems: () =>
      Array.from({ length: count }, (_, i) => ({
        index: i,
        key: i,
        size: 56,
        start: i * 56,
      })),
    getTotalSize: () => count * 56,
    scrollToIndex: vi.fn(),
  })),
}));

// Mock useAnnouncer to capture accessibility announcements for assertions
const mockAnnounce = vi.fn();
vi.mock("@/components/A11yAnnouncer", async (importOriginal) => {
  const actual =
    (await importOriginal()) as typeof import("@/components/A11yAnnouncer");
  return {
    ...actual,
    useAnnouncer: () => ({
      announce: mockAnnounce,
    }),
  };
});

// Mock react-query - external library
const mockSystems: System[] = [
  { id: "nes", name: "Nintendo Entertainment System", category: "Nintendo" },
  { id: "snes", name: "Super Nintendo", category: "Nintendo" },
  { id: "n64", name: "Nintendo 64", category: "Nintendo" },
  { id: "genesis", name: "Sega Genesis", category: "Sega" },
  { id: "saturn", name: "Sega Saturn", category: "Sega" },
  { id: "psx", name: "PlayStation", category: "Sony" },
  { id: "ps2", name: "PlayStation 2", category: "Sony" },
  { id: "atari2600", name: "Atari 2600", category: "Atari" },
  { id: "msx", name: "MSX", category: "Other" },
];

let mockIsLoading = false;
vi.mock("@tanstack/react-query", async (importOriginal) => {
  const actual =
    (await importOriginal()) as typeof import("@tanstack/react-query");
  return {
    ...actual,
    useQuery: vi.fn(() => ({
      data: { systems: mockSystems },
      isLoading: mockIsLoading,
      isError: false,
      refetch: vi.fn(),
    })),
  };
});

describe("SystemSelector", () => {
  const defaultProps = {
    isOpen: true,
    onClose: vi.fn(),
    onSelect: vi.fn(),
    selectedSystems: [] as string[],
    mode: "single" as const,
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mockIsLoading = false;

    // Reset stores
    usePreferencesStore.setState({ systemNameRegion: "auto" });
    await seedActiveDevice({ recordId: "test-device" });
    useStatusStore.setState({
      ...useStatusStore.getState(),
      gamesIndex: {
        exists: true,
        indexing: false,
        totalSteps: 0,
        currentStep: 0,
      },
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe("page rendering", () => {
    it("should use the preferred regional system names", () => {
      usePreferencesStore.setState({ systemNameRegion: "jp" });
      vi.mocked(useQuery).mockReturnValueOnce({
        data: {
          systems: [
            { id: "NES", name: "Nintendo Entertainment System" },
            { id: "SNES", name: "Super Nintendo" },
          ],
        },
        isLoading: false,
        isError: false,
        refetch: vi.fn(),
      } as unknown as ReturnType<typeof useQuery>);

      render(<SystemSelector {...defaultProps} />);

      expect(
        screen.getByRole("radio", { name: "Famicom" }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("radio", { name: "Super Famicom" }),
      ).toBeInTheDocument();
    });

    it("should hide systems with an explicit zero media count by default", () => {
      vi.mocked(useQuery).mockReturnValueOnce({
        data: {
          systems: [
            { id: "SNES", name: "Super Nintendo", mediaCount: 12 },
            { id: "3DO", name: "3DO", mediaCount: 0 },
          ],
        },
        isLoading: false,
        isError: false,
        refetch: vi.fn(),
      } as unknown as ReturnType<typeof useQuery>);

      render(<SystemSelector {...defaultProps} />);

      expect(screen.getByRole("radio", { name: "SNES" })).toBeInTheDocument();
      expect(
        screen.queryByRole("radio", { name: "3DO" }),
      ).not.toBeInTheDocument();
    });

    it("should include zero-count systems when requested", () => {
      vi.mocked(useQuery).mockReturnValueOnce({
        data: {
          systems: [
            { id: "SNES", name: "Super Nintendo", mediaCount: 12 },
            { id: "3DO", name: "3DO", mediaCount: 0 },
          ],
        },
        isLoading: false,
        isError: false,
        refetch: vi.fn(),
      } as unknown as ReturnType<typeof useQuery>);

      render(<SystemSelector {...defaultProps} includeEmptySystems />);

      expect(screen.getByRole("radio", { name: "3DO" })).toBeInTheDocument();
    });

    it("should scope full system queries to the selected device", async () => {
      await seedDeviceRegistry([
        mockDeviceRecord({ recordId: "other-device" }),
      ]);

      render(<SystemSelector {...defaultProps} allSystems={true} />);

      expect(useQuery).toHaveBeenCalledWith(
        expect.objectContaining({
          queryKey: ["systems", "other-device", { all: true }],
          enabled: true,
          staleTime: 0,
        }),
      );
    });

    it("should render modal with title", () => {
      // Act
      render(<SystemSelector {...defaultProps} />);

      // Assert - real SlideModal renders with role="dialog"
      expect(screen.getByRole("dialog")).toBeInTheDocument();
      // Title appears twice (mobile and desktop views), verify at least one exists
      expect(
        screen.getAllByText("systemSelector.title").length,
      ).toBeGreaterThan(0);
    });

    it("should render custom title when provided", () => {
      // Act
      render(<SystemSelector {...defaultProps} title="Custom Title" />);

      // Assert - title appears twice (mobile and desktop views)
      expect(screen.getAllByText("Custom Title").length).toBeGreaterThan(0);
    });

    it("should render search input", () => {
      // Act
      render(<SystemSelector {...defaultProps} />);

      // Assert
      expect(
        screen.getByPlaceholderText("systemSelector.searchPlaceholder"),
      ).toBeInTheDocument();
    });

    it("should render loading state", () => {
      // Arrange
      mockIsLoading = true;

      // Act
      render(<SystemSelector {...defaultProps} />);

      // Assert
      expect(screen.getByText("loading")).toBeInTheDocument();
    });

    it("should not render when closed", () => {
      // Act
      render(<SystemSelector {...defaultProps} isOpen={false} />);

      // Assert
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
  });

  describe("category tabs", () => {
    it("should render category tabs", () => {
      // Act
      render(<SystemSelector {...defaultProps} />);

      // Assert
      expect(
        screen.getByRole("tab", { name: "systemSelector.allCategories" }),
      ).toBeInTheDocument();
      expect(screen.getByRole("tab", { name: "Nintendo" })).toBeInTheDocument();
      expect(screen.getByRole("tab", { name: "Sega" })).toBeInTheDocument();
      expect(screen.getByRole("tab", { name: "Sony" })).toBeInTheDocument();
      expect(screen.getByRole("tab", { name: "Atari" })).toBeInTheDocument();
    });

    it("should filter systems by selected category tab", async () => {
      // Arrange
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

      render(<SystemSelector {...defaultProps} />);

      // Initially shows all systems
      expect(
        screen.getByRole("radio", { name: "Nintendo Entertainment System" }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("radio", { name: "Sega Genesis" }),
      ).toBeInTheDocument();

      // Act - click Nintendo tab
      await user.click(screen.getByRole("tab", { name: "Nintendo" }));

      // Assert - only Nintendo systems shown
      expect(
        screen.getByRole("radio", { name: "Nintendo Entertainment System" }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("radio", { name: "Super Nintendo" }),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole("radio", { name: "Sega Genesis" }),
      ).not.toBeInTheDocument();
    });

    it("should sort multiple non-priority categories alphabetically after priority ones", () => {
      // Arrange - override query to include two extra non-priority categories
      vi.mocked(useQuery).mockReturnValueOnce({
        data: {
          systems: [
            ...mockSystems,
            { id: "dos", name: "DOS Games", category: "PC" },
            { id: "arcade", name: "Street Fighter II", category: "Arcade" },
          ],
        },
        isLoading: false,
        isError: false,
        refetch: vi.fn(),
      } as unknown as ReturnType<typeof useQuery>);

      // Act
      render(<SystemSelector {...defaultProps} />);

      // Assert - "Arcade" and "PC" (non-priority) should appear in alphabetical order
      const tabs = screen.getAllByRole("tab");
      const tabNames = tabs.map((tab) => tab.textContent ?? "");
      const arcadeIndex = tabNames.findIndex((n) => n.includes("Arcade"));
      const pcIndex = tabNames.findIndex((n) => n.includes("PC"));

      expect(arcadeIndex).toBeGreaterThan(0);
      expect(pcIndex).toBeGreaterThan(0);
      expect(arcadeIndex).toBeLessThan(pcIndex); // "Arcade" < "PC" alphabetically
    });

    it("should prioritize Nintendo, Sony, Sega, Atari categories", () => {
      // Act
      render(<SystemSelector {...defaultProps} />);

      // Assert - check tab order
      const tabs = screen.getAllByRole("tab");
      const tabNames = tabs.map((tab) => tab.textContent);

      // First tab should be "all", then priority categories
      expect(tabNames[0]).toBe("systemSelector.allCategories");
      expect(tabNames[1]).toBe("Nintendo");
      expect(tabNames[2]).toBe("Sony");
      expect(tabNames[3]).toBe("Sega");
      expect(tabNames[4]).toBe("Atari");
    });
  });

  describe("search filtering", () => {
    it("should filter systems by search query (debounced)", async () => {
      // Arrange
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

      render(<SystemSelector {...defaultProps} />);

      // Act - type in search
      const searchInput = screen.getByPlaceholderText(
        "systemSelector.searchPlaceholder",
      );
      await user.type(searchInput, "nintendo");

      // Advance past debounce time
      await act(async () => {
        vi.advanceTimersByTime(350);
      });

      // Assert - only matching systems shown
      await waitFor(() => {
        expect(
          screen.getByRole("radio", { name: "Nintendo Entertainment System" }),
        ).toBeInTheDocument();
        expect(
          screen.getByRole("radio", { name: "Super Nintendo" }),
        ).toBeInTheDocument();
        expect(
          screen.getByRole("radio", { name: "Nintendo 64" }),
        ).toBeInTheDocument();
        expect(
          screen.queryByRole("radio", { name: "Sega Genesis" }),
        ).not.toBeInTheDocument();
      });
    });

    it("should keep a radio tabbable when selection is filtered out", async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

      render(
        <SystemSelector
          {...defaultProps}
          selectedSystems={["genesis"]}
          mode="single"
        />,
      );

      await user.type(
        screen.getByPlaceholderText("systemSelector.searchPlaceholder"),
        "nintendo",
      );
      await act(async () => {
        vi.advanceTimersByTime(350);
      });

      expect(screen.getAllByRole("radio")[0]).toHaveAttribute("tabindex", "0");
    });

    it("should show no results message when search has no matches", async () => {
      // Arrange
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

      render(<SystemSelector {...defaultProps} />);

      // Act
      const searchInput = screen.getByPlaceholderText(
        "systemSelector.searchPlaceholder",
      );
      await user.type(searchInput, "xyz123nonexistent");

      await act(async () => {
        vi.advanceTimersByTime(350);
      });

      // Assert
      await waitFor(() => {
        expect(
          screen.getByText("systemSelector.noResults"),
        ).toBeInTheDocument();
      });
    });

    it("should clear search when X button clicked", async () => {
      // Arrange
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

      render(<SystemSelector {...defaultProps} />);

      // Type in search
      const searchInput = screen.getByPlaceholderText(
        "systemSelector.searchPlaceholder",
      );
      await user.type(searchInput, "nintendo");

      // Act - click clear button
      const clearButton = screen.getByRole("button", {
        name: "systemSelector.clearSearch",
      });
      await user.click(clearButton);

      // Assert
      expect(searchInput).toHaveValue("");
    });
  });

  describe("single-select mode", () => {
    it("should close modal on selection in single mode", async () => {
      // Arrange
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      const onClose = vi.fn();
      const onSelect = vi.fn();

      render(
        <SystemSelector
          {...defaultProps}
          mode="single"
          onClose={onClose}
          onSelect={onSelect}
        />,
      );

      // Act
      await user.click(
        screen.getByRole("radio", { name: "Nintendo Entertainment System" }),
      );

      // Assert
      expect(onSelect).toHaveBeenCalledWith(["nes"]);
      expect(onClose).toHaveBeenCalled();
    });

    it("should expose the complete filtered system collection", () => {
      render(<SystemSelector {...defaultProps} mode="single" />);

      expect(screen.getAllByRole("radio")).toHaveLength(mockSystems.length);
    });

    it("should render radio buttons in single mode", () => {
      // Act
      render(<SystemSelector {...defaultProps} mode="single" />);

      // Assert
      expect(
        screen.getByRole("radio", { name: "Nintendo Entertainment System" }),
      ).toBeInTheDocument();
    });

    it("should support radio-group arrow navigation", async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      const onSelect = vi.fn();
      render(
        <SystemSelector {...defaultProps} mode="single" onSelect={onSelect} />,
      );

      const first = screen.getByRole("radio", {
        name: "Nintendo Entertainment System",
      });
      first.focus();
      await user.keyboard("{ArrowDown}");

      expect(screen.getByRole("radio", { name: "PlayStation" })).toHaveFocus();
      expect(onSelect).toHaveBeenCalledWith(["psx"]);
    });

    it("should announce selection for screen readers", async () => {
      // Arrange
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

      render(<SystemSelector {...defaultProps} mode="single" />);

      // Act
      await user.click(
        screen.getByRole("radio", { name: "Nintendo Entertainment System" }),
      );

      // Assert
      expect(mockAnnounce).toHaveBeenCalledWith(
        expect.stringContaining("systemSelector.selected"),
      );
    });
  });

  describe("multi-select mode", () => {
    it("should stay open on selection in multi mode", async () => {
      // Arrange
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      const onClose = vi.fn();
      const onSelect = vi.fn();

      render(
        <SystemSelector
          {...defaultProps}
          mode="multi"
          onClose={onClose}
          onSelect={onSelect}
        />,
      );

      // Act
      await user.click(
        screen.getByRole("checkbox", { name: "Nintendo Entertainment System" }),
      );

      // Assert
      expect(onSelect).toHaveBeenCalledWith(["nes"]);
      expect(onClose).not.toHaveBeenCalled();
    });

    it("should render checkboxes in multi mode", () => {
      // Act
      render(<SystemSelector {...defaultProps} mode="multi" />);

      // Assert
      expect(
        screen.getByRole("checkbox", { name: "Nintendo Entertainment System" }),
      ).toBeInTheDocument();
    });

    it("should show selected count in footer", () => {
      // Act
      render(
        <SystemSelector
          {...defaultProps}
          mode="multi"
          selectedSystems={["nes", "snes"]}
        />,
      );

      // Assert - footer shows selected count
      expect(
        screen.getByText("systemSelector.selectedCount"),
      ).toBeInTheDocument();
    });

    it("should toggle selection on click", async () => {
      // Arrange
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      const onSelect = vi.fn();

      const { rerender } = render(
        <SystemSelector
          {...defaultProps}
          mode="multi"
          onSelect={onSelect}
          selectedSystems={[]}
        />,
      );

      // Act - select system
      await user.click(
        screen.getByRole("checkbox", { name: "Nintendo Entertainment System" }),
      );

      // Assert - should add
      expect(onSelect).toHaveBeenCalledWith(["nes"]);

      // Rerender with selection
      rerender(
        <SystemSelector
          {...defaultProps}
          mode="multi"
          onSelect={onSelect}
          selectedSystems={["nes"]}
        />,
      );

      // Act - deselect system
      await user.click(
        screen.getByRole("checkbox", { name: "Nintendo Entertainment System" }),
      );

      // Assert - should remove
      expect(onSelect).toHaveBeenCalledWith([]);
    });

    it("should show clear all button when systems selected", async () => {
      // Arrange
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      const onSelect = vi.fn();

      render(
        <SystemSelector
          {...defaultProps}
          mode="multi"
          selectedSystems={["nes", "snes"]}
          onSelect={onSelect}
        />,
      );

      // Assert - clear all button visible
      const clearButton = screen.getByRole("button", {
        name: "systemSelector.clearAll",
      });
      expect(clearButton).toBeInTheDocument();

      // Act
      await user.click(clearButton);

      // Assert
      expect(onSelect).toHaveBeenCalledWith([]);
    });

    it("should keep clear all mounted and disabled without a selection", () => {
      render(
        <SystemSelector {...defaultProps} mode="multi" selectedSystems={[]} />,
      );

      const clearButton = screen.getByRole("button", {
        name: "systemSelector.clearAll",
      });
      expect(clearButton).toBeDisabled();
      expect(clearButton).toHaveTextContent("systemSelector.clearAll");
    });

    it("should close modal when apply clicked", async () => {
      // Arrange
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      const onClose = vi.fn();

      render(
        <SystemSelector
          {...defaultProps}
          mode="multi"
          selectedSystems={["nes"]}
          onClose={onClose}
        />,
      );

      // Act
      await user.click(
        screen.getByRole("button", { name: "systemSelector.apply" }),
      );

      // Assert
      expect(onClose).toHaveBeenCalled();
    });
  });

  describe("all systems option", () => {
    it("should show 'All Systems' option when includeAllOption is true", () => {
      // Act
      render(
        <SystemSelector
          {...defaultProps}
          mode="single"
          includeAllOption={true}
        />,
      );

      // Assert
      expect(
        screen.getByRole("radio", { name: "systemSelector.allSystems" }),
      ).toBeInTheDocument();
    });

    it("should not show 'All Systems' option when includeAllOption is false", () => {
      // Act
      render(
        <SystemSelector
          {...defaultProps}
          mode="single"
          includeAllOption={false}
        />,
      );

      // Assert
      expect(
        screen.queryByRole("radio", { name: "systemSelector.allSystems" }),
      ).not.toBeInTheDocument();
    });

    it("should select 'All Systems' and pass empty array", async () => {
      // Arrange
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      const onSelect = vi.fn();

      render(
        <SystemSelector
          {...defaultProps}
          mode="single"
          includeAllOption={true}
          onSelect={onSelect}
        />,
      );

      // Act
      await user.click(
        screen.getByRole("radio", { name: "systemSelector.allSystems" }),
      );

      // Assert - "all" selection passes empty array
      expect(onSelect).toHaveBeenCalledWith([]);
    });

    it("should hide 'All Systems' option when search is active", async () => {
      // Arrange
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

      render(
        <SystemSelector
          {...defaultProps}
          mode="single"
          includeAllOption={true}
        />,
      );

      // Initially visible
      expect(
        screen.getByRole("radio", { name: "systemSelector.allSystems" }),
      ).toBeInTheDocument();

      // Act - type in search
      const searchInput = screen.getByPlaceholderText(
        "systemSelector.searchPlaceholder",
      );
      await user.type(searchInput, "nintendo");

      await act(async () => {
        vi.advanceTimersByTime(350);
      });

      // Assert - All Systems option hidden during search
      await waitFor(() => {
        expect(
          screen.queryByRole("radio", { name: "systemSelector.allSystems" }),
        ).not.toBeInTheDocument();
      });
    });

    it("should hide 'All Systems' option when not on all categories tab", async () => {
      // Arrange
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

      render(
        <SystemSelector
          {...defaultProps}
          mode="single"
          includeAllOption={true}
        />,
      );

      // Initially visible
      expect(
        screen.getByRole("radio", { name: "systemSelector.allSystems" }),
      ).toBeInTheDocument();

      // Act - click Nintendo tab
      await user.click(screen.getByRole("tab", { name: "Nintendo" }));

      // Assert - All Systems option hidden when category selected
      expect(
        screen.queryByRole("radio", { name: "systemSelector.allSystems" }),
      ).not.toBeInTheDocument();
    });
  });

  describe("indexing state", () => {
    it("should allow selection during indexing", async () => {
      // Arrange - indexing runs, but committed systems are already served,
      // so selection stays enabled.
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      const onSelect = vi.fn();

      useStatusStore.setState({
        ...useStatusStore.getState(),
        gamesIndex: {
          exists: true,
          indexing: true,
          totalSteps: 100,
          currentStep: 50,
        },
      });

      render(
        <SystemSelector {...defaultProps} mode="single" onSelect={onSelect} />,
      );

      // Act
      const button = screen.getByRole("radio", {
        name: "Nintendo Entertainment System",
      });
      expect(button).toBeEnabled();
      await user.click(button);

      // Assert
      expect(onSelect).toHaveBeenCalledWith(["nes"]);
    });

    it("should keep clear all enabled during indexing", () => {
      // Arrange
      useStatusStore.setState({
        ...useStatusStore.getState(),
        gamesIndex: {
          exists: true,
          indexing: true,
          totalSteps: 100,
          currentStep: 50,
        },
      });

      render(
        <SystemSelector
          {...defaultProps}
          mode="multi"
          selectedSystems={["nes"]}
        />,
      );

      // Assert
      expect(
        screen.getByRole("button", { name: "systemSelector.clearAll" }),
      ).toBeEnabled();
    });
  });

  describe("insert mode", () => {
    it("should close modal on selection in insert mode", async () => {
      // Arrange
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      const onClose = vi.fn();
      const onSelect = vi.fn();

      render(
        <SystemSelector
          {...defaultProps}
          mode="insert"
          onClose={onClose}
          onSelect={onSelect}
        />,
      );

      // Act
      await user.click(
        screen.getByRole("radio", { name: "Nintendo Entertainment System" }),
      );

      // Assert
      expect(onSelect).toHaveBeenCalledWith(["nes"]);
      expect(onClose).toHaveBeenCalled();
    });
  });
});

describe("SystemSelectorTrigger", () => {
  const systemsData = { systems: mockSystems };

  beforeEach(() => {
    vi.clearAllMocks();

    // Reset store
    useStatusStore.setState({
      ...useStatusStore.getState(),
      gamesIndex: {
        exists: true,
        indexing: false,
        totalSteps: 0,
        currentStep: 0,
      },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("display text", () => {
    it("should display placeholder when no tags selected in multi mode", () => {
      // Act
      render(
        <SystemSelectorTrigger
          selectedSystems={[]}
          systemsData={systemsData}
          placeholder="Select systems"
          mode="multi"
          onClick={vi.fn()}
        />,
      );

      // Assert
      expect(screen.getByText("Select systems")).toBeInTheDocument();
    });

    it("should display 'All Systems' when no selection in single mode", () => {
      // Act
      render(
        <SystemSelectorTrigger
          selectedSystems={[]}
          systemsData={systemsData}
          mode="single"
          onClick={vi.fn()}
        />,
      );

      // Assert
      expect(screen.getByText("systemSelector.allSystems")).toBeInTheDocument();
    });

    it("should display system name when 1 system selected in single mode", () => {
      // Act
      render(
        <SystemSelectorTrigger
          selectedSystems={["nes"]}
          systemsData={systemsData}
          mode="single"
          onClick={vi.fn()}
        />,
      );

      // Assert
      expect(
        screen.getByText("Nintendo Entertainment System"),
      ).toBeInTheDocument();
    });

    it("should display tag names when 1-3 tags selected", () => {
      // Act
      render(
        <SystemSelectorTrigger
          selectedSystems={["nes", "snes"]}
          systemsData={systemsData}
          mode="multi"
          onClick={vi.fn()}
        />,
      );

      // Assert
      expect(
        screen.getByText("Nintendo Entertainment System, Super Nintendo"),
      ).toBeInTheDocument();
    });

    it("should exclude zero-count systems from trigger totals unless requested", () => {
      const countedSystems = {
        systems: [
          { id: "snes", name: "Super Nintendo", mediaCount: 10 },
          { id: "3do", name: "3DO", mediaCount: 0 },
        ],
      };
      const { rerender } = render(
        <SystemSelectorTrigger
          selectedSystems={["snes"]}
          systemsData={countedSystems}
          mode="multi"
          onClick={vi.fn()}
        />,
      );

      expect(screen.getByText("systemSelector.allSystems")).toBeInTheDocument();

      rerender(
        <SystemSelectorTrigger
          selectedSystems={["snes"]}
          systemsData={countedSystems}
          mode="multi"
          onClick={vi.fn()}
          includeEmptySystems
        />,
      );
      expect(screen.getByText("Super Nintendo")).toBeInTheDocument();
    });

    it("should display count when more than 3 tags selected", () => {
      // Act
      render(
        <SystemSelectorTrigger
          selectedSystems={["nes", "snes", "n64", "genesis"]}
          systemsData={systemsData}
          mode="multi"
          onClick={vi.fn()}
        />,
      );

      // Assert
      expect(
        screen.getByText("systemSelector.multipleSelected"),
      ).toBeInTheDocument();
    });
  });

  describe("accessible naming", () => {
    it("should use an associated visible label", () => {
      render(
        <div>
          <span id="systems-label">Systems</span>
          <SystemSelectorTrigger
            selectedSystems={[]}
            systemsData={systemsData}
            onClick={vi.fn()}
            aria-labelledby="systems-label"
          />
        </div>,
      );

      expect(
        screen.getByRole("button", { name: "Systems" }),
      ).toBeInTheDocument();
    });
  });

  describe("click handling", () => {
    it("should call onClick when clicked", async () => {
      // Arrange
      const user = userEvent.setup();
      const onClick = vi.fn();

      render(
        <SystemSelectorTrigger
          selectedSystems={[]}
          systemsData={systemsData}
          onClick={onClick}
        />,
      );

      // Act
      await user.click(screen.getByRole("button"));

      // Assert
      expect(onClick).toHaveBeenCalled();
    });

    it("should not call onClick when disabled", async () => {
      // Arrange
      const user = userEvent.setup();
      const onClick = vi.fn();

      render(
        <SystemSelectorTrigger
          selectedSystems={[]}
          systemsData={systemsData}
          onClick={onClick}
          disabled={true}
        />,
      );

      // Act
      await user.click(screen.getByRole("button"));

      // Assert
      expect(onClick).not.toHaveBeenCalled();
    });
  });

  describe("indexing state", () => {
    it("should stay enabled during indexing", () => {
      // Arrange
      useStatusStore.setState({
        ...useStatusStore.getState(),
        gamesIndex: {
          exists: true,
          indexing: true,
          totalSteps: 100,
          currentStep: 50,
        },
      });

      // Act
      render(
        <SystemSelectorTrigger
          selectedSystems={[]}
          systemsData={systemsData}
          onClick={vi.fn()}
        />,
      );

      // Assert - indexing no longer disables the trigger; committed systems
      // are already served.
      expect(screen.getByRole("button")).toBeEnabled();
    });

    it("should call onClick when indexing", async () => {
      // Arrange
      const user = userEvent.setup();
      const onClick = vi.fn();

      useStatusStore.setState({
        ...useStatusStore.getState(),
        gamesIndex: {
          exists: true,
          indexing: true,
          totalSteps: 100,
          currentStep: 50,
        },
      });

      render(
        <SystemSelectorTrigger
          selectedSystems={[]}
          systemsData={systemsData}
          onClick={onClick}
        />,
      );

      // Act
      await user.click(screen.getByRole("button"));

      // Assert
      expect(onClick).toHaveBeenCalled();
    });
  });
});
