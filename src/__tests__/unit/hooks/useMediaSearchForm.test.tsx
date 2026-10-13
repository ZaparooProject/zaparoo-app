import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import {
  useMediaSearchForm,
  type MediaSearchFormOptions,
} from "@/hooks/useMediaSearchForm";
import { CoreAPI } from "@/lib/coreApi";
import { useStatusStore } from "@/lib/store";

const initialStatusState = { ...useStatusStore.getState() };

function renderForm(options: MediaSearchFormOptions = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return renderHook(() => useMediaSearchForm(options), {
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    ),
  });
}

describe("useMediaSearchForm", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(CoreAPI, "systems").mockResolvedValue({ systems: [] });
    useStatusStore.setState({
      ...initialStatusState,
      connected: true,
      coreVersion: "2.18.0",
      coreVersionPending: false,
      gamesIndex: { ...initialStatusState.gamesIndex, exists: true },
    });
  });

  it("submits the trimmed query with the draft filters", () => {
    const onSearch = vi.fn();
    const { result } = renderForm({ onSearch });

    act(() => result.current.setQuery("  mario "));
    act(() => result.current.setSystem("snes"));
    act(() => result.current.submit());

    expect(onSearch).toHaveBeenCalledWith(
      { query: "mario", system: "snes", tags: [] },
      "submit",
    );
    expect(result.current.results).toMatchObject({
      query: "mario",
      systems: ["snes"],
      hasSearched: true,
    });
  });

  it("needs a query, system or tag on a Core without browse-all search", () => {
    useStatusStore.setState({ coreVersion: "2.9.1" });
    const { result } = renderForm();
    expect(result.current.canSubmit).toBe(false);

    act(() => result.current.setQuery("mario"));

    expect(result.current.canSubmit).toBe(true);
  });

  it("counts fixed tags as a constraint and sends them without showing them", () => {
    useStatusStore.setState({ coreVersion: "2.9.1" });
    const onSearch = vi.fn();
    const { result } = renderForm({
      fixedTags: ["user:favorite"],
      initialDraft: { tags: ["user:favorite", "genre:rpg"] },
      onSearch,
    });

    expect(result.current.tags).toEqual(["genre:rpg"]);
    expect(result.current.canSubmit).toBe(true);
    act(() => result.current.setTags([]));
    act(() => result.current.submit());

    expect(onSearch).toHaveBeenCalledWith(
      { query: "", system: "all", tags: [] },
      "submit",
    );
    expect(result.current.results.tags).toEqual(["user:favorite"]);
  });

  it("holds a seeded tag search on a Core without tags unless told to drop them", () => {
    useStatusStore.setState({ coreVersion: "2.6.2" });
    const initialSearch = {
      query: "zelda",
      system: "all",
      tags: ["genre:rpg"],
    };

    const { result: held } = renderForm({ initialSearch });
    expect(held.current.results.hasSearched).toBe(false);

    const { result: dropped } = renderForm({
      initialSearch,
      dropUnsupportedTags: true,
    });
    expect(dropped.current.results).toMatchObject({
      hasSearched: true,
      query: "zelda",
      tags: [],
    });
  });

  it("reports filter changes and applies a complete search", () => {
    const onSearch = vi.fn();
    const onFiltersChange = vi.fn();
    const { result } = renderForm({ onSearch, onFiltersChange });

    act(() => result.current.setTags(["genre:rpg"]));
    expect(onFiltersChange).toHaveBeenLastCalledWith({
      system: "all",
      tags: ["genre:rpg"],
    });

    const recent = { query: "sonic", system: "genesis", tags: [] };
    act(() => result.current.apply(recent));

    expect(result.current.query).toBe("sonic");
    expect(result.current.system).toBe("genesis");
    expect(onFiltersChange).toHaveBeenLastCalledWith({
      system: "genesis",
      tags: [],
    });
    expect(onSearch).toHaveBeenCalledWith(recent, "apply");
  });

  it("is unavailable while disconnected", () => {
    useStatusStore.setState({ connected: false });
    const { result } = renderForm();

    expect(result.current.canUseSearch).toBe(false);
    act(() => result.current.setQuery("mario"));
    expect(result.current.canSubmit).toBe(false);
  });
});
