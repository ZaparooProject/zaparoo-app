import { createRef, type ComponentProps } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { findA11yViolations, fireEvent, render, screen } from "@/test-utils";
import {
  LibraryBrowseList,
  type LibraryBrowseListHandle,
} from "@/components/library/LibraryBrowseList";
import { usePreferencesStore } from "@/lib/preferencesStore";
import type { MediaBrowseEntry } from "@/lib/models";

const mockMeasure = vi.fn();
const mockScrollToIndex = vi.fn();

vi.mock("@/hooks/useScreenReaderEnabled", () => ({
  useScreenReaderEnabled: () => false,
}));

vi.mock("@tanstack/react-virtual", () => ({
  useVirtualizer: vi.fn(() => ({
    getVirtualItems: () => [{ index: 0, key: "row-0", start: 0, size: 88 }],
    getTotalSize: () => 176,
    measureElement: vi.fn(),
    measure: mockMeasure,
    scrollToIndex: mockScrollToIndex,
  })),
}));

vi.mock("@/components/library/LibraryArtwork", () => ({
  LibraryArtwork: () => <span data-testid="artwork" aria-hidden="true" />,
}));

const entries: MediaBrowseEntry[] = [
  {
    type: "media",
    mediaId: 1,
    name: "Game One",
    path: "/games/one.rom",
    systemId: "snes",
    tags: [],
    disambiguatingTags: [],
  },
  {
    type: "media",
    mediaId: 2,
    name: "Game Two",
    path: "/games/two.rom",
    systemId: "snes",
    tags: [],
    disambiguatingTags: [],
  },
];

function renderList(
  overrides: Partial<ComponentProps<typeof LibraryBrowseList>> = {},
) {
  const scrollContainer = document.createElement("div");
  return render(
    <LibraryBrowseList
      entries={entries}
      systemId="snes"
      targetDeviceAddress="device-a"
      scrollRef={{ current: scrollContainer }}
      hasNextPage={false}
      isFetchingNextPage={false}
      imagesPaused={false}
      interactionDisabled={false}
      onFetchMore={vi.fn()}
      onSelect={vi.fn()}
      {...overrides}
    />,
  );
}

describe("LibraryBrowseList", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    usePreferencesStore.setState({
      accessibleLists: false,
      showFilenames: false,
      textZoomLevel: 1,
    });
  });

  it("should have no detectable violations in accessible-list mode", async () => {
    usePreferencesStore.setState({ accessibleLists: true });
    const { baseElement } = renderList({ hasNextPage: true });

    expect(await findA11yViolations(baseElement)).toEqual([]);
  });

  it("should expose positional metadata for mounted virtual rows", () => {
    renderList({ hasNextPage: true });

    const item = screen.getByRole("listitem");
    expect(item).toHaveAttribute("aria-posinset", "1");
    expect(item).toHaveAttribute("aria-setsize", "-1");
    expect(
      screen.getByRole("button", { name: "Game One" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Game Two" }),
    ).not.toBeInTheDocument();
  });

  it("should expose every loaded row and explicit pagination in accessible mode", () => {
    const onFetchMore = vi.fn();
    usePreferencesStore.setState({ accessibleLists: true });
    renderList({ hasNextPage: true, onFetchMore });

    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(
      screen.getByRole("button", { name: "Game One" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Game Two" }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "library.loadMore" }));
    expect(onFetchMore).toHaveBeenCalledTimes(1);
  });

  it("should keep ordinary rows at 88px for default text size", () => {
    renderList();

    expect(screen.getByRole("listitem")).toHaveStyle({ height: "88px" });
  });

  it("should permit measured row growth when text zoom is increased", () => {
    usePreferencesStore.setState({ textZoomLevel: 1.3 });
    renderList();

    const item = screen.getByRole("listitem");
    expect(item).toHaveStyle({ minHeight: "115px" });
    expect(item).not.toHaveStyle({ height: "88px" });
    expect(mockMeasure).toHaveBeenCalled();
  });

  it("should use normal-flow rows for accessible index jumps", () => {
    const listRef = createRef<LibraryBrowseListHandle>();
    const scrollIntoView = vi.fn();
    HTMLElement.prototype.scrollIntoView = scrollIntoView;
    usePreferencesStore.setState({ accessibleLists: true });

    render(
      <LibraryBrowseList
        ref={listRef}
        entries={entries}
        systemId="snes"
        targetDeviceAddress="device-a"
        scrollRef={{ current: document.createElement("div") }}
        hasNextPage={false}
        isFetchingNextPage={false}
        imagesPaused={false}
        interactionDisabled={false}
        onFetchMore={vi.fn()}
        onSelect={vi.fn()}
      />,
    );

    listRef.current?.scrollToIndex(1);

    expect(scrollIntoView).toHaveBeenCalledWith({ block: "start" });
    expect(mockScrollToIndex).not.toHaveBeenCalled();
  });
});
