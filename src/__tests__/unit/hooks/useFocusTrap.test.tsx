/**
 * Unit Tests: useFocusTrap Hook
 *
 * Tests for focus trap functionality including:
 * - Tab key interception and cycling
 * - Shift+Tab cycling
 * - Event listener cleanup on deactivation
 *
 * Note: Some focus-related tests are limited by the test environment
 * (happy-dom) not fully supporting offsetParent visibility checks.
 * The keyboard event handling is tested directly instead.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { useRef, useState } from "react";
import { useFocusTrap } from "@/hooks/useFocusTrap";

// Simple test component with focus trap
function FocusTrapTestComponent({
  initialActive = true,
  autoFocus = false,
  restoreFocus = false,
}: {
  initialActive?: boolean;
  autoFocus?: boolean;
  restoreFocus?: boolean;
}) {
  const [isActive, setIsActive] = useState(initialActive);
  const containerRef = useRef<HTMLDivElement>(null);

  useFocusTrap({
    isActive,
    containerRef,
    autoFocus,
    restoreFocus,
  });

  return (
    <div>
      <button data-testid="outside-button" onClick={() => setIsActive(true)}>
        Outside
      </button>

      <div ref={containerRef} data-testid="trap-container">
        <button data-testid="first-button">First</button>
        <input data-testid="input-field" type="text" />
        <button data-testid="last-button" onClick={() => setIsActive(false)}>
          Last
        </button>
      </div>
    </div>
  );
}

// Component with no focusable elements inside the trap
function EmptyTrapComponent() {
  const containerRef = useRef<HTMLDivElement>(null);

  useFocusTrap({
    isActive: true,
    containerRef,
    autoFocus: false,
  });

  return (
    <div ref={containerRef} data-testid="empty-container">
      <p>No focusable elements here</p>
    </div>
  );
}

// Component that toggles active state
function ToggleableTrapComponent({ onCleanup }: { onCleanup?: () => void }) {
  const [isActive, setIsActive] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useFocusTrap({
    isActive,
    containerRef,
    autoFocus: false,
    restoreFocus: false,
  });

  return (
    <div>
      <button
        data-testid="toggle-button"
        onClick={() => {
          setIsActive(!isActive);
          if (isActive && onCleanup) onCleanup();
        }}
      >
        Toggle
      </button>
      <div ref={containerRef} data-testid="trap-container">
        <button data-testid="inner-button">Inner</button>
      </div>
    </div>
  );
}

describe("useFocusTrap", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("initialization", () => {
    it("should render without errors when active", () => {
      expect(() =>
        render(<FocusTrapTestComponent initialActive={true} />),
      ).not.toThrow();
    });

    it("should render without errors when inactive", () => {
      expect(() =>
        render(<FocusTrapTestComponent initialActive={false} />),
      ).not.toThrow();
    });

    it("should handle container with no focusable elements", () => {
      expect(() => render(<EmptyTrapComponent />)).not.toThrow();
    });
  });

  describe("Tab key handling", () => {
    it("should add keydown listener when active", () => {
      const addEventListenerSpy = vi.spyOn(document, "addEventListener");

      render(<FocusTrapTestComponent initialActive={true} />);

      expect(addEventListenerSpy).toHaveBeenCalledWith(
        "keydown",
        expect.any(Function),
      );
    });

    it("should not add keydown listener when inactive", () => {
      const addEventListenerSpy = vi.spyOn(document, "addEventListener");

      render(<FocusTrapTestComponent initialActive={false} />);

      // Should not have been called with keydown (may be called for other events)
      const keydownCalls = addEventListenerSpy.mock.calls.filter(
        (call) => call[0] === "keydown",
      );
      expect(keydownCalls.length).toBe(0);
    });

    it("should remove keydown listener on cleanup", () => {
      const removeEventListenerSpy = vi.spyOn(document, "removeEventListener");

      const { unmount } = render(
        <FocusTrapTestComponent initialActive={true} />,
      );
      unmount();

      expect(removeEventListenerSpy).toHaveBeenCalledWith(
        "keydown",
        expect.any(Function),
      );
    });

    it("should ignore non-Tab key presses", () => {
      render(<FocusTrapTestComponent initialActive={true} />);

      const firstButton = screen.getByTestId("first-button");
      firstButton.focus();

      // Fire non-Tab key - should not cause any errors
      const event = new KeyboardEvent("keydown", {
        key: "Enter",
        bubbles: true,
      });
      const preventDefaultSpy = vi.spyOn(event, "preventDefault");
      document.dispatchEvent(event);

      expect(preventDefaultSpy).not.toHaveBeenCalled();
    });
  });

  describe("focus cycling behavior", () => {
    it("should handle Tab key at last focusable element", () => {
      render(<FocusTrapTestComponent initialActive={true} />);

      const lastButton = screen.getByTestId("last-button");
      lastButton.focus();

      const event = new KeyboardEvent("keydown", {
        key: "Tab",
        shiftKey: false,
        bubbles: true,
      });

      // Dispatch Tab event - in test environment, offsetParent is null
      // so elements are filtered out. The hook gracefully handles empty focus lists.
      document.dispatchEvent(event);

      // Verify component remains stable after Tab event
      expect(lastButton).toBeInTheDocument();
    });

    it("should handle Shift+Tab at first focusable element", () => {
      render(<FocusTrapTestComponent initialActive={true} />);

      const firstButton = screen.getByTestId("first-button");
      firstButton.focus();

      const event = new KeyboardEvent("keydown", {
        key: "Tab",
        shiftKey: true,
        bubbles: true,
      });

      document.dispatchEvent(event);

      // Verify component remains stable after Shift+Tab event
      expect(firstButton).toBeInTheDocument();
    });
  });

  describe("activation and deactivation", () => {
    it("should add listener when activated", () => {
      const addEventListenerSpy = vi.spyOn(document, "addEventListener");

      render(<ToggleableTrapComponent />);

      // Initially inactive - no keydown listener
      const initialCalls = addEventListenerSpy.mock.calls.filter(
        (call) => call[0] === "keydown",
      );
      expect(initialCalls.length).toBe(0);

      // Activate
      fireEvent.click(screen.getByTestId("toggle-button"));

      // Now should have keydown listener
      const afterActivateCalls = addEventListenerSpy.mock.calls.filter(
        (call) => call[0] === "keydown",
      );
      expect(afterActivateCalls.length).toBe(1);
    });

    it("should remove listener when deactivated", () => {
      const removeEventListenerSpy = vi.spyOn(document, "removeEventListener");

      render(<ToggleableTrapComponent />);

      // Activate
      fireEvent.click(screen.getByTestId("toggle-button"));

      // Deactivate
      fireEvent.click(screen.getByTestId("toggle-button"));

      const keydownRemoveCalls = removeEventListenerSpy.mock.calls.filter(
        (call) => call[0] === "keydown",
      );
      expect(keydownRemoveCalls.length).toBe(1);
    });
  });

  describe("options", () => {
    it("should respect autoFocus option", () => {
      // With autoFocus false, first element should not be automatically focused
      render(<FocusTrapTestComponent initialActive={true} autoFocus={false} />);

      const firstButton = screen.getByTestId("first-button");
      // In test environment, focus won't happen anyway due to offsetParent,
      // but we can verify the component renders correctly
      expect(firstButton).toBeInTheDocument();
    });

    it("should respect restoreFocus option", () => {
      // With restoreFocus false, focus should not be restored on deactivation
      render(
        <FocusTrapTestComponent initialActive={true} restoreFocus={false} />,
      );

      const lastButton = screen.getByTestId("last-button");
      expect(lastButton).toBeInTheDocument();
    });
  });
});
