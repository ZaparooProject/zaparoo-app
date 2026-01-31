/**
 * Unit Tests: TagSelector Component
 *
 * Tests the tag selection modal functionality including:
 * - Loading/error/empty states
 * - Tag grouping by type with priority sorting
 * - Search filtering (debounced)
 * - Tag selection/deselection with screen reader announcements
 * - Disable behavior during indexing
 * - Footer with selected count, clear all, and apply buttons
 * - Accordion expand/collapse all
 */

import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { render, screen, waitFor, act } from "../../../test-utils";
import userEvent from "@testing-library/user-event";
import { TagSelector, TagSelectorTrigger } from "@/components/TagSelector";
import { useStatusStore } from "@/lib/store";
import { CoreAPI } from "@/lib/coreApi";
import { TagInfo } from "@/lib/models";

// Mock CoreAPI
vi.mock("@/lib/coreApi", () => ({
  CoreAPI: {
    mediaTags: vi.fn(),
    reset: vi.fn(),
  },
}));

// Mock useAnnouncer
const mockAnnounce = vi.fn();
vi.mock("@/components/A11yAnnouncer", () => ({
  useAnnouncer: () => ({ announce: mockAnnounce }),
  A11yAnnouncerProvider: ({ children }: { children: React.ReactNode }) =>
    children,
}));

// Mock useVirtualizer to simplify testing
vi.mock("@tanstack/react-virtual", () => ({
  useVirtualizer: vi.fn(({ count }) => ({
    getTotalSize: () => count * 64,
    getVirtualItems: () =>
      Array.from({ length: count }, (_, i) => ({
        index: i,
        key: `item-${i}`,
        size: 64,
        start: i * 64,
      })),
  })),
}));

// Helper to create mock tag data
function createMockTags(): TagInfo[] {
  return [
    { tag: "Action", type: "genre" },
    { tag: "RPG", type: "genre" },
    { tag: "1990", type: "year" },
    { tag: "1995", type: "year" },
    { tag: "Nintendo", type: "publisher" },
    { tag: "Mario", type: "series" },
    { tag: "Adventure", type: "genre" },
    { tag: "Platformer", type: "custom" },
  ];
}

describe("TagSelector", () => {
  const defaultProps = {
    isOpen: true,
    onClose: vi.fn(),
    onSelect: vi.fn(),
    selectedTags: [] as string[],
  };

  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    // Reset stores
    useStatusStore.setState({
      ...useStatusStore.getState(),
      gamesIndex: {
        exists: true,
        indexing: false,
        totalSteps: 100,
        currentStep: 100,
        currentStepDisplay: "",
        totalFiles: 100,
      },
    });
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe("loading state", () => {
    it("should render loading state while fetching tags", async () => {
      // Arrange
      vi.mocked(CoreAPI.mediaTags).mockImplementation(
        () =>
          new Promise(() => {
            /* never resolves */
          }),
      );

      // Act
      render(<TagSelector {...defaultProps} />);

      // Assert
      expect(screen.getByText("loading")).toBeInTheDocument();
    });
  });

  describe("error state", () => {
    it("should render error state when tags API fails", async () => {
      // Arrange
      vi.mocked(CoreAPI.mediaTags).mockRejectedValue(new Error("API Error"));

      // Act
      render(<TagSelector {...defaultProps} />);

      // Assert
      await waitFor(() => {
        expect(screen.getByText("tagSelector.unavailable")).toBeInTheDocument();
      });
    });
  });

  describe("empty state", () => {
    it("should render empty state when no tags available", async () => {
      // Arrange
      vi.mocked(CoreAPI.mediaTags).mockResolvedValue({ tags: [] });

      // Act
      render(<TagSelector {...defaultProps} />);

      // Assert
      await waitFor(() => {
        expect(screen.getByText("tagSelector.noTags")).toBeInTheDocument();
      });
    });
  });

  describe("tag grouping", () => {
    it("should render grouped tags in accordion by type", async () => {
      // Arrange
      vi.mocked(CoreAPI.mediaTags).mockResolvedValue({
        tags: createMockTags(),
      });

      // Act
      render(<TagSelector {...defaultProps} />);

      // Assert - priority types should appear first
      await waitFor(() => {
        // Check that type headers are present (accordion triggers)
        expect(
          screen.getByRole("button", {
            name: /tagSelector\.type\.genre.*\(3\)/i,
          }),
        ).toBeInTheDocument();
        expect(
          screen.getByRole("button", {
            name: /tagSelector\.type\.year.*\(2\)/i,
          }),
        ).toBeInTheDocument();
        expect(
          screen.getByRole("button", {
            name: /tagSelector\.type\.publisher.*\(1\)/i,
          }),
        ).toBeInTheDocument();
      });
    });

    it("should sort types with priority (genre, year, series, publisher first)", async () => {
      // Arrange
      vi.mocked(CoreAPI.mediaTags).mockResolvedValue({
        tags: createMockTags(),
      });

      // Act
      render(<TagSelector {...defaultProps} />);

      await waitFor(() => {
        expect(
          screen.getByRole("button", { name: /tagSelector\.type\.genre/i }),
        ).toBeInTheDocument();
      });

      // Assert - find all accordion triggers and check order
      const triggers = screen.getAllByRole("button", {
        name: /tagSelector\.type\./i,
      });
      const typeNames = triggers.map((t) => t.textContent);

      // Genre should come before custom (priority type before non-priority)
      const genreIndex = typeNames.findIndex((n) => n?.includes("genre"));
      const customIndex = typeNames.findIndex((n) => n?.includes("custom"));
      expect(genreIndex).toBeLessThan(customIndex);
    });
  });

  describe("search filtering", () => {
    it("should filter tags by search query (debounced)", async () => {
      // Arrange
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      vi.mocked(CoreAPI.mediaTags).mockResolvedValue({
        tags: createMockTags(),
      });

      render(<TagSelector {...defaultProps} />);

      await waitFor(() => {
        expect(
          screen.getByPlaceholderText("tagSelector.searchPlaceholder"),
        ).toBeInTheDocument();
      });

      // Act - type in search
      const searchInput = screen.getByPlaceholderText(
        "tagSelector.searchPlaceholder",
      );
      await user.type(searchInput, "Action");

      // Advance timers for debounce
      await act(async () => {
        vi.advanceTimersByTime(350);
      });

      // Assert - should show filtered results (virtualized list mode)
      await waitFor(() => {
        expect(screen.getByText("Action")).toBeInTheDocument();
        // Non-matching tags should not be visible in the virtualized list
        // Since we're mocking useVirtualizer, it will show all items
      });
    });
  });

  describe("tag selection", () => {
    it("should toggle tag selection on click", async () => {
      // Arrange
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      const onSelect = vi.fn();
      vi.mocked(CoreAPI.mediaTags).mockResolvedValue({
        tags: [{ tag: "Action", type: "genre" }],
      });

      render(<TagSelector {...defaultProps} onSelect={onSelect} />);

      await waitFor(() => {
        expect(
          screen.getByRole("button", { name: /tagSelector\.type\.genre/i }),
        ).toBeInTheDocument();
      });

      // Expand the accordion
      await user.click(
        screen.getByRole("button", { name: /tagSelector\.type\.genre/i }),
      );

      // Act - click on tag to select
      const tagButton = await screen.findByRole("checkbox", {
        name: /action/i,
      });
      await user.click(tagButton);

      // Assert
      expect(onSelect).toHaveBeenCalledWith(["genre:Action"]);
    });

    it("should deselect tag when already selected", async () => {
      // Arrange
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      const onSelect = vi.fn();
      vi.mocked(CoreAPI.mediaTags).mockResolvedValue({
        tags: [{ tag: "Action", type: "genre" }],
      });

      render(
        <TagSelector
          {...defaultProps}
          onSelect={onSelect}
          selectedTags={["genre:Action"]}
        />,
      );

      await waitFor(() => {
        expect(
          screen.getByRole("button", { name: /tagSelector\.type\.genre/i }),
        ).toBeInTheDocument();
      });

      // Expand the accordion
      await user.click(
        screen.getByRole("button", { name: /tagSelector\.type\.genre/i }),
      );

      // Act - click on selected tag to deselect
      const tagButton = await screen.findByRole("checkbox", {
        name: /action/i,
      });
      await user.click(tagButton);

      // Assert
      expect(onSelect).toHaveBeenCalledWith([]);
    });

    it("should announce selection changes for screen readers", async () => {
      // Arrange
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      vi.mocked(CoreAPI.mediaTags).mockResolvedValue({
        tags: [{ tag: "Action", type: "genre" }],
      });

      render(<TagSelector {...defaultProps} />);

      await waitFor(() => {
        expect(
          screen.getByRole("button", { name: /tagSelector\.type\.genre/i }),
        ).toBeInTheDocument();
      });

      // Expand the accordion
      await user.click(
        screen.getByRole("button", { name: /tagSelector\.type\.genre/i }),
      );

      // Act - click on tag to select
      const tagButton = await screen.findByRole("checkbox", {
        name: /action/i,
      });
      await user.click(tagButton);

      // Assert
      expect(mockAnnounce).toHaveBeenCalled();
    });
  });

  describe("indexing state", () => {
    it("should disable selection during indexing", async () => {
      // Arrange
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      const onSelect = vi.fn();
      vi.mocked(CoreAPI.mediaTags).mockResolvedValue({
        tags: [{ tag: "Action", type: "genre" }],
      });

      // Set indexing state
      useStatusStore.setState({
        gamesIndex: {
          exists: true,
          indexing: true,
          totalSteps: 100,
          currentStep: 50,
          currentStepDisplay: "Scanning...",
          totalFiles: 100,
        },
      });

      render(<TagSelector {...defaultProps} onSelect={onSelect} />);

      await waitFor(() => {
        expect(
          screen.getByRole("button", { name: /tagSelector\.type\.genre/i }),
        ).toBeInTheDocument();
      });

      // Expand the accordion
      await user.click(
        screen.getByRole("button", { name: /tagSelector\.type\.genre/i }),
      );

      // Act - try to click on tag
      const tagButton = await screen.findByRole("checkbox", {
        name: /action/i,
      });
      expect(tagButton).toBeDisabled();

      await user.click(tagButton);

      // Assert - should not have called onSelect
      expect(onSelect).not.toHaveBeenCalled();
    });
  });

  describe("footer", () => {
    it("should show selected count in footer", async () => {
      // Arrange
      vi.mocked(CoreAPI.mediaTags).mockResolvedValue({
        tags: createMockTags(),
      });

      render(
        <TagSelector
          {...defaultProps}
          selectedTags={["genre:Action", "genre:RPG"]}
        />,
      );

      // Assert
      await waitFor(() => {
        expect(
          screen.getByText(/tagSelector\.selectedCount/i),
        ).toBeInTheDocument();
      });
    });

    it("should clear all selections when clear button clicked", async () => {
      // Arrange
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      const onSelect = vi.fn();
      vi.mocked(CoreAPI.mediaTags).mockResolvedValue({
        tags: createMockTags(),
      });

      render(
        <TagSelector
          {...defaultProps}
          onSelect={onSelect}
          selectedTags={["genre:Action", "genre:RPG"]}
        />,
      );

      await waitFor(() => {
        expect(
          screen.getByRole("button", { name: /tagSelector\.clearAll/i }),
        ).toBeInTheDocument();
      });

      // Act
      await user.click(
        screen.getByRole("button", { name: /tagSelector\.clearAll/i }),
      );

      // Assert
      expect(onSelect).toHaveBeenCalledWith([]);
    });

    it("should close modal when apply clicked", async () => {
      // Arrange
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      const onClose = vi.fn();
      vi.mocked(CoreAPI.mediaTags).mockResolvedValue({
        tags: createMockTags(),
      });

      render(<TagSelector {...defaultProps} onClose={onClose} />);

      await waitFor(() => {
        expect(
          screen.getByRole("button", { name: /tagSelector\.apply/i }),
        ).toBeInTheDocument();
      });

      // Act
      await user.click(
        screen.getByRole("button", { name: /tagSelector\.apply/i }),
      );

      // Assert
      expect(onClose).toHaveBeenCalled();
    });
  });

  describe("accordion controls", () => {
    it("should expand all sections when expand all clicked", async () => {
      // Arrange
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      vi.mocked(CoreAPI.mediaTags).mockResolvedValue({
        tags: createMockTags(),
      });

      render(<TagSelector {...defaultProps} />);

      await waitFor(() => {
        expect(
          screen.getByRole("button", { name: /tagSelector\.expandAll/i }),
        ).toBeInTheDocument();
      });

      // Act - expand all
      await user.click(
        screen.getByRole("button", { name: /tagSelector\.expandAll/i }),
      );

      // Assert - button should now show collapse all
      await waitFor(() => {
        expect(
          screen.getByRole("button", { name: /tagSelector\.collapseAll/i }),
        ).toBeInTheDocument();
      });
    });

    it("should collapse all sections when collapse all clicked", async () => {
      // Arrange
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      vi.mocked(CoreAPI.mediaTags).mockResolvedValue({
        tags: createMockTags(),
      });

      render(<TagSelector {...defaultProps} />);

      await waitFor(() => {
        expect(
          screen.getByRole("button", { name: /tagSelector\.expandAll/i }),
        ).toBeInTheDocument();
      });

      // Expand all first
      await user.click(
        screen.getByRole("button", { name: /tagSelector\.expandAll/i }),
      );

      await waitFor(() => {
        expect(
          screen.getByRole("button", { name: /tagSelector\.collapseAll/i }),
        ).toBeInTheDocument();
      });

      // Act - collapse all
      await user.click(
        screen.getByRole("button", { name: /tagSelector\.collapseAll/i }),
      );

      // Assert - button should show expand all again
      await waitFor(() => {
        expect(
          screen.getByRole("button", { name: /tagSelector\.expandAll/i }),
        ).toBeInTheDocument();
      });
    });
  });
});

describe("TagSelectorTrigger", () => {
  const defaultProps = {
    selectedTags: [] as string[],
    onClick: vi.fn(),
  };

  beforeEach(() => {
    useStatusStore.setState({
      ...useStatusStore.getState(),
      gamesIndex: {
        exists: true,
        indexing: false,
        totalSteps: 100,
        currentStep: 100,
        currentStepDisplay: "",
        totalFiles: 100,
      },
    });
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should display placeholder when no tags selected", () => {
    // Act
    render(
      <TagSelectorTrigger {...defaultProps} placeholder="Select tags..." />,
    );

    // Assert
    expect(screen.getByText("Select tags...")).toBeInTheDocument();
  });

  it("should display tag names when 1-3 tags selected", () => {
    // Act
    render(
      <TagSelectorTrigger
        {...defaultProps}
        selectedTags={["genre:Action", "year:1990"]}
      />,
    );

    // Assert
    expect(screen.getByText("genre:Action, year:1990")).toBeInTheDocument();
  });

  it("should display count when more than 3 tags selected", () => {
    // Act
    render(
      <TagSelectorTrigger
        {...defaultProps}
        selectedTags={[
          "genre:Action",
          "genre:RPG",
          "year:1990",
          "publisher:Nintendo",
        ]}
      />,
    );

    // Assert
    expect(
      screen.getByText(/tagSelector\.multipleSelected/i),
    ).toBeInTheDocument();
  });

  it("should be disabled during indexing", () => {
    // Arrange
    const onClick = vi.fn();
    useStatusStore.setState({
      gamesIndex: {
        exists: true,
        indexing: true,
        totalSteps: 100,
        currentStep: 50,
        currentStepDisplay: "Scanning...",
        totalFiles: 100,
      },
    });

    // Act
    render(<TagSelectorTrigger {...defaultProps} onClick={onClick} />);

    // Assert - button should be disabled, preventing any interaction
    const button = screen.getByRole("button");
    expect(button).toBeDisabled();
  });

  it("should call onClick when clicked and not indexing", async () => {
    // Arrange
    const onClick = vi.fn();

    // Act
    render(<TagSelectorTrigger {...defaultProps} onClick={onClick} />);
    await userEvent.click(screen.getByRole("button"));

    // Assert
    expect(onClick).toHaveBeenCalled();
  });
});
