import { describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@/test-utils";
import { SystemFilterControls } from "@/components/SystemFilterControls";

describe("SystemFilterControls scroll cues", () => {
  it("shows chevrons only toward tabs that are scrolled out of view", () => {
    let resized: () => void = () => {};
    vi.stubGlobal(
      "ResizeObserver",
      class {
        constructor(callback: () => void) {
          resized = callback;
        }
        observe = vi.fn();
        disconnect = vi.fn();
      },
    );
    render(
      <SystemFilterControls
        categories={["Arcade", "Console", "Handheld"]}
        category="all"
        onCategoryChange={vi.fn()}
        showSearch={false}
        tabIdPrefix="test"
      />,
    );
    const tabs = screen.getByRole("tablist", {
      name: "systemSelector.categories",
    });
    expect(screen.queryByTestId("tabs-scroll-left")).not.toBeInTheDocument();
    expect(screen.queryByTestId("tabs-scroll-right")).not.toBeInTheDocument();

    Object.defineProperties(tabs, {
      scrollWidth: { configurable: true, value: 400 },
      clientWidth: { configurable: true, value: 200 },
      scrollLeft: { configurable: true, writable: true, value: 0 },
    });
    act(() => resized());
    expect(screen.queryByTestId("tabs-scroll-left")).not.toBeInTheDocument();
    expect(screen.getByTestId("tabs-scroll-right")).toBeInTheDocument();

    tabs.scrollLeft = 100;
    fireEvent.scroll(tabs);
    expect(screen.getByTestId("tabs-scroll-left")).toBeInTheDocument();
    expect(screen.getByTestId("tabs-scroll-right")).toBeInTheDocument();

    tabs.scrollLeft = 200;
    fireEvent.scroll(tabs);
    expect(screen.getByTestId("tabs-scroll-left")).toBeInTheDocument();
    expect(screen.queryByTestId("tabs-scroll-right")).not.toBeInTheDocument();
  });
});
