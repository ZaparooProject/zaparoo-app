import { useState, useEffect, useCallback } from "react";
import { Preferences } from "@capacitor/preferences";

export interface RecentSearch {
  query: string;
  system: string;
  tags: string[];
  timestamp: number;
}

const RECENT_SEARCHES_KEY = "recentSearches";
const MAX_RECENT_SEARCHES = 10;

export function useRecentSearches() {
  const [recentSearches, setRecentSearches] = useState<RecentSearch[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Load recent searches from preferences on mount
  useEffect(() => {
    const loadRecentSearches = async () => {
      try {
        const { value } = await Preferences.get({ key: RECENT_SEARCHES_KEY });
        if (value) {
          const parsed = JSON.parse(value) as RecentSearch[];
          setRecentSearches(parsed);
        }
      } catch (error) {
        console.warn("Failed to load recent searches:", error);
      } finally {
        setIsLoading(false);
      }
    };

    loadRecentSearches();
  }, []);

  // Save searches to preferences
  const saveToPreferences = useCallback(async (searches: RecentSearch[]) => {
    try {
      await Preferences.set({
        key: RECENT_SEARCHES_KEY,
        value: JSON.stringify(searches)
      });
    } catch (error) {
      console.warn("Failed to save recent searches:", error);
    }
  }, []);

  // Check if two searches are identical (ignoring timestamp)
  const areSearchesEqual = useCallback((a: RecentSearch, b: RecentSearch) => {
    return (
      a.query === b.query &&
      a.system === b.system &&
      a.tags.length === b.tags.length &&
      a.tags.every(tag => b.tags.includes(tag))
    );
  }, []);

  // Add a new search to recent searches
  const addRecentSearch = useCallback(async (search: Omit<RecentSearch, "timestamp">) => {
    // Skip if search has no meaningful parameters
    if (!search.query.trim() && search.system === "all" && search.tags.length === 0) {
      return;
    }

    const newSearch: RecentSearch = {
      ...search,
      timestamp: Date.now()
    };

    setRecentSearches(current => {
      // Remove any existing identical search
      const filtered = current.filter(existing => !areSearchesEqual(existing, newSearch));

      // Add new search at the beginning and limit to max items
      const updated = [newSearch, ...filtered].slice(0, MAX_RECENT_SEARCHES);

      // Save to preferences
      saveToPreferences(updated);

      return updated;
    });
  }, [areSearchesEqual, saveToPreferences]);

  // Clear all recent searches
  const clearRecentSearches = useCallback(async () => {
    setRecentSearches([]);
    await saveToPreferences([]);
  }, [saveToPreferences]);

  // Get formatted display text for a search
  const getSearchDisplayText = useCallback((search: RecentSearch) => {
    const parts: string[] = [];

    if (search.query.trim()) {
      parts.push(`"${search.query.trim()}"`);
    }

    if (search.system !== "all") {
      parts.push(`System: ${search.system}`);
    }

    if (search.tags.length > 0) {
      parts.push(`Tags: ${search.tags.join(", ")}`);
    }

    return parts.length > 0 ? parts.join(" • ") : "All Media";
  }, []);

  return {
    recentSearches,
    isLoading,
    addRecentSearch,
    clearRecentSearches,
    getSearchDisplayText
  };
}