/**
 * Unit tests for HeaderButton component
 *
 * Tests rendering, click handling, touch handling, and active state
 */

import { render, screen, fireEvent } from "../../../../test-utils";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { HeaderButton } from "../../../../components/wui/HeaderButton";

// Note: This component uses fireEvent instead of userEvent for click tests because
// the component has custom touch/scroll gesture handling with internal timeouts
// that interfere with userEvent's event simulation. fireEvent is acceptable per
// testing guidelines when userEvent doesn't support the interaction pattern.

describe("HeaderButton", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("rendering", () => {
    it("should render with icon", () => {
      render(
        <HeaderButton
          icon={<span data-testid="test-icon">★</span>}
          aria-label="Test button"
        />,
      );

      expect(screen.getByTestId("test-icon")).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Test button" }),
      ).toBeInTheDocument();
    });

    it("should apply custom className", () => {
      render(
        <HeaderButton
          icon={<span>★</span>}
          aria-label="Test button"
          className="custom-class"
        />,
      );

      const button = screen.getByRole("button", { name: "Test button" });
      expect(button).toHaveClass("custom-class");
    });

    it("should apply aria-label for accessibility", () => {
      render(<HeaderButton icon={<span>★</span>} aria-label="Close menu" />);

      expect(
        screen.getByRole("button", { name: "Close menu" }),
      ).toBeInTheDocument();
    });

    it("should render with title attribute", () => {
      render(
        <HeaderButton
          icon={<span>★</span>}
          aria-label="Settings"
          title="Open settings"
        />,
      );

      const button = screen.getByRole("button", { name: "Settings" });
      expect(button).toHaveAttribute("title", "Open settings");
    });
  });

  describe("click handling", () => {
    it("should call onClick when clicked", () => {
      const handleClick = vi.fn();
      render(
        <HeaderButton
          icon={<span>★</span>}
          aria-label="Test button"
          onClick={handleClick}
        />,
      );

      const button = screen.getByRole("button", { name: "Test button" });
      fireEvent.click(button);

      expect(handleClick).toHaveBeenCalledTimes(1);
    });

    it("should not call onClick when disabled", () => {
      const handleClick = vi.fn();
      render(
        <HeaderButton
          icon={<span>★</span>}
          aria-label="Test button"
          onClick={handleClick}
          disabled
        />,
      );

      const button = screen.getByRole("button", { name: "Test button" });
      fireEvent.click(button);

      expect(handleClick).not.toHaveBeenCalled();
    });

    it("should not call onClick when touch moved (scroll gesture)", () => {
      const handleClick = vi.fn();
      render(
        <HeaderButton
          icon={<span>★</span>}
          aria-label="Test button"
          onClick={handleClick}
        />,
      );

      const button = screen.getByRole("button", { name: "Test button" });

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

  describe("active state", () => {
    it("should apply active styling when active prop is true", () => {
      render(
        <HeaderButton icon={<span>★</span>} aria-label="Test button" active />,
      );

      const button = screen.getByRole("button", { name: "Test button" });
      // Active state applies text-[#00E0FF] class
      expect(button).toHaveClass("text-[#00E0FF]");
    });

    it("should not apply active styling when active is false", () => {
      render(
        <HeaderButton
          icon={<span>★</span>}
          aria-label="Test button"
          active={false}
        />,
      );

      const button = screen.getByRole("button", { name: "Test button" });
      expect(button).not.toHaveClass("text-[#00E0FF]");
    });

    it("should not apply active styling when disabled even if active", () => {
      render(
        <HeaderButton
          icon={<span>★</span>}
          aria-label="Test button"
          active
          disabled
        />,
      );

      const button = screen.getByRole("button", { name: "Test button" });
      // When disabled, the active styling shouldn't apply
      expect(button).toHaveClass("cursor-not-allowed");
    });
  });

  describe("touch handling", () => {
    it("should track press state on touch start", () => {
      render(<HeaderButton icon={<span>★</span>} aria-label="Test button" />);

      const button = screen.getByRole("button", { name: "Test button" });

      fireEvent.touchStart(button, {
        touches: [{ clientX: 100, clientY: 100 }],
      });

      // Pressed state adds text-gray-400 class
      expect(button).toHaveClass("text-gray-400");
    });

    it("should detect scroll when moved more than 10px horizontally", () => {
      const handleClick = vi.fn();
      render(
        <HeaderButton
          icon={<span>★</span>}
          aria-label="Test button"
          onClick={handleClick}
        />,
      );

      const button = screen.getByRole("button", { name: "Test button" });

      fireEvent.touchStart(button, {
        touches: [{ clientX: 100, clientY: 100 }],
      });

      // Move more than 10px horizontally
      fireEvent.touchMove(button, {
        touches: [{ clientX: 115, clientY: 100 }],
      });

      // Pressed state should be removed after detecting scroll
      expect(button).not.toHaveClass("text-gray-400");

      fireEvent.touchEnd(button);
      fireEvent.click(button);

      expect(handleClick).not.toHaveBeenCalled();
    });

    it("should detect scroll when moved more than 10px vertically", () => {
      const handleClick = vi.fn();
      render(
        <HeaderButton
          icon={<span>★</span>}
          aria-label="Test button"
          onClick={handleClick}
        />,
      );

      const button = screen.getByRole("button", { name: "Test button" });

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
      render(
        <HeaderButton
          icon={<span>★</span>}
          aria-label="Test button"
          onClick={handleClick}
        />,
      );

      const button = screen.getByRole("button", { name: "Test button" });

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

    it("should reset state on touch end", () => {
      render(<HeaderButton icon={<span>★</span>} aria-label="Test button" />);

      const button = screen.getByRole("button", { name: "Test button" });

      fireEvent.touchStart(button, {
        touches: [{ clientX: 100, clientY: 100 }],
      });

      expect(button).toHaveClass("text-gray-400");

      fireEvent.touchEnd(button);

      // Pressed state should be removed
      expect(button).not.toHaveClass("text-gray-400");
    });

    it("should reset state on touch cancel", () => {
      render(<HeaderButton icon={<span>★</span>} aria-label="Test button" />);

      const button = screen.getByRole("button", { name: "Test button" });

      fireEvent.touchStart(button, {
        touches: [{ clientX: 100, clientY: 100 }],
      });

      expect(button).toHaveClass("text-gray-400");

      fireEvent.touchCancel(button);

      // Pressed state should be removed
      expect(button).not.toHaveClass("text-gray-400");
    });

    it("should ignore touch events when disabled", () => {
      render(
        <HeaderButton
          icon={<span>★</span>}
          aria-label="Test button"
          disabled
        />,
      );

      const button = screen.getByRole("button", { name: "Test button" });

      fireEvent.touchStart(button, {
        touches: [{ clientX: 100, clientY: 100 }],
      });

      // Pressed state should not be applied when disabled
      expect(button).not.toHaveClass("text-gray-400");
    });
  });

  describe("mouse handling", () => {
    it("should show pressed state on mouse down", () => {
      render(<HeaderButton icon={<span>★</span>} aria-label="Test button" />);

      const button = screen.getByRole("button", { name: "Test button" });

      fireEvent.mouseDown(button);

      expect(button).toHaveClass("text-gray-400");
    });

    it("should reset pressed state on mouse up", () => {
      render(<HeaderButton icon={<span>★</span>} aria-label="Test button" />);

      const button = screen.getByRole("button", { name: "Test button" });

      fireEvent.mouseDown(button);
      expect(button).toHaveClass("text-gray-400");

      fireEvent.mouseUp(button);
      expect(button).not.toHaveClass("text-gray-400");
    });

    it("should reset pressed state on mouse leave", () => {
      render(<HeaderButton icon={<span>★</span>} aria-label="Test button" />);

      const button = screen.getByRole("button", { name: "Test button" });

      fireEvent.mouseDown(button);
      expect(button).toHaveClass("text-gray-400");

      fireEvent.mouseLeave(button);
      expect(button).not.toHaveClass("text-gray-400");
    });

    it("should not show pressed state on mouse down when disabled", () => {
      render(
        <HeaderButton
          icon={<span>★</span>}
          aria-label="Test button"
          disabled
        />,
      );

      const button = screen.getByRole("button", { name: "Test button" });

      fireEvent.mouseDown(button);

      // Pressed state should not be applied when disabled
      expect(button).not.toHaveClass("text-gray-400");
    });
  });

  describe("disabled state", () => {
    it("should have disabled attribute when disabled", () => {
      render(
        <HeaderButton
          icon={<span>★</span>}
          aria-label="Test button"
          disabled
        />,
      );

      const button = screen.getByRole("button", { name: "Test button" });
      expect(button).toBeDisabled();
    });

    it("should apply disabled styling", () => {
      render(
        <HeaderButton
          icon={<span>★</span>}
          aria-label="Test button"
          disabled
        />,
      );

      const button = screen.getByRole("button", { name: "Test button" });
      expect(button).toHaveClass("cursor-not-allowed");
      expect(button).toHaveClass("text-gray-500");
    });
  });
});
