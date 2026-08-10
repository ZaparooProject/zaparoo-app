import { act, fireEvent, render, screen, waitFor } from "@/test-utils";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
  useRouterState,
} from "@tanstack/react-router";
import {
  PageFrame,
  PAGE_SCROLL_RESTORATION_ID,
  PAGE_SCROLL_RESTORATION_SELECTOR,
} from "@/components/PageFrame";
import { useInitialPageScrollOffset } from "@/lib/pageScrollContext";
import { useLayoutEffect, useRef, useState } from "react";
import { useTabSessionStore } from "@/lib/tabSessionStore";

// Mock store for safe insets
vi.mock("@/lib/store", () => ({
  useStatusStore: vi.fn((selector) => {
    const state = {
      safeInsets: { top: "0px", bottom: "0px", left: "0px", right: "0px" },
    };
    return selector ? selector(state) : state;
  }),
}));

// Test component for ref testing
const TestComponentWithRef = () => {
  const scrollRef = useRef<HTMLDivElement>(null);

  return (
    <PageFrame scrollRef={scrollRef}>
      <div>Content with ref</div>
    </PageFrame>
  );
};

describe("PageFrame", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useTabSessionStore.getState().reset();
  });

  it("should render children without header", () => {
    render(
      <PageFrame>
        <div>Test content</div>
      </PageFrame>,
    );

    expect(screen.getByText("Test content")).toBeInTheDocument();
  });

  it("should render with custom header", () => {
    const customHeader = <div data-testid="custom-header">Custom Header</div>;

    render(
      <PageFrame header={customHeader}>
        <div>Test content</div>
      </PageFrame>,
    );

    expect(screen.getByTestId("custom-header")).toBeInTheDocument();
    expect(screen.getByText("Custom Header")).toBeInTheDocument();
  });

  it("should render with headerLeft, headerCenter, and headerRight", () => {
    const headerLeft = <div data-testid="header-left">Left</div>;
    const headerCenter = <div data-testid="header-center">Center</div>;
    const headerRight = <div data-testid="header-right">Right</div>;

    render(
      <PageFrame
        headerLeft={headerLeft}
        headerCenter={headerCenter}
        headerRight={headerRight}
      >
        <div>Test content</div>
      </PageFrame>,
    );

    expect(screen.getByTestId("header-left")).toBeInTheDocument();
    expect(screen.getByTestId("header-center")).toBeInTheDocument();
    expect(screen.getByTestId("header-right")).toBeInTheDocument();
    expect(screen.getByText("Left")).toBeInTheDocument();
    expect(screen.getByText("Center")).toBeInTheDocument();
    expect(screen.getByText("Right")).toBeInTheDocument();
    expect(screen.getByTestId("header-left").parentElement).toHaveClass(
      "-translate-x-1",
      "mr-1",
    );
    expect(screen.getByTestId("header-center").parentElement).not.toHaveClass(
      "-translate-x-1",
    );
    expect(screen.getByTestId("header-right").parentElement).toHaveClass(
      "translate-x-1",
      "ml-2",
    );
  });

  it("should render headerCenter with title styling", () => {
    render(
      <PageFrame
        headerCenter={<h1 className="text-foreground text-xl">Test Title</h1>}
      >
        <div>Test content</div>
      </PageFrame>,
    );

    expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
    expect(screen.getByText("Test Title")).toBeInTheDocument();
  });

  it("should apply custom className", () => {
    const { container } = render(
      <PageFrame className="custom-class">
        <div>Test content</div>
      </PageFrame>,
    );

    const pageFrame = container.firstChild as HTMLElement;
    expect(pageFrame).toHaveClass("custom-class");
    expect(pageFrame).toHaveClass("flex", "h-full", "w-full", "flex-col");
  });

  it("should pass through additional props", () => {
    render(
      <PageFrame data-testid="page-frame" role="main">
        <div>Test content</div>
      </PageFrame>,
    );

    const pageFrame = screen.getByTestId("page-frame");
    expect(pageFrame).toHaveAttribute("role", "main");
  });

  it("should identify its scroll container for router restoration", () => {
    const { container } = render(
      <PageFrame>
        <div>Scrollable content</div>
      </PageFrame>,
    );

    const scrollContainer = container.querySelector(
      PAGE_SCROLL_RESTORATION_SELECTOR,
    );
    expect(scrollContainer).toHaveAttribute(
      "data-scroll-restoration-id",
      PAGE_SCROLL_RESTORATION_ID,
    );
  });

  it("should reset on forward navigation and restore on back navigation", async () => {
    const rootRoute = createRootRoute({
      component: () => <Outlet />,
    });
    const settingsRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: "/settings",
      component: () => (
        <PageFrame>
          <div>Settings page</div>
        </PageFrame>
      ),
    });
    const mediaRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: "/settings/media",
      component: () => (
        <PageFrame>
          <div>Media page</div>
        </PageFrame>
      ),
    });
    const routeTree = rootRoute.addChildren([settingsRoute, mediaRoute]);
    const history = createMemoryHistory({ initialEntries: ["/settings"] });
    const router = createRouter({
      routeTree,
      history,
      scrollRestoration: true,
      scrollToTopSelectors: [PAGE_SCROLL_RESTORATION_SELECTOR],
    });

    render(<RouterProvider router={router} />);
    await screen.findByText("Settings page");

    const settingsScrollContainer = document.querySelector(
      PAGE_SCROLL_RESTORATION_SELECTOR,
    );
    expect(settingsScrollContainer).toBeInstanceOf(HTMLElement);
    if (!(settingsScrollContainer instanceof HTMLElement)) return;

    settingsScrollContainer.scrollTop = 320;
    fireEvent.scroll(settingsScrollContainer);

    await act(() => router.navigate({ to: "/settings/media" }));
    await screen.findByText("Media page");

    const mediaScrollContainer = document.querySelector(
      PAGE_SCROLL_RESTORATION_SELECTOR,
    );
    expect(mediaScrollContainer).toBeInstanceOf(HTMLElement);
    if (!(mediaScrollContainer instanceof HTMLElement)) return;
    expect(mediaScrollContainer.scrollTop).toBe(0);

    act(() => router.history.back());

    await screen.findByText("Settings page");
    await waitFor(() => {
      const restoredScrollContainer = document.querySelector(
        PAGE_SCROLL_RESTORATION_SELECTOR,
      );
      expect(restoredScrollContainer).toHaveProperty("scrollTop", 320);
    });
  });

  it("should restore each history entry across same-route parameter navigation", async () => {
    const restoredScrollByPath = new Map<string, number>();
    const ItemPage = () => {
      const pathname = useRouterState({
        select: (state) => state.location.pathname,
      });
      useLayoutEffect(() => {
        const scrollContainer = document.querySelector(
          PAGE_SCROLL_RESTORATION_SELECTOR,
        );
        if (scrollContainer instanceof HTMLElement) {
          restoredScrollByPath.set(pathname, scrollContainer.scrollTop);
        }
      }, [pathname]);

      return (
        <PageFrame>
          <div>Item page</div>
        </PageFrame>
      );
    };
    const rootRoute = createRootRoute({ component: () => <Outlet /> });
    const itemRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: "/settings/devices/$address",
      component: ItemPage,
    });
    const history = createMemoryHistory({
      initialEntries: ["/settings/devices/one"],
    });
    const router = createRouter({
      routeTree: rootRoute.addChildren([itemRoute]),
      history,
      scrollRestoration: true,
      scrollToTopSelectors: [PAGE_SCROLL_RESTORATION_SELECTOR],
    });

    render(<RouterProvider router={router} />);
    await screen.findByText("Item page");

    const scrollContainer = document.querySelector(
      PAGE_SCROLL_RESTORATION_SELECTOR,
    );
    expect(scrollContainer).toBeInstanceOf(HTMLElement);
    if (!(scrollContainer instanceof HTMLElement)) return;

    scrollContainer.scrollTop = 120;
    fireEvent.scroll(scrollContainer);

    await act(() =>
      router.navigate({
        to: "/settings/devices/$address",
        params: { address: "two" },
      }),
    );
    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/settings/devices/two");
      expect(scrollContainer.scrollTop).toBe(0);
    });

    scrollContainer.scrollTop = 240;
    fireEvent.scroll(scrollContainer);

    act(() => history.back());
    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/settings/devices/one");
      expect(restoredScrollByPath.get("/settings/devices/one")).toBe(120);
    });

    act(() => history.forward());
    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/settings/devices/two");
      expect(restoredScrollByPath.get("/settings/devices/two")).toBe(240);
    });
  });

  it("should restore scroll when revisiting a tab route through a new history entry", async () => {
    const rootRoute = createRootRoute({ component: () => <Outlet /> });
    const libraryRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: "/library",
      component: () => (
        <PageFrame>
          <div>Library page</div>
        </PageFrame>
      ),
    });
    const createRouteNode = createRoute({
      getParentRoute: () => rootRoute,
      path: "/create",
      component: () => (
        <PageFrame>
          <div>Create page</div>
        </PageFrame>
      ),
    });
    const router = createRouter({
      routeTree: rootRoute.addChildren([libraryRoute, createRouteNode]),
      history: createMemoryHistory({ initialEntries: ["/library"] }),
      scrollRestoration: true,
      scrollToTopSelectors: [PAGE_SCROLL_RESTORATION_SELECTOR],
    });

    render(<RouterProvider router={router} />);
    await screen.findByText("Library page");
    const libraryScrollContainer = document.querySelector(
      PAGE_SCROLL_RESTORATION_SELECTOR,
    );
    expect(libraryScrollContainer).toBeInstanceOf(HTMLElement);
    if (!(libraryScrollContainer instanceof HTMLElement)) return;
    libraryScrollContainer.scrollTop = 280;
    fireEvent.scroll(libraryScrollContainer);
    expect(useTabSessionStore.getState().scrollPositions).toEqual({
      "/library": { scrollX: 0, scrollY: 280 },
    });

    await act(() => router.navigate({ to: "/create", resetScroll: false }));
    await screen.findByText("Create page");
    await act(() => router.navigate({ to: "/library", resetScroll: false }));
    await screen.findByText("Library page");

    await waitFor(() =>
      expect(
        document.querySelector(PAGE_SCROLL_RESTORATION_SELECTOR),
      ).toHaveProperty("scrollTop", 280),
    );
  });

  it("should preserve active scroll position across state updates", async () => {
    const user = userEvent.setup();
    const StatefulPage = () => {
      const [count, setCount] = useState(0);
      return (
        <PageFrame>
          <button onClick={() => setCount((value) => value + 1)}>
            Update {count}
          </button>
        </PageFrame>
      );
    };
    const rootRoute = createRootRoute({ component: () => <Outlet /> });
    const pageRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: "/",
      component: StatefulPage,
    });
    const router = createRouter({
      routeTree: rootRoute.addChildren([pageRoute]),
      history: createMemoryHistory({ initialEntries: ["/"] }),
      scrollRestoration: true,
      scrollToTopSelectors: [PAGE_SCROLL_RESTORATION_SELECTOR],
    });

    render(<RouterProvider router={router} />);
    await screen.findByRole("button", { name: "Update 0" });
    const scrollContainer = document.querySelector(
      PAGE_SCROLL_RESTORATION_SELECTOR,
    );
    expect(scrollContainer).toBeInstanceOf(HTMLElement);
    if (!(scrollContainer instanceof HTMLElement)) return;
    scrollContainer.scrollTop = 240;

    await user.click(screen.getByRole("button", { name: "Update 0" }));
    await screen.findByRole("button", { name: "Update 1" });

    expect(scrollContainer.scrollTop).toBe(240);
  });

  it("should provide the restored offset to virtualized children", () => {
    const VirtualizedContent = () => (
      <div>Initial offset: {useInitialPageScrollOffset()}</div>
    );
    useTabSessionStore.getState().rememberScroll("library:SNES:browse", 0, 240);

    render(
      <PageFrame sessionScrollKey="library:SNES:browse">
        <VirtualizedContent />
      </PageFrame>,
    );

    expect(screen.getByText("Initial offset: 240")).toBeInTheDocument();
  });

  it("should restore session scroll after a tab screen remounts", () => {
    const { container: firstContainer, unmount } = render(
      <PageFrame sessionScrollKey="library:SNES:browse">
        <div>Library content</div>
      </PageFrame>,
    );
    const firstScrollContainer = firstContainer.querySelector(
      PAGE_SCROLL_RESTORATION_SELECTOR,
    );
    expect(firstScrollContainer).toBeInstanceOf(HTMLElement);
    if (!(firstScrollContainer instanceof HTMLElement)) return;
    firstScrollContainer.scrollTop = 240;
    fireEvent.scroll(firstScrollContainer);
    unmount();

    const { container: secondContainer } = render(
      <PageFrame sessionScrollKey="library:SNES:browse">
        <div>Library content</div>
      </PageFrame>,
    );
    const restoredScrollContainer = secondContainer.querySelector(
      PAGE_SCROLL_RESTORATION_SELECTOR,
    );

    expect(restoredScrollContainer).toHaveProperty("scrollTop", 240);
  });

  it("should handle scrollRef", () => {
    render(<TestComponentWithRef />);

    expect(screen.getByText("Content with ref")).toBeInTheDocument();
  });

  it("should render only headerLeft", () => {
    const headerLeft = <div data-testid="only-left">Only Left</div>;

    render(
      <PageFrame headerLeft={headerLeft}>
        <div>Test content</div>
      </PageFrame>,
    );

    expect(screen.getByTestId("only-left")).toBeInTheDocument();
  });

  it("should render only headerRight", () => {
    const headerRight = <div data-testid="only-right">Only Right</div>;

    render(
      <PageFrame headerRight={headerRight}>
        <div>Test content</div>
      </PageFrame>,
    );

    expect(screen.getByTestId("only-right")).toBeInTheDocument();
  });

  it("should apply correct styles when header is present", () => {
    const { container } = render(
      <PageFrame
        headerCenter={<h1 className="text-foreground text-xl">Test Title</h1>}
      >
        <div>Test content</div>
      </PageFrame>,
    );

    const scrollContainer = container.querySelector(".flex-1.overflow-y-auto");
    expect(scrollContainer).toBeInTheDocument();
    expect(scrollContainer).toHaveClass("pb-4");
  });

  it("should apply correct styles when header is not present", () => {
    const { container } = render(
      <PageFrame>
        <div>Test content</div>
      </PageFrame>,
    );

    const scrollContainer = container.querySelector(".flex-1.overflow-y-auto");
    expect(scrollContainer).toBeInTheDocument();
    expect(scrollContainer).toHaveClass("pb-4");
  });

  it("should handle empty header components gracefully", () => {
    render(
      <PageFrame headerLeft={null} headerCenter={null} headerRight={null}>
        <div>Test content</div>
      </PageFrame>,
    );

    // When all header props are null, should not render header content
    // but the content should still be visible
    expect(screen.getByText("Test content")).toBeInTheDocument();
  });
});
