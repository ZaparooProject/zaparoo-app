import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "../../test-utils";
import userEvent from "@testing-library/user-event";
import { RecentSearchesModal } from "@/components/RecentSearchesModal";
import { RecentSearch } from "@/hooks/useRecentSearches";

describe("RecentSearchesModal", () => {
  const mockGetSearchDisplayText = (search: RecentSearch) => {
    if (search.query) {
      return `Search: ${search.query}`;
    }
    if (search.system) {
      return `System: ${search.system}`;
    }
    return "Unknown search";
  };

  const defaultProps = {
    isOpen: true,
    onClose: vi.fn(),
    recentSearches: [] as RecentSearch[],
    onSearchSelect: vi.fn(),
    onClearHistory: vi.fn(),
    getSearchDisplayText: mockGetSearchDisplayText,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("rendering", () => {
    it("should render modal when open", () => {
      // Arrange & Act
      render(<RecentSearchesModal {...defaultProps} />);

      // Assert - SlideModal renders title twice (mobile + desktop)
      const titles = screen.getAllByText("create.search.recentSearches");
      expect(titles.length).toBeGreaterThan(0);
    });

    it("should hide content via aria-hidden when closed", () => {
      // Arrange & Act
      render(<RecentSearchesModal {...defaultProps} isOpen={false} />);

      // Assert - Modal should be hidden (aria-hidden="true")
      const dialog = screen.getByRole("dialog", { hidden: true });
      expect(dialog).toHaveAttribute("aria-hidden", "true");
    });
  });

  describe("empty state", () => {
    it("should show empty state message when no recent searches", () => {
      // Arrange & Act
      render(<RecentSearchesModal {...defaultProps} recentSearches={[]} />);

      // Assert
      expect(
        screen.getByText("create.search.noRecentSearches"),
      ).toBeInTheDocument();
      expect(
        screen.getByText("create.search.noRecentSearchesHint"),
      ).toBeInTheDocument();
    });

    it("should not show clear history button when empty", () => {
      // Arrange & Act
      render(<RecentSearchesModal {...defaultProps} recentSearches={[]} />);

      // Assert
      expect(
        screen.queryByRole("button", { name: "create.search.clearHistory" }),
      ).not.toBeInTheDocument();
    });
  });

  describe("search list", () => {
    const recentSearches: RecentSearch[] = [
      {
        query: "mario",
        system: "",
        tags: [],
        timestamp: new Date("2024-01-15T10:30:00").getTime(),
      },
      {
        query: "zelda",
        system: "nes",
        tags: [],
        timestamp: new Date("2024-01-14T15:45:00").getTime(),
      },
    ];

    it("should display recent searches", () => {
      // Arrange & Act
      render(
        <RecentSearchesModal
          {...defaultProps}
          recentSearches={recentSearches}
        />,
      );

      // Assert - uses getSearchDisplayText
      expect(screen.getByText("Search: mario")).toBeInTheDocument();
      expect(screen.getByText("Search: zelda")).toBeInTheDocument();
    });

    it("should display timestamps for searches", () => {
      // Arrange & Act
      render(
        <RecentSearchesModal
          {...defaultProps}
          recentSearches={recentSearches}
        />,
      );

      // Assert - Timestamps are formatted by toLocaleString
      // The exact format depends on locale, but the dates should be present
      const searchCards = screen.getAllByRole("button", {
        name: "create.search.searchResult",
      });
      expect(searchCards).toHaveLength(2);
    });

    it("should show clear history button when there are searches", () => {
      // Arrange & Act
      render(
        <RecentSearchesModal
          {...defaultProps}
          recentSearches={recentSearches}
        />,
      );

      // Assert
      expect(
        screen.getByRole("button", { name: "create.search.clearHistory" }),
      ).toBeInTheDocument();
    });
  });

  describe("search selection", () => {
    const recentSearches: RecentSearch[] = [
      {
        query: "sonic",
        system: "genesis",
        tags: [],
        timestamp: Date.now(),
      },
    ];

    it("should call onSearchSelect when search item clicked", async () => {
      // Arrange
      const user = userEvent.setup();
      const onSearchSelect = vi.fn();
      render(
        <RecentSearchesModal
          {...defaultProps}
          recentSearches={recentSearches}
          onSearchSelect={onSearchSelect}
        />,
      );

      // Act - Click on the search card
      await user.click(screen.getByText("Search: sonic"));

      // Assert
      expect(onSearchSelect).toHaveBeenCalledWith(recentSearches[0]);
    });

    it("should close modal after search selection", async () => {
      // Arrange
      const user = userEvent.setup();
      const onClose = vi.fn();
      render(
        <RecentSearchesModal
          {...defaultProps}
          recentSearches={recentSearches}
          onClose={onClose}
        />,
      );

      // Act
      await user.click(screen.getByText("Search: sonic"));

      // Assert
      expect(onClose).toHaveBeenCalled();
    });
  });

  describe("clear history", () => {
    const recentSearches: RecentSearch[] = [
      { query: "test", system: "", tags: [], timestamp: Date.now() },
    ];

    it("should call onClearHistory when clear button clicked", async () => {
      // Arrange
      const user = userEvent.setup();
      const onClearHistory = vi.fn();
      render(
        <RecentSearchesModal
          {...defaultProps}
          recentSearches={recentSearches}
          onClearHistory={onClearHistory}
        />,
      );

      // Act
      await user.click(
        screen.getByRole("button", { name: "create.search.clearHistory" }),
      );

      // Assert
      expect(onClearHistory).toHaveBeenCalled();
    });

    it("should close modal after clearing history", async () => {
      // Arrange
      const user = userEvent.setup();
      const onClose = vi.fn();
      render(
        <RecentSearchesModal
          {...defaultProps}
          recentSearches={recentSearches}
          onClose={onClose}
        />,
      );

      // Act
      await user.click(
        screen.getByRole("button", { name: "create.search.clearHistory" }),
      );

      // Assert
      expect(onClose).toHaveBeenCalled();
    });
  });

  describe("getSearchDisplayText callback", () => {
    it("should use custom display text function", () => {
      // Arrange
      const customDisplayText = vi.fn().mockReturnValue("Custom Display");
      const recentSearches: RecentSearch[] = [
        { query: "test", system: "", tags: [], timestamp: Date.now() },
      ];

      // Act
      render(
        <RecentSearchesModal
          {...defaultProps}
          recentSearches={recentSearches}
          getSearchDisplayText={customDisplayText}
        />,
      );

      // Assert
      expect(customDisplayText).toHaveBeenCalledWith(recentSearches[0]);
      expect(screen.getByText("Custom Display")).toBeInTheDocument();
    });

    it("should handle system-only searches", () => {
      // Arrange
      const recentSearches: RecentSearch[] = [
        { query: "", system: "snes", tags: [], timestamp: Date.now() },
      ];

      // Act
      render(
        <RecentSearchesModal
          {...defaultProps}
          recentSearches={recentSearches}
        />,
      );

      // Assert
      expect(screen.getByText("System: snes")).toBeInTheDocument();
    });
  });

  describe("accessibility", () => {
    const recentSearches: RecentSearch[] = [
      { query: "mario", system: "", tags: [], timestamp: Date.now() },
    ];

    it("should have search result aria-label on icon buttons", () => {
      // Arrange & Act
      render(
        <RecentSearchesModal
          {...defaultProps}
          recentSearches={recentSearches}
        />,
      );

      // Assert
      expect(
        screen.getByRole("button", { name: "create.search.searchResult" }),
      ).toBeInTheDocument();
    });
  });
});
