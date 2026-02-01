import { render, screen, fireEvent, act } from "../../../../test-utils";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Button } from "@/components/wui/Button";

// Mock useHaptics hook
const mockImpact = vi.fn();
vi.mock("@/hooks/useHaptics", () => ({
  useHaptics: () => ({
    impact: mockImpact,
  }),
}));

describe("Button", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  describe("rendering", () => {
    it("should render with label", () => {
      render(<Button label="Test button" />);
      const button = screen.getByRole("button", { name: "Test button" });
      expect(button).toBeInTheDocument();
    });

    it("should render with icon", () => {
      render(
        <Button label="With icon" icon={<span data-testid="icon">★</span>} />,
      );

      expect(screen.getByTestId("icon")).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "With icon" }),
      ).toBeInTheDocument();
    });

    it("should render icon-only button", () => {
      render(
        <Button
          icon={<span data-testid="icon">★</span>}
          aria-label="Icon button"
        />,
      );

      expect(screen.getByTestId("icon")).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Icon button" }),
      ).toBeInTheDocument();
    });
  });

  describe("variants", () => {
    it("should apply fill variant classes correctly", () => {
      render(<Button label="Fill" variant="fill" />);
      const button = screen.getByRole("button");
      expect(button).toHaveClass("bg-button-pattern");
    });

    it("should apply outline variant classes correctly", () => {
      render(<Button label="Outline" variant="outline" />);
      const button = screen.getByRole("button");
      expect(button).toHaveClass("border-bd-outline");
    });

    it("should apply text variant classes correctly", () => {
      render(<Button label="Text" variant="text" />);
      const button = screen.getByRole("button");
      expect(button).not.toHaveClass("border");
    });

    it("should default to fill variant", () => {
      render(<Button label="Default" />);
      const button = screen.getByRole("button");
      expect(button).toHaveClass("bg-button-pattern");
    });
  });

  describe("sizes", () => {
    it("should apply small size classes", () => {
      render(<Button label="Small" size="sm" />);
      const button = screen.getByRole("button");
      expect(button).toHaveClass("py-1");
      expect(button).toHaveClass("text-sm");
      expect(button).toHaveClass("px-4");
    });

    it("should apply default size classes", () => {
      render(<Button label="Default" size="default" />);
      const button = screen.getByRole("button");
      expect(button).toHaveClass("py-1.5");
      expect(button).toHaveClass("px-6");
    });

    it("should apply large size classes", () => {
      render(<Button label="Large" size="lg" />);
      const button = screen.getByRole("button");
      expect(button).toHaveClass("py-2");
      expect(button).toHaveClass("text-lg");
      expect(button).toHaveClass("px-8");
    });

    it("should apply icon-only small size classes", () => {
      render(
        <Button icon={<span>★</span>} size="sm" aria-label="Icon small" />,
      );
      const button = screen.getByRole("button");
      expect(button).toHaveClass("h-8");
      expect(button).toHaveClass("w-8");
    });

    it("should apply icon-only default size classes", () => {
      render(
        <Button
          icon={<span>★</span>}
          size="default"
          aria-label="Icon default"
        />,
      );
      const button = screen.getByRole("button");
      expect(button).toHaveClass("h-10");
      expect(button).toHaveClass("w-10");
    });

    it("should apply icon-only large size classes", () => {
      render(
        <Button icon={<span>★</span>} size="lg" aria-label="Icon large" />,
      );
      const button = screen.getByRole("button");
      expect(button).toHaveClass("h-12");
      expect(button).toHaveClass("w-12");
    });
  });

  describe("click handling", () => {
    it("should call onClick when clicked", () => {
      const handleClick = vi.fn();
      render(<Button label="Test button" onClick={handleClick} />);

      const button = screen.getByRole("button", { name: "Test button" });
      fireEvent.click(button);

      expect(handleClick).toHaveBeenCalledTimes(1);
    });

    it("should not call onClick when disabled", () => {
      const handleClick = vi.fn();
      render(<Button label="Test button" onClick={handleClick} disabled />);

      const button = screen.getByRole("button", { name: "Test button" });
      fireEvent.click(button);

      expect(handleClick).not.toHaveBeenCalled();
    });

    it("should not call onClick after scroll gesture", () => {
      const handleClick = vi.fn();
      render(<Button label="Test button" onClick={handleClick} />);

      const button = screen.getByRole("button");

      // Simulate touch start
      fireEvent.touchStart(button, {
        touches: [{ clientX: 0, clientY: 0 }],
      });

      // Simulate touch move beyond threshold (>10px)
      fireEvent.touchMove(button, {
        touches: [{ clientX: 0, clientY: 20 }],
      });

      // Simulate touch end
      fireEvent.touchEnd(button);

      // Click after scroll gesture should not trigger onClick
      fireEvent.click(button);

      expect(handleClick).not.toHaveBeenCalled();

      // After timeout, hasMoved should reset
      act(() => {
        vi.advanceTimersByTime(100);
      });

      // Now click should work
      fireEvent.click(button);
      expect(handleClick).toHaveBeenCalledTimes(1);
    });
  });

  describe("haptic feedback", () => {
    it("should trigger light haptic feedback on touch start for default intent", () => {
      render(<Button label="Test button" />);

      const button = screen.getByRole("button");
      fireEvent.touchStart(button, {
        touches: [{ clientX: 0, clientY: 0 }],
      });

      expect(mockImpact).toHaveBeenCalledWith("light");
    });

    it("should trigger medium haptic feedback on touch start for primary intent", () => {
      render(<Button label="Test button" intent="primary" />);

      const button = screen.getByRole("button", { name: "Test button" });
      fireEvent.touchStart(button, {
        touches: [{ clientX: 0, clientY: 0 }],
      });

      expect(mockImpact).toHaveBeenCalledWith("medium");
    });

    it("should trigger heavy haptic feedback on touch start for destructive intent", () => {
      render(<Button label="Test button" intent="destructive" />);

      const button = screen.getByRole("button");
      fireEvent.touchStart(button, {
        touches: [{ clientX: 0, clientY: 0 }],
      });

      expect(mockImpact).toHaveBeenCalledWith("heavy");
    });

    it("should not trigger haptic feedback when disabled", () => {
      render(<Button label="Test button" intent="primary" disabled />);

      const button = screen.getByRole("button", { name: "Test button" });
      fireEvent.touchStart(button, {
        touches: [{ clientX: 0, clientY: 0 }],
      });

      expect(mockImpact).not.toHaveBeenCalled();
    });
  });

  describe("touch interactions", () => {
    it("should set pressed state on touch start", () => {
      render(<Button label="Test button" />);

      const button = screen.getByRole("button");
      fireEvent.touchStart(button, {
        touches: [{ clientX: 0, clientY: 0 }],
      });

      // Pressed state applies opacity-80 class
      expect(button).toHaveClass("opacity-80");
    });

    it("should clear pressed state on touch end", () => {
      render(<Button label="Test button" />);

      const button = screen.getByRole("button");
      fireEvent.touchStart(button, {
        touches: [{ clientX: 0, clientY: 0 }],
      });

      expect(button).toHaveClass("opacity-80");

      fireEvent.touchEnd(button);

      expect(button).not.toHaveClass("opacity-80");
    });

    it("should clear pressed state on touch cancel", () => {
      render(<Button label="Test button" />);

      const button = screen.getByRole("button");
      fireEvent.touchStart(button, {
        touches: [{ clientX: 0, clientY: 0 }],
      });

      expect(button).toHaveClass("opacity-80");

      fireEvent.touchCancel(button);

      expect(button).not.toHaveClass("opacity-80");
    });

    it("should detect horizontal scroll gesture", () => {
      const handleClick = vi.fn();
      render(<Button label="Test button" onClick={handleClick} />);

      const button = screen.getByRole("button");

      fireEvent.touchStart(button, {
        touches: [{ clientX: 0, clientY: 0 }],
      });

      // Move horizontally more than 10px
      fireEvent.touchMove(button, {
        touches: [{ clientX: 15, clientY: 0 }],
      });

      // Should have cleared pressed state
      expect(button).not.toHaveClass("opacity-80");

      fireEvent.touchEnd(button);
      fireEvent.click(button);

      // Click should be ignored after scroll
      expect(handleClick).not.toHaveBeenCalled();
    });

    it("should detect vertical scroll gesture", () => {
      const handleClick = vi.fn();
      render(<Button label="Test button" onClick={handleClick} />);

      const button = screen.getByRole("button");

      fireEvent.touchStart(button, {
        touches: [{ clientX: 0, clientY: 0 }],
      });

      // Move vertically more than 10px
      fireEvent.touchMove(button, {
        touches: [{ clientX: 0, clientY: 15 }],
      });

      fireEvent.touchEnd(button);
      fireEvent.click(button);

      expect(handleClick).not.toHaveBeenCalled();
    });

    it("should allow click when movement is within threshold", () => {
      const handleClick = vi.fn();
      render(<Button label="Test button" onClick={handleClick} />);

      const button = screen.getByRole("button");

      fireEvent.touchStart(button, {
        touches: [{ clientX: 0, clientY: 0 }],
      });

      // Move less than 10px
      fireEvent.touchMove(button, {
        touches: [{ clientX: 5, clientY: 5 }],
      });

      fireEvent.touchEnd(button);

      // Wait for reset timeout
      act(() => {
        vi.advanceTimersByTime(100);
      });

      fireEvent.click(button);

      expect(handleClick).toHaveBeenCalledTimes(1);
    });

    it("should handle touch start with no touches gracefully", () => {
      render(<Button label="Test button" />);

      const button = screen.getByRole("button");

      // Touch start with empty touches array
      fireEvent.touchStart(button, { touches: [] });

      // Should not throw and button should not be pressed
      expect(button).not.toHaveClass("opacity-80");
    });

    it("should handle touch move with no touches gracefully", () => {
      render(<Button label="Test button" />);

      const button = screen.getByRole("button");

      fireEvent.touchStart(button, {
        touches: [{ clientX: 0, clientY: 0 }],
      });

      // Touch move with empty touches array
      fireEvent.touchMove(button, { touches: [] });

      // Should not throw
      expect(button).toHaveClass("opacity-80");
    });

    it("should reset state after touch end timeout", () => {
      render(<Button label="Test button" />);

      const button = screen.getByRole("button");

      fireEvent.touchStart(button, {
        touches: [{ clientX: 0, clientY: 0 }],
      });

      fireEvent.touchEnd(button);

      // Before timeout
      expect(button).not.toHaveClass("opacity-80");

      // After timeout, internal state should be reset
      act(() => {
        vi.advanceTimersByTime(100);
      });

      // Button should still not be pressed (state was reset)
      expect(button).not.toHaveClass("opacity-80");
    });
  });

  describe("mouse interactions", () => {
    it("should set pressed state on mouse down", () => {
      render(<Button label="Test button" />);

      const button = screen.getByRole("button");
      fireEvent.mouseDown(button);

      expect(button).toHaveClass("opacity-80");
    });

    it("should clear pressed state on mouse up", () => {
      render(<Button label="Test button" />);

      const button = screen.getByRole("button");
      fireEvent.mouseDown(button);
      fireEvent.mouseUp(button);

      expect(button).not.toHaveClass("opacity-80");
    });

    it("should clear pressed state on mouse leave", () => {
      render(<Button label="Test button" />);

      const button = screen.getByRole("button");
      fireEvent.mouseDown(button);
      fireEvent.mouseLeave(button);

      expect(button).not.toHaveClass("opacity-80");
    });
  });

  describe("accessibility", () => {
    it("should support aria-label for accessibility", () => {
      render(<Button label="X" aria-label="Close dialog" />);

      const button = screen.getByRole("button", { name: "Close dialog" });
      expect(button).toBeInTheDocument();
    });

    it("should use label as aria-label when not provided", () => {
      render(<Button label="Submit" />);

      const button = screen.getByRole("button", { name: "Submit" });
      expect(button).toHaveAttribute("aria-label", "Submit");
    });

    it("should support aria-expanded", () => {
      render(<Button label="Toggle" aria-expanded={true} />);

      const button = screen.getByRole("button");
      expect(button).toHaveAttribute("aria-expanded", "true");
    });

    it("should support aria-controls", () => {
      render(<Button label="Toggle" aria-controls="panel-1" />);

      const button = screen.getByRole("button");
      expect(button).toHaveAttribute("aria-controls", "panel-1");
    });

    it("should be decorative when decorative prop is true", () => {
      render(<Button label="Decorative" decorative />);

      const button = screen.getByText("Decorative").closest("button");
      expect(button).toHaveAttribute("aria-hidden", "true");
      expect(button).toHaveAttribute("tabIndex", "-1");
      expect(button).not.toHaveAttribute("aria-label");
    });
  });

  describe("disabled state", () => {
    it("should apply disabled styles", () => {
      render(<Button label="Disabled" disabled />);

      const button = screen.getByRole("button");
      expect(button).toBeDisabled();
      expect(button).toHaveClass("text-foreground-disabled");
      expect(button).toHaveClass("border-foreground-disabled");
    });

    it("should not apply pressed opacity when disabled", () => {
      render(<Button label="Disabled" disabled />);

      const button = screen.getByRole("button");
      fireEvent.touchStart(button, {
        touches: [{ clientX: 0, clientY: 0 }],
      });

      // opacity-80 should not be applied when disabled
      expect(button).not.toHaveClass("opacity-80");
    });
  });

  describe("custom className", () => {
    it("should apply custom className", () => {
      render(<Button label="Custom" className="custom-class" />);

      const button = screen.getByRole("button");
      expect(button).toHaveClass("custom-class");
    });
  });

  describe("ref forwarding", () => {
    it("should forward ref to button element", () => {
      const ref = { current: null as HTMLButtonElement | null };
      render(<Button label="Ref test" ref={ref} />);

      expect(ref.current).toBeInstanceOf(HTMLButtonElement);
      expect(ref.current?.textContent).toBe("Ref test");
    });
  });
});
