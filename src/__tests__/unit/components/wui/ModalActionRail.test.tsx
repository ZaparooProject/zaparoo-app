import { act, fireEvent, render, screen, within } from "@/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ModalActionRail } from "@/components/wui/ModalActionRail";
import { Button } from "@/components/wui/Button";

function renderRail() {
  return render(
    <ModalActionRail
      aria-label="Media actions"
      actions={
        <>
          <Button label="Favorite" icon={<span>heart</span>} />
          <Button label="Write" icon={<span>NFC</span>} />
        </>
      }
      primaryAction={<Button label="Launch" />}
    />,
  );
}

describe("ModalActionRail", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("should group direct actions separately from the primary action", () => {
    renderRail();

    const actions = screen.getByRole("group", { name: "Media actions" });
    expect(
      within(actions).getByRole("button", { name: "Favorite" }),
    ).toBeVisible();
    expect(
      within(actions).getByRole("button", { name: "Write" }),
    ).toBeVisible();
    expect(
      within(actions).queryByRole("button", { name: "Launch" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Launch" })).toBeVisible();
  });

  it("supports an actions-only footer without a primary action", () => {
    render(
      <ModalActionRail
        aria-label="Media actions"
        actions={<Button label="Write" />}
      />,
    );

    expect(
      within(screen.getByRole("group", { name: "Media actions" })).getByRole(
        "button",
        { name: "Write" },
      ),
    ).toBeVisible();
    expect(screen.getAllByRole("button")).toHaveLength(1);
  });

  it("should keep larger action sets directly available", () => {
    render(
      <ModalActionRail
        aria-label="Media actions"
        actions={Array.from({ length: 7 }, (_, index) => (
          <Button key={index} label={`Action ${index + 1}`} />
        ))}
        primaryAction={<Button label="Launch" />}
      />,
    );

    const actions = screen.getByRole("group", { name: "Media actions" });
    expect(within(actions).getAllByRole("button")).toHaveLength(7);
  });

  it("shows edge cues only where more actions can be scrolled into view", () => {
    let resized: () => void = () => {};
    const disconnect = vi.fn();
    vi.stubGlobal(
      "ResizeObserver",
      class {
        constructor(callback: () => void) {
          resized = callback;
        }
        observe = vi.fn();
        disconnect = disconnect;
      },
    );
    renderRail();
    const actions = screen.getByRole("group", { name: "Media actions" });
    expect(screen.queryByTestId("rail-scroll-left")).not.toBeInTheDocument();
    expect(screen.queryByTestId("rail-scroll-right")).not.toBeInTheDocument();

    Object.defineProperties(actions, {
      scrollWidth: { configurable: true, value: 300 },
      clientWidth: { configurable: true, value: 100 },
      scrollLeft: { configurable: true, writable: true, value: 0 },
    });
    act(() => resized());
    expect(screen.queryByTestId("rail-scroll-left")).not.toBeInTheDocument();
    expect(screen.getByTestId("rail-scroll-right")).toBeVisible();

    actions.scrollLeft = 100;
    fireEvent.scroll(actions);
    expect(screen.getByTestId("rail-scroll-left")).toBeVisible();
    expect(screen.getByTestId("rail-scroll-right")).toBeVisible();

    actions.scrollLeft = 200;
    fireEvent.scroll(actions);
    expect(screen.getByTestId("rail-scroll-left")).toBeVisible();
    expect(screen.queryByTestId("rail-scroll-right")).not.toBeInTheDocument();
    expect(disconnect).not.toHaveBeenCalled();
  });

  it("should preserve secondary-to-primary focus order", () => {
    renderRail();

    const favorite = screen.getByRole("button", { name: "Favorite" });
    const write = screen.getByRole("button", { name: "Write" });
    const launch = screen.getByRole("button", { name: "Launch" });

    expect(
      favorite.compareDocumentPosition(write) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      write.compareDocumentPosition(launch) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });
});
