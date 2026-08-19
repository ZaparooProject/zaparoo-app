import { render } from "@/test-utils";
import { describe, expect, it, vi } from "vitest";
import { SwipeBackIndicator } from "@/components/SwipeBackIndicator";

vi.mock("@/lib/store", () => ({
  useStatusStore: vi.fn((selector) =>
    selector({
      safeInsets: {
        top: "0px",
        right: "0px",
        bottom: "0px",
        left: "12px",
      },
    }),
  ),
}));

describe("SwipeBackIndicator", () => {
  it("should fade and move the arrow with gesture progress", () => {
    const { container, rerender } = render(<SwipeBackIndicator progress={0} />);
    const indicator = container.querySelector("[data-swipe-back-indicator]");

    expect(indicator).toHaveAttribute("aria-hidden", "true");
    expect(indicator).toHaveAttribute("data-ready", "false");
    expect(indicator).toHaveStyle({
      left: "calc(12px + 4px)",
      opacity: "0",
    });

    rerender(<SwipeBackIndicator progress={0.5} />);
    expect(indicator).toHaveStyle({ opacity: "0.8", transition: "none" });
    expect(indicator).toHaveAttribute("data-ready", "false");

    rerender(<SwipeBackIndicator progress={1} />);
    expect(indicator).toHaveStyle({ opacity: "1" });
    expect(indicator).toHaveAttribute("data-ready", "true");
  });

  it("should clamp progress outside the supported range", () => {
    const { container, rerender } = render(
      <SwipeBackIndicator progress={-1} />,
    );
    const indicator = container.querySelector("[data-swipe-back-indicator]");

    expect(indicator).toHaveStyle({ opacity: "0" });
    expect(indicator).toHaveAttribute("data-ready", "false");

    rerender(<SwipeBackIndicator progress={2} />);
    expect(indicator).toHaveStyle({ opacity: "1" });
    expect(indicator).toHaveAttribute("data-ready", "true");
  });
});
