/**
 * Unit tests for ui/Button component (shadcn/ui style button)
 *
 * Tests rendering, variants, sizes, touch handling, and asChild behavior
 */

import { createRef } from "react";
import { render, screen, fireEvent } from "../../../../test-utils";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Button } from "../../../../components/ui/button";

// Note: This component uses fireEvent instead of userEvent for click tests because
// the component has custom touch/scroll gesture handling with internal timeouts
// that interfere with userEvent's event simulation. fireEvent is acceptable per
// testing guidelines when userEvent doesn't support the interaction pattern.

describe("Button (ui)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("rendering", () => {
    it("should render with default variant and size", () => {
      render(<Button>Click me</Button>);

      const button = screen.getByRole("button", { name: "Click me" });
      expect(button).toBeInTheDocument();
    });

    it("should forward ref to button element", () => {
      const ref = createRef<HTMLButtonElement>();
      render(<Button ref={ref}>Click me</Button>);

      expect(ref.current).toBeInstanceOf(HTMLButtonElement);
      expect(ref.current?.tagName).toBe("BUTTON");
    });

    it("should render children correctly", () => {
      render(
        <Button>
          <span data-testid="child">Icon</span>
          Text
        </Button>,
      );

      expect(screen.getByTestId("child")).toBeInTheDocument();
      expect(screen.getByRole("button")).toHaveTextContent("Text");
    });
  });

  describe("variants", () => {
    const variants = [
      "default",
      "wui",
      "destructive",
      "outline",
      "wui-outline",
      "secondary",
      "ghost",
      "link",
    ] as const;

    it.each(variants)("should render with %s variant", (variant) => {
      render(<Button variant={variant}>Button</Button>);

      const button = screen.getByRole("button", { name: "Button" });
      expect(button).toBeInTheDocument();
    });
  });

  describe("sizes", () => {
    const sizes = [
      "default",
      "sm",
      "lg",
      "icon",
      "icon-sm",
      "icon-lg",
    ] as const;

    it.each(sizes)("should render with %s size", (size) => {
      render(<Button size={size}>Button</Button>);

      const button = screen.getByRole("button", { name: "Button" });
      expect(button).toBeInTheDocument();
    });
  });

  describe("asChild", () => {
    it("should render as Slot when asChild is true", () => {
      render(
        <Button asChild>
          <a href="/test">Link Button</a>
        </Button>,
      );

      // When asChild is true, it renders the child element (anchor) with button styling
      const link = screen.getByRole("link", { name: "Link Button" });
      expect(link).toBeInTheDocument();
      expect(link).toHaveAttribute("href", "/test");
    });

    it("should pass click handler to child component", () => {
      const handleClick = vi.fn();
      render(
        <Button asChild onClick={handleClick}>
          <a href="/test">Link Button</a>
        </Button>,
      );

      const link = screen.getByRole("link", { name: "Link Button" });
      fireEvent.click(link);

      expect(handleClick).toHaveBeenCalledTimes(1);
    });
  });

  describe("click handling", () => {
    it("should call onClick when clicked", () => {
      const handleClick = vi.fn();
      render(<Button onClick={handleClick}>Click me</Button>);

      const button = screen.getByRole("button", { name: "Click me" });
      fireEvent.click(button);

      expect(handleClick).toHaveBeenCalledTimes(1);
    });

    it("should not call onClick when disabled", () => {
      const handleClick = vi.fn();
      render(
        <Button onClick={handleClick} disabled>
          Click me
        </Button>,
      );

      const button = screen.getByRole("button", { name: "Click me" });
      fireEvent.click(button);

      expect(handleClick).not.toHaveBeenCalled();
    });

    it("should not call onClick after scroll gesture", () => {
      const handleClick = vi.fn();
      render(<Button onClick={handleClick}>Click me</Button>);

      const button = screen.getByRole("button", { name: "Click me" });

      // Simulate touch start
      fireEvent.touchStart(button, {
        touches: [{ clientX: 100, clientY: 100 }],
      });

      // Simulate touch move more than 10px (scroll gesture)
      fireEvent.touchMove(button, {
        touches: [{ clientX: 100, clientY: 150 }],
      });

      // Touch end and click
      fireEvent.touchEnd(button);
      fireEvent.click(button);

      expect(handleClick).not.toHaveBeenCalled();
    });
  });

  describe("touch handling", () => {
    it("should track touch start position", () => {
      render(<Button>Touch me</Button>);

      const button = screen.getByRole("button", { name: "Touch me" });

      fireEvent.touchStart(button, {
        touches: [{ clientX: 100, clientY: 100 }],
      });

      // Pressed state adds opacity-80 class
      expect(button).toHaveClass("opacity-80");
    });

    it("should detect scroll when moved more than 10px horizontally", () => {
      const handleClick = vi.fn();
      render(<Button onClick={handleClick}>Touch me</Button>);

      const button = screen.getByRole("button", { name: "Touch me" });

      fireEvent.touchStart(button, {
        touches: [{ clientX: 100, clientY: 100 }],
      });

      expect(button).toHaveClass("opacity-80");

      // Move more than 10px horizontally
      fireEvent.touchMove(button, {
        touches: [{ clientX: 115, clientY: 100 }],
      });

      // Pressed state should be removed after detecting scroll
      expect(button).not.toHaveClass("opacity-80");

      fireEvent.touchEnd(button);
      fireEvent.click(button);

      expect(handleClick).not.toHaveBeenCalled();
    });

    it("should detect scroll when moved more than 10px vertically", () => {
      const handleClick = vi.fn();
      render(<Button onClick={handleClick}>Touch me</Button>);

      const button = screen.getByRole("button", { name: "Touch me" });

      fireEvent.touchStart(button, {
        touches: [{ clientX: 100, clientY: 100 }],
      });

      // Move more than 10px vertically
      fireEvent.touchMove(button, {
        touches: [{ clientX: 100, clientY: 115 }],
      });

      fireEvent.touchEnd(button);
      fireEvent.click(button);

      expect(handleClick).not.toHaveBeenCalled();
    });

    it("should allow click when moved less than 10px", () => {
      const handleClick = vi.fn();
      render(<Button onClick={handleClick}>Touch me</Button>);

      const button = screen.getByRole("button", { name: "Touch me" });

      fireEvent.touchStart(button, {
        touches: [{ clientX: 100, clientY: 100 }],
      });

      // Move less than 10px
      fireEvent.touchMove(button, {
        touches: [{ clientX: 105, clientY: 105 }],
      });

      fireEvent.touchEnd(button);
      vi.advanceTimersByTime(100);
      fireEvent.click(button);

      expect(handleClick).toHaveBeenCalledTimes(1);
    });

    it("should reset on touch end", () => {
      render(<Button>Touch me</Button>);

      const button = screen.getByRole("button", { name: "Touch me" });

      fireEvent.touchStart(button, {
        touches: [{ clientX: 100, clientY: 100 }],
      });

      expect(button).toHaveClass("opacity-80");

      fireEvent.touchEnd(button);

      expect(button).not.toHaveClass("opacity-80");
    });

    it("should reset on touch cancel", () => {
      render(<Button>Touch me</Button>);

      const button = screen.getByRole("button", { name: "Touch me" });

      fireEvent.touchStart(button, {
        touches: [{ clientX: 100, clientY: 100 }],
      });

      expect(button).toHaveClass("opacity-80");

      fireEvent.touchCancel(button);

      expect(button).not.toHaveClass("opacity-80");
    });
  });

  describe("mouse handling", () => {
    it("should show pressed state on mouse down", () => {
      render(<Button>Click me</Button>);

      const button = screen.getByRole("button", { name: "Click me" });

      fireEvent.mouseDown(button);

      expect(button).toHaveClass("opacity-80");
    });

    it("should reset pressed state on mouse up", () => {
      render(<Button>Click me</Button>);

      const button = screen.getByRole("button", { name: "Click me" });

      fireEvent.mouseDown(button);
      expect(button).toHaveClass("opacity-80");

      fireEvent.mouseUp(button);
      expect(button).not.toHaveClass("opacity-80");
    });

    it("should reset pressed state on mouse leave", () => {
      render(<Button>Click me</Button>);

      const button = screen.getByRole("button", { name: "Click me" });

      fireEvent.mouseDown(button);
      expect(button).toHaveClass("opacity-80");

      fireEvent.mouseLeave(button);
      expect(button).not.toHaveClass("opacity-80");
    });
  });

  describe("disabled state", () => {
    it("should have disabled attribute when disabled", () => {
      render(<Button disabled>Disabled</Button>);

      const button = screen.getByRole("button", { name: "Disabled" });
      expect(button).toBeDisabled();
    });

    it("should not show pressed state when disabled", () => {
      render(<Button disabled>Disabled</Button>);

      const button = screen.getByRole("button", { name: "Disabled" });

      fireEvent.touchStart(button, {
        touches: [{ clientX: 100, clientY: 100 }],
      });

      // Pressed opacity-80 is conditional on !props.disabled
      // When disabled, it shouldn't add opacity-80 class (isPressed && !disabled)
      // Actually looking at the code, the press state is still set even when disabled,
      // but the className only applies opacity-80 when !props.disabled
      // So we can't directly test this via class, but clicking should be blocked
      fireEvent.mouseDown(button);
      // opacity-80 only applied when isPressed && !props.disabled
      // Since button is disabled, the conditional isPressed && !props.disabled is false
      expect(button).not.toHaveClass("opacity-80");
    });
  });

  describe("additional props", () => {
    it("should pass through HTML attributes", () => {
      render(
        <Button type="submit" aria-label="Submit form">
          Submit
        </Button>,
      );

      const button = screen.getByRole("button", { name: "Submit form" });
      expect(button).toHaveAttribute("type", "submit");
    });

    it("should apply custom className", () => {
      render(<Button className="custom-class">Custom</Button>);

      const button = screen.getByRole("button", { name: "Custom" });
      expect(button).toHaveClass("custom-class");
    });
  });
});
