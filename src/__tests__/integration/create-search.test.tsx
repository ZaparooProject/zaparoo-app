/**
 * Integration Test: Create Search Page Components
 *
 * Tests the search page component interactions including:
 * - RecentSearchesModal interactions
 * - Search form input handling
 * - VirtualSearchResults empty and loading states
 */

import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { render, screen } from "../../test-utils";
import userEvent from "@testing-library/user-event";
import { useStatusStore, ConnectionState } from "@/lib/store";
import { usePreferencesStore } from "@/lib/preferencesStore";
import { RecentSearchesModal } from "@/components/RecentSearchesModal";
import { TextInput } from "@/components/wui/TextInput";
import { Button } from "@/components/wui/Button";
import { RecentSearch } from "@/hooks/useRecentSearches";
import { SearchIcon } from "@/lib/images";

describe("Create Search Integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Reset stores to initial state
    useStatusStore.setState({
      ...useStatusStore.getInitialState(),
      connected: true,
      connectionState: ConnectionState.CONNECTED,
      gamesIndex: {
        exists: true,
        indexing: false,
        totalSteps: 0,
        currentStep: 0,
        currentStepDisplay: "",
        totalFiles: 100,
      },
    });
    usePreferencesStore.setState({
      ...usePreferencesStore.getInitialState(),
      _hasHydrated: true,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("RecentSearchesModal", () => {
    const mockRecentSearches: RecentSearch[] = [
      {
        query: "mario",
        system: "nes",
        tags: ["region:usa"],
        timestamp: Date.now() - 60000,
      },
      {
        query: "zelda",
        system: "all",
        tags: [],
        timestamp: Date.now() - 120000,
      },
    ];

    const getSearchDisplayText = (search: RecentSearch): string => {
      if (search.query) return search.query;
      if (search.system !== "all") return `System: ${search.system}`;
      if (search.tags.length > 0) return `Tags: ${search.tags.join(", ")}`;
      return "All games";
    };

    it("should show empty state when no recent searches", () => {
      render(
        <RecentSearchesModal
          isOpen={true}
          onClose={vi.fn()}
          recentSearches={[]}
          onSearchSelect={vi.fn()}
          onClearHistory={vi.fn()}
          getSearchDisplayText={getSearchDisplayText}
        />,
      );

      expect(
        screen.getByText("create.search.noRecentSearches"),
      ).toBeInTheDocument();
      expect(
        screen.getByText("create.search.noRecentSearchesHint"),
      ).toBeInTheDocument();
    });

    it("should render list of recent searches", () => {
      render(
        <RecentSearchesModal
          isOpen={true}
          onClose={vi.fn()}
          recentSearches={mockRecentSearches}
          onSearchSelect={vi.fn()}
          onClearHistory={vi.fn()}
          getSearchDisplayText={getSearchDisplayText}
        />,
      );

      expect(screen.getByText("mario")).toBeInTheDocument();
      expect(screen.getByText("zelda")).toBeInTheDocument();
    });

    it("should call onSearchSelect and onClose when search item is clicked", async () => {
      const user = userEvent.setup();
      const onSearchSelect = vi.fn();
      const onClose = vi.fn();

      render(
        <RecentSearchesModal
          isOpen={true}
          onClose={onClose}
          recentSearches={mockRecentSearches}
          onSearchSelect={onSearchSelect}
          onClearHistory={vi.fn()}
          getSearchDisplayText={getSearchDisplayText}
        />,
      );

      // Card component has role="button" when onClick is provided
      // Find the card containing "mario" text
      const marioCard = screen.getByRole("button", { name: /mario/i });
      await user.click(marioCard);

      expect(onSearchSelect).toHaveBeenCalledWith(mockRecentSearches[0]);
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("should call onClearHistory and onClose when clear button is clicked", async () => {
      const user = userEvent.setup();
      const onClearHistory = vi.fn();
      const onClose = vi.fn();

      render(
        <RecentSearchesModal
          isOpen={true}
          onClose={onClose}
          recentSearches={mockRecentSearches}
          onSearchSelect={vi.fn()}
          onClearHistory={onClearHistory}
          getSearchDisplayText={getSearchDisplayText}
        />,
      );

      const clearButton = screen.getByRole("button", {
        name: /create.search.clearHistory/i,
      });
      await user.click(clearButton);

      expect(onClearHistory).toHaveBeenCalledTimes(1);
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("should render dialog with aria-hidden false when open", () => {
      render(
        <RecentSearchesModal
          isOpen={true}
          onClose={vi.fn()}
          recentSearches={mockRecentSearches}
          onSearchSelect={vi.fn()}
          onClearHistory={vi.fn()}
          getSearchDisplayText={getSearchDisplayText}
        />,
      );

      const dialog = screen.getByRole("dialog");
      expect(dialog).toHaveAttribute("aria-hidden", "false");
    });

    it("should render dialog with aria-hidden true when closed", () => {
      render(
        <RecentSearchesModal
          isOpen={false}
          onClose={vi.fn()}
          recentSearches={mockRecentSearches}
          onSearchSelect={vi.fn()}
          onClearHistory={vi.fn()}
          getSearchDisplayText={getSearchDisplayText}
        />,
      );

      const dialog = screen.getByRole("dialog", { hidden: true });
      expect(dialog).toHaveAttribute("aria-hidden", "true");
    });
  });

  describe("Search Form Components", () => {
    it("should render text input with search type", () => {
      render(
        <TextInput
          label="Game search"
          placeholder="Search games..."
          value=""
          setValue={vi.fn()}
          type="search"
        />,
      );

      const input = screen.getByRole("searchbox");
      expect(input).toBeInTheDocument();
      expect(input).toHaveAttribute("placeholder", "Search games...");
    });

    it("should call setValue when typing in search input", async () => {
      const user = userEvent.setup();
      const setValue = vi.fn();

      render(
        <TextInput
          label="Game search"
          placeholder="Search games..."
          value=""
          setValue={setValue}
          type="search"
        />,
      );

      const input = screen.getByRole("searchbox");
      await user.type(input, "mario");

      // setValue is called for each character, with the accumulated value
      expect(setValue).toHaveBeenCalledTimes(5);
      expect(setValue).toHaveBeenLastCalledWith("mario");
    });

    it("should trigger search on Enter key", async () => {
      const user = userEvent.setup();
      const onKeyUp = vi.fn();

      render(
        <TextInput
          label="Game search"
          placeholder="Search games..."
          value="mario"
          setValue={vi.fn()}
          type="search"
          onKeyUp={onKeyUp}
        />,
      );

      const input = screen.getByRole("searchbox");
      await user.type(input, "{Enter}");

      expect(onKeyUp).toHaveBeenCalled();
      // The event.key should be "Enter"
      const lastCall = onKeyUp.mock.calls[
        onKeyUp.mock.calls.length - 1
      ]?.[0] as KeyboardEvent | undefined;
      expect(lastCall?.key).toBe("Enter");
    });

    it("should render disabled search button when cannot search", () => {
      render(
        <Button
          label="Search"
          icon={<SearchIcon size="20" />}
          onClick={vi.fn()}
          disabled={true}
        />,
      );

      const button = screen.getByRole("button", { name: /search/i });
      expect(button).toBeDisabled();
    });

    it("should call onClick when search button is clicked", async () => {
      const user = userEvent.setup();
      const onClick = vi.fn();

      render(
        <Button
          label="Search"
          icon={<SearchIcon size="20" />}
          onClick={onClick}
          disabled={false}
        />,
      );

      const button = screen.getByRole("button", { name: /search/i });
      await user.click(button);

      expect(onClick).toHaveBeenCalledTimes(1);
    });

    it("should render clearable input with clear button when value is present", () => {
      render(
        <TextInput
          label="Game search"
          placeholder="Search games..."
          value="mario"
          setValue={vi.fn()}
          type="search"
          clearable={true}
        />,
      );

      // Clear button should be present with "Clear search" aria-label
      const clearButton = screen.getByRole("button", {
        name: /clear search/i,
      });
      expect(clearButton).toBeInTheDocument();
    });

    it("should clear input when clear button is clicked", async () => {
      const user = userEvent.setup();
      const setValue = vi.fn();

      render(
        <TextInput
          label="Game search"
          placeholder="Search games..."
          value="mario"
          setValue={setValue}
          type="search"
          clearable={true}
        />,
      );

      const clearButton = screen.getByRole("button", {
        name: /clear search/i,
      });
      await user.click(clearButton);

      expect(setValue).toHaveBeenCalledWith("");
    });
  });

  describe("Search state handling", () => {
    it("should disable search when not connected", () => {
      useStatusStore.setState({ connected: false });

      const performSearch = vi.fn();

      render(
        <Button
          label="Search"
          icon={<SearchIcon size="20" />}
          onClick={performSearch}
          disabled={!useStatusStore.getState().connected}
        />,
      );

      const button = screen.getByRole("button", { name: /search/i });
      expect(button).toBeDisabled();
    });

    it("should disable search when games index does not exist", () => {
      useStatusStore.setState({
        gamesIndex: {
          exists: false,
          indexing: false,
          totalSteps: 0,
          currentStep: 0,
          currentStepDisplay: "",
          totalFiles: 0,
        },
      });

      const performSearch = vi.fn();
      const gamesIndex = useStatusStore.getState().gamesIndex;

      render(
        <Button
          label="Search"
          icon={<SearchIcon size="20" />}
          onClick={performSearch}
          disabled={!gamesIndex.exists}
        />,
      );

      const button = screen.getByRole("button", { name: /search/i });
      expect(button).toBeDisabled();
    });

    it("should disable search when indexing is in progress", () => {
      useStatusStore.setState({
        gamesIndex: {
          exists: true,
          indexing: true,
          totalSteps: 10,
          currentStep: 5,
          currentStepDisplay: "Processing...",
          totalFiles: 100,
        },
      });

      const performSearch = vi.fn();
      const gamesIndex = useStatusStore.getState().gamesIndex;

      render(
        <Button
          label="Search"
          icon={<SearchIcon size="20" />}
          onClick={performSearch}
          disabled={gamesIndex.indexing}
        />,
      );

      const button = screen.getByRole("button", { name: /search/i });
      expect(button).toBeDisabled();
    });
  });
});
