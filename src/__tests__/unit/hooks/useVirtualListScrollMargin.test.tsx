import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@/test-utils";
import { useVirtualListScrollMargin } from "@/hooks/useVirtualListScrollMargin";

class ControlledResizeObserver {
  static instances: ControlledResizeObserver[] = [];
  targets = new Set<Element>();
  constructor(private callback: () => void) {
    ControlledResizeObserver.instances.push(this);
  }
  observe(target: Element) {
    this.targets.add(target);
  }
  unobserve(target: Element) {
    this.targets.delete(target);
  }
  disconnect() {
    this.targets.clear();
  }
  notify(target: Element) {
    if (this.targets.has(target)) this.callback();
  }
}

const fixtures = new Set<HTMLElement>();

function fixture() {
  const scroller = document.createElement("div");
  const header = document.createElement("header");
  const content = document.createElement("div");
  const filters = document.createElement("div");
  const list = document.createElement("div");
  content.append(filters, list);
  scroller.append(header, content);
  document.body.append(scroller);
  fixtures.add(scroller);
  let listTop = 120;
  scroller.style.paddingTop = "24px";
  Object.defineProperty(scroller, "clientTop", { value: 2 });
  vi.spyOn(scroller, "getBoundingClientRect").mockImplementation(
    () => new DOMRect(0, 20, 640, 480),
  );
  vi.spyOn(list, "getBoundingClientRect").mockImplementation(
    () => new DOMRect(0, 22 + listTop - scroller.scrollTop, 640, 2000),
  );
  const scrollRef = { current: scroller };
  return {
    scroller,
    header,
    filters,
    list,
    scrollRef,
    position(next: number) {
      listTop = next;
    },
    notify(target: Element) {
      ControlledResizeObserver.instances.forEach((observer) =>
        observer.notify(target),
      );
    },
  };
}

describe("virtual list page geometry", () => {
  beforeEach(() => {
    ControlledResizeObserver.instances = [];
    vi.stubGlobal("ResizeObserver", ControlledResizeObserver);
  });
  afterEach(() => {
    fixtures.forEach((element) => element.remove());
    fixtures.clear();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("measures content origin and padded jump clearance including scroller border", () => {
    const page = fixture();
    const { result, unmount } = renderHook(() =>
      useVirtualListScrollMargin(page.scrollRef),
    );
    act(() => result.current.listRef(page.list));
    expect(result.current.scrollMargin).toBe(120);
    expect(result.current.scrollPaddingStart).toBe(24);
    unmount();
    page.scroller.remove();
  });

  it("keeps content origin stable at restored scroll positions", () => {
    const page = fixture();
    page.scroller.scrollTop = 200;
    const { result, unmount } = renderHook(() =>
      useVirtualListScrollMargin(page.scrollRef),
    );
    act(() => result.current.listRef(page.list));
    expect(result.current.scrollMargin).toBe(120);
    act(() => {
      page.scroller.scrollTop = 400;
      page.notify(page.scroller);
    });
    expect(result.current.scrollMargin).toBe(120);
    unmount();
    page.scroller.remove();
  });

  it("remeasures when preceding header or filters change without resizing list", () => {
    const page = fixture();
    const { result, unmount } = renderHook(() =>
      useVirtualListScrollMargin(page.scrollRef),
    );
    act(() => result.current.listRef(page.list));
    act(() => {
      page.position(184);
      page.scroller.style.paddingTop = "76px";
      page.notify(page.header);
    });
    expect(result.current.scrollMargin).toBe(184);
    expect(result.current.scrollPaddingStart).toBe(76);
    act(() => {
      page.position(248);
      page.notify(page.filters);
    });
    expect(result.current.scrollMargin).toBe(248);
    unmount();
    page.scroller.remove();
  });

  it("updates on viewport resize without ResizeObserver and releases observers on unmount", () => {
    vi.stubGlobal("ResizeObserver", undefined);
    const page = fixture();
    const { result, unmount } = renderHook(() =>
      useVirtualListScrollMargin(page.scrollRef),
    );
    act(() => result.current.listRef(page.list));
    act(() => {
      page.position(80);
      window.dispatchEvent(new Event("resize"));
    });
    expect(result.current.scrollMargin).toBe(80);
    unmount();
    page.scroller.remove();
    expect(ControlledResizeObserver.instances).toHaveLength(0);
  });

  it("disconnects observed headers, ancestors and list when released", () => {
    const page = fixture();
    const { result, unmount } = renderHook(() =>
      useVirtualListScrollMargin(page.scrollRef),
    );
    act(() => result.current.listRef(page.list));
    expect(
      ControlledResizeObserver.instances.some((observer) =>
        observer.targets.has(page.header),
      ),
    ).toBe(true);
    expect(
      ControlledResizeObserver.instances.some((observer) =>
        observer.targets.has(page.filters),
      ),
    ).toBe(true);
    act(() => result.current.listRef(null));
    expect(
      ControlledResizeObserver.instances.every(
        (observer) => observer.targets.size === 0,
      ),
    ).toBe(true);
    unmount();
    page.scroller.remove();
  });
});
