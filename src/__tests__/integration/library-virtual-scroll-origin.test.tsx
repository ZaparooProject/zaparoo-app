import { createRef, type ReactNode, type RefObject } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor, within } from "@/test-utils";
import {
  LibraryBrowseList,
  type LibraryBrowseListHandle,
} from "@/components/library/LibraryBrowseList";
import { usePreferencesStore } from "@/lib/preferencesStore";
import { VirtualSearchResults } from "@/components/VirtualSearchResults";
import { CoreAPI } from "@/lib/coreApi";
import { useStatusStore } from "@/lib/store";
import { seedActiveDevice } from "@/test-utils/deviceRegistry";
import type { MediaBrowseEntry } from "@/lib/models";

const entries: MediaBrowseEntry[] = Array.from({ length: 30 }, (_, index) => ({
  type: "media",
  name: `Game ${index}`,
  path: `/roms/NES/Game ${index}.nes`,
  tags: [],
}));

function renderList(
  renderContent?: (scrollRef: RefObject<HTMLDivElement | null>) => ReactNode,
  rowHeight = 88,
) {
  let listTop = 160;
  let viewport: HTMLDivElement | null = null;
  const scrollRef = createRef<HTMLDivElement>();
  const listRef = createRef<LibraryBrowseListHandle>();
  const originalRect = HTMLElement.prototype.getBoundingClientRect;
  const originalHeight = Object.getOwnPropertyDescriptor(
    HTMLElement.prototype,
    "offsetHeight",
  )?.get;
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
    function (this: HTMLElement) {
      if (this === viewport) return new DOMRect(0, 0, 640, 480);
      if (this.getAttribute("role") === "list")
        return new DOMRect(
          0,
          listTop - (viewport?.scrollTop ?? 0),
          640,
          30 * rowHeight,
        );
      const index = this.getAttribute("data-index");
      if (index !== null)
        return new DOMRect(
          0,
          listTop + Number(index) * rowHeight - (viewport?.scrollTop ?? 0),
          640,
          rowHeight,
        );
      return originalRect.call(this);
    },
  );
  vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockImplementation(
    function (this: HTMLElement) {
      if (this === viewport) return 480;
      if (this.hasAttribute("data-index")) return rowHeight;
      return originalHeight?.call(this) ?? 0;
    },
  );
  const scrollTo = vi.fn((options?: { top?: number } | number, y?: number) => {
    if (!viewport) return;
    const next = typeof options === "number" ? (y ?? 0) : (options?.top ?? 0);
    if (viewport.scrollTop === next) return;
    viewport.scrollTop = next;
    const target = viewport;
    queueMicrotask(() => target.dispatchEvent(new Event("scroll")));
  });
  render(
    <div
      ref={(element) => {
        scrollRef.current = element;
        viewport = element;
        if (element) {
          element.style.paddingTop = "32px";
          Object.defineProperty(element, "offsetWidth", {
            configurable: true,
            value: 640,
          });
          Object.defineProperty(element, "scrollHeight", {
            configurable: true,
            get: () => listTop + 30 * rowHeight,
          });
          element.scrollTo = scrollTo;
        }
      }}
    >
      <h1>Library</h1>
      {renderContent ? (
        renderContent(scrollRef)
      ) : (
        <LibraryBrowseList
          ref={listRef}
          entries={entries}
          systemId="NES"
          deviceKey="device-a"
          scrollRef={scrollRef}
          hasNextPage={false}
          isFetchingNextPage={false}
          imagesPaused
          interactionDisabled={false}
          onFetchMore={vi.fn()}
          onSelect={vi.fn()}
        />
      )}
    </div>,
  );
  return {
    listRef,
    scrollRef,
    scrollTo,
    position(next: number) {
      listTop = next;
    },
  };
}

describe("Library virtual rows below scrolling page content", () => {
  beforeEach(() => {
    usePreferencesStore.setState({
      ...usePreferencesStore.getInitialState(),
      _hasHydrated: true,
      accessibleLists: false,
    });
  });
  afterEach(() => vi.restoreAllMocks());

  it("keeps first search results reachable below tall preceding filters", async () => {
    useStatusStore.setState({
      connected: true,
      gamesIndex: { exists: true, indexing: false },
      coreVersion: "2.23.0",
      coreVersionPending: false,
    });
    await seedActiveDevice({ recordId: "device-a" });
    vi.spyOn(CoreAPI, "mediaSearch").mockResolvedValue({
      results: entries.map((item, index) => ({
        name: `Game ${index}`,
        path: item.path,
        system: { id: "NES", name: "Nintendo" },
        tags: [],
      })),
      total: 30,
    });
    const view = renderList(
      (scrollRef) => (
        <VirtualSearchResults
          query="Game"
          systems={["NES"]}
          selectedResult={null}
          setSelectedResult={vi.fn()}
          hasSearched
          scrollContainerRef={scrollRef}
        />
      ),
      93,
    );
    view.position(1600);
    const list = await screen.findByRole("list", {
      name: "create.search.resultsLabel",
    });
    await act(async () => {
      view.scrollTo({ top: 1600 });
      await Promise.resolve();
    });
    expect(
      await screen.findByRole("button", { name: /^Game 0(?:\s|$)/ }),
    ).toBeInTheDocument();
    expect(within(list).getAllByRole("listitem").length).toBeLessThan(30);
    await act(async () => {
      view.position(2400);
      window.dispatchEvent(new Event("resize"));
      view.scrollTo({ top: 2400 });
      await Promise.resolve();
    });
    expect(
      screen.getByRole("list", { name: "create.search.resultsLabel" }),
    ).toBe(list);
    expect(
      await screen.findByRole("button", { name: /^Game 0(?:\s|$)/ }),
    ).toBeInTheDocument();
  });

  it("uses measured list origin and header clearance for letter jumps", async () => {
    const view = renderList();
    await screen.findByRole("button", { name: /^Game 0(?:\s|$)/ });
    await act(async () => {
      view.listRef.current?.scrollToIndex(5);
      await Promise.resolve();
    });
    await waitFor(() => expect(view.scrollRef.current?.scrollTop).toBe(568));
    expect(
      screen.getByRole("button", { name: /^Game 5(?:\s|$)/ }),
    ).toBeInTheDocument();
    expect(view.scrollTo).toHaveBeenCalled();
  });

  it("recomputes jump origin when layout moves same mounted list", async () => {
    const view = renderList();
    const list = await screen.findByRole("list");
    await screen.findByRole("button", { name: /^Game 0(?:\s|$)/ });
    await act(() => {
      view.position(240);
      window.dispatchEvent(new Event("resize"));
    });
    expect(screen.getByRole("list")).toBe(list);
    await act(async () => {
      view.listRef.current?.scrollToIndex(5);
      await Promise.resolve();
    });
    await waitFor(() => expect(view.scrollRef.current?.scrollTop).toBe(648));
    expect(
      screen.getByRole("button", { name: /^Game 5(?:\s|$)/ }),
    ).toBeInTheDocument();
  });
});
