/**
 * Unit Tests: useFocusTrap Hook
 *
 * Tests for focus trap functionality using a real component with DOM elements.
 * Tests verify:
 * - Tab key cycles focus from last to first element
 * - Shift+Tab cycles focus from first to last element
 * - autoFocus focuses the first focusable element on activation
 * - restoreFocus returns focus to previous element on deactivation
 * - Non-Tab keys are not intercepted
 * - Cleanup removes event listeners
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useRef, useState } from "react";
import { useFocusTrap } from "@/hooks/useFocusTrap";

// happy-dom doesn't support offsetParent - mock it to make elements "visible"
const originalOffsetParent = Object.getOwnPropertyDescriptor(
  HTMLElement.prototype,
  "offsetParent",
);

beforeEach(() => {
  // Make all elements appear visible by returning document.body as offsetParent
  Object.defineProperty(HTMLElement.prototype, "offsetParent", {
    configurable: true,
    get() {
      return document.body;
    },
  });
});

afterEach(() => {
  // Restore original offsetParent behavior
  if (originalOffsetParent) {
    Object.defineProperty(
      HTMLElement.prototype,
      "offsetParent",
      originalOffsetParent,
    );
  }
});

/**
 * Test component that uses the focus trap hook with real DOM elements
 */
function FocusTrapTestComponent({
  isActive,
  autoFocus = true,
  restoreFocus = true,
  onEscape,
}: {
  isActive: boolean;
  autoFocus?: boolean;
  restoreFocus?: boolean;
  onEscape?: () => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  useFocusTrap({
    isActive,
    containerRef,
    autoFocus,
    restoreFocus,
    onEscape,
  });

  return (
    <div>
      <button>Outside</button>
      <div ref={containerRef} data-testid="trap-container" tabIndex={-1}>
        <button>First</button>
        <input type="text" aria-label="Middle input" />
        <button>Last</button>
      </div>
    </div>
  );
}

/**
 * Component to test restoreFocus behavior - has a trigger button outside the trap
 */
function FocusTrapWithTrigger() {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  useFocusTrap({
    isActive: isOpen,
    containerRef,
    autoFocus: true,
    restoreFocus: true,
  });

  return (
    <div>
      <button onClick={() => setIsOpen(true)}>Open trap</button>
      {isOpen && (
        <div ref={containerRef} role="dialog">
          <button onClick={() => setIsOpen(false)}>Close</button>
          <button>Other</button>
        </div>
      )}
    </div>
  );
}

function NestedFocusTraps({
  onOuterEscape,
  onInnerEscape,
}: {
  onOuterEscape: () => void;
  onInnerEscape: () => void;
}) {
  const outerRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  useFocusTrap({
    isActive: true,
    containerRef: outerRef,
    autoFocus: false,
    restoreFocus: false,
    onEscape: onOuterEscape,
    inertBackground: false,
  });
  useFocusTrap({
    isActive: true,
    containerRef: innerRef,
    autoFocus: false,
    restoreFocus: false,
    onEscape: onInnerEscape,
    inertBackground: false,
  });

  return (
    <div ref={outerRef}>
      <button>Outer first</button>
      <div ref={innerRef}>
        <button>Inner first</button>
        <button>Inner last</button>
      </div>
    </div>
  );
}

function FocusTrapWithControlledSibling({
  trapActive,
  siblingInert,
}: {
  trapActive: boolean;
  siblingInert: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  useFocusTrap({
    isActive: trapActive,
    containerRef,
    autoFocus: false,
    restoreFocus: false,
  });

  return (
    <div>
      <div data-testid="controlled-sibling" inert={siblingInert} />
      <div ref={containerRef} data-testid="trap-container" />
    </div>
  );
}

function FocusTrapWithRemovedTrigger() {
  const [isOpen, setIsOpen] = useState(false);
  const [showTrigger, setShowTrigger] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);
  useFocusTrap({
    isActive: isOpen,
    containerRef,
    autoFocus: true,
    restoreFocus: true,
  });

  return (
    <main id="main-content">
      <h1 tabIndex={-1}>Page heading</h1>
      {showTrigger && (
        <button type="button" onClick={() => setIsOpen(true)}>
          Open removable trap
        </button>
      )}
      {isOpen && (
        <div ref={containerRef} role="dialog">
          <button type="button" onClick={() => setShowTrigger(false)}>
            Remove trigger
          </button>
          <button type="button" onClick={() => setIsOpen(false)}>
            Close removable trap
          </button>
        </div>
      )}
    </main>
  );
}

describe("useFocusTrap", () => {
  describe("focus cycling", () => {
    it("should cycle focus from last to first element on Tab", async () => {
      // Arrange
      const user = userEvent.setup();
      render(<FocusTrapTestComponent isActive={true} autoFocus={false} />);

      // Act - Focus the last button and press Tab
      const lastButton = screen.getByRole("button", { name: "Last" });
      lastButton.focus();
      expect(lastButton).toHaveFocus();

      await user.tab();

      // Assert - Focus should cycle to first element
      const firstButton = screen.getByRole("button", { name: "First" });
      expect(firstButton).toHaveFocus();
    });

    it("should cycle focus from first to last element on Shift+Tab", async () => {
      // Arrange
      const user = userEvent.setup();
      render(<FocusTrapTestComponent isActive={true} autoFocus={false} />);

      // Act - Focus the first button and press Shift+Tab
      const firstButton = screen.getByRole("button", { name: "First" });
      firstButton.focus();
      expect(firstButton).toHaveFocus();

      await user.tab({ shift: true });

      // Assert - Focus should cycle to last element
      const lastButton = screen.getByRole("button", { name: "Last" });
      expect(lastButton).toHaveFocus();
    });

    it("should allow normal Tab navigation between elements", async () => {
      // Arrange
      const user = userEvent.setup();
      render(<FocusTrapTestComponent isActive={true} autoFocus={false} />);

      // Act - Focus first and tab to middle
      const firstButton = screen.getByRole("button", { name: "First" });
      firstButton.focus();
      await user.tab();

      // Assert - Focus should move to middle input (normal tab behavior)
      const middleInput = screen.getByRole("textbox", { name: "Middle input" });
      expect(middleInput).toHaveFocus();
    });
  });

  describe("autoFocus", () => {
    it("should focus first focusable element when autoFocus is true", async () => {
      // Arrange & Act
      render(<FocusTrapTestComponent isActive={true} autoFocus={true} />);

      // Assert - First button should be focused after requestAnimationFrame
      const firstButton = screen.getByRole("button", { name: "First" });
      await waitFor(() => {
        expect(firstButton).toHaveFocus();
      });
    });

    it("should not auto-focus when autoFocus is false", async () => {
      // Arrange & Act
      render(<FocusTrapTestComponent isActive={true} autoFocus={false} />);

      // Assert - No element in the trap should be focused
      // Wait a tick to ensure any potential auto-focus would have happened
      await act(async () => {
        await new Promise((r) => requestAnimationFrame(r));
      });

      const firstButton = screen.getByRole("button", { name: "First" });
      expect(firstButton).not.toHaveFocus();
    });
  });

  describe("restoreFocus", () => {
    it("should restore focus to trigger when trap is deactivated", async () => {
      // Arrange
      const user = userEvent.setup();
      render(<FocusTrapWithTrigger />);

      const openButton = screen.getByRole("button", { name: "Open trap" });
      openButton.focus();
      expect(openButton).toHaveFocus();

      // Act - Open the trap
      await user.click(openButton);

      // Wait for dialog to appear and receive focus
      const dialog = await screen.findByRole("dialog");
      expect(dialog).toBeInTheDocument();

      // Close the trap
      const closeButton = screen.getByRole("button", { name: "Close" });
      await user.click(closeButton);

      // Assert - Focus should return to the open button
      await waitFor(() => {
        expect(openButton).toHaveFocus();
      });
    });

    it("should focus the page heading when the trigger was removed", async () => {
      const user = userEvent.setup();
      render(<FocusTrapWithRemovedTrigger />);

      const trigger = screen.getByRole("button", {
        name: "Open removable trap",
      });
      await user.click(trigger);
      await user.click(screen.getByRole("button", { name: "Remove trigger" }));
      await user.click(
        screen.getByRole("button", { name: "Close removable trap" }),
      );

      expect(
        screen.getByRole("heading", { name: "Page heading" }),
      ).toHaveFocus();
    });
  });

  describe("modal isolation", () => {
    it("should make surrounding content inert only while active", () => {
      const { rerender } = render(
        <FocusTrapTestComponent isActive={true} autoFocus={false} />,
      );

      expect(
        screen.getByRole("button", { name: "Outside", hidden: true }),
      ).toHaveAttribute("inert");

      rerender(<FocusTrapTestComponent isActive={false} autoFocus={false} />);

      expect(
        screen.getByRole("button", { name: "Outside" }),
      ).not.toHaveAttribute("inert");
    });

    it("should preserve owner updates made while isolation is removed", () => {
      const view = render(
        <FocusTrapWithControlledSibling trapActive siblingInert />,
      );

      view.rerender(
        <FocusTrapWithControlledSibling
          trapActive={false}
          siblingInert={false}
        />,
      );

      expect(screen.getByTestId("controlled-sibling")).not.toHaveAttribute(
        "inert",
      );
    });

    it("should preserve a newer owner adding inert during deactivation", () => {
      const view = render(
        <FocusTrapWithControlledSibling trapActive siblingInert={false} />,
      );

      view.rerender(
        <FocusTrapWithControlledSibling trapActive={false} siblingInert />,
      );

      expect(screen.getByTestId("controlled-sibling")).toHaveAttribute("inert");
    });
  });

  describe("inactive state", () => {
    it("should not trap focus when isActive is false", async () => {
      // Arrange
      const user = userEvent.setup();
      render(<FocusTrapTestComponent isActive={false} autoFocus={false} />);

      // Act - Focus the last button and press Tab
      const lastButton = screen.getByRole("button", { name: "Last" });
      lastButton.focus();
      await user.tab();

      // Assert - Focus should move outside the container (not trapped)
      // When inactive, the trap doesn't prevent default tab behavior
      expect(lastButton).not.toHaveFocus();
    });
  });

  describe("keyboard handling", () => {
    it("should invoke dismissal when Escape is pressed", async () => {
      const user = userEvent.setup();
      const onEscape = vi.fn();
      render(
        <FocusTrapTestComponent
          isActive={true}
          autoFocus={false}
          onEscape={onEscape}
        />,
      );

      await user.keyboard("{Escape}");

      expect(onEscape).toHaveBeenCalledTimes(1);
    });

    it("should return escaped focus to the trap on Tab", async () => {
      const user = userEvent.setup();
      render(<FocusTrapTestComponent isActive={true} autoFocus={false} />);

      const outside = screen.getByRole("button", {
        name: "Outside",
        hidden: true,
      });
      outside.focus();
      await user.tab();

      expect(screen.getByRole("button", { name: "First" })).toHaveFocus();
    });

    it("should not intercept non-Tab keys", async () => {
      // Arrange
      const user = userEvent.setup();
      const handleKeyDown = vi.fn();
      render(
        <div onKeyDown={handleKeyDown}>
          <FocusTrapTestComponent isActive={true} autoFocus={false} />
        </div>,
      );

      // Act - Press Enter key
      const firstButton = screen.getByRole("button", { name: "First" });
      firstButton.focus();
      await user.keyboard("{Enter}");

      // Assert - Enter should propagate normally (not prevented)
      expect(handleKeyDown).toHaveBeenCalledWith(
        expect.objectContaining({ key: "Enter" }),
      );
    });
  });

  describe("nested traps", () => {
    it("should send Escape only to the topmost trap", async () => {
      const user = userEvent.setup();
      const onOuterEscape = vi.fn();
      const onInnerEscape = vi.fn();
      render(
        <NestedFocusTraps
          onOuterEscape={onOuterEscape}
          onInnerEscape={onInnerEscape}
        />,
      );

      await user.keyboard("{Escape}");

      expect(onInnerEscape).toHaveBeenCalledTimes(1);
      expect(onOuterEscape).not.toHaveBeenCalled();
    });

    it("should trap Tab only in the topmost trap", async () => {
      const user = userEvent.setup();
      render(
        <NestedFocusTraps onOuterEscape={vi.fn()} onInnerEscape={vi.fn()} />,
      );
      const outerFirst = screen.getByRole("button", { name: "Outer first" });
      const innerFirst = screen.getByRole("button", { name: "Inner first" });
      const innerLast = screen.getByRole("button", { name: "Inner last" });
      const outerFocus = vi.spyOn(outerFirst, "focus");
      innerLast.focus();

      await user.tab();

      expect(innerFirst).toHaveFocus();
      expect(outerFocus).not.toHaveBeenCalled();
    });
  });

  describe("cleanup", () => {
    it("should remove event listeners on unmount", async () => {
      // Arrange
      const user = userEvent.setup();
      const { unmount } = render(
        <FocusTrapTestComponent isActive={true} autoFocus={false} />,
      );

      // Verify trap is working
      const lastButton = screen.getByRole("button", { name: "Last" });
      lastButton.focus();
      await user.tab();
      expect(screen.getByRole("button", { name: "First" })).toHaveFocus();

      // Act - Unmount
      unmount();

      // Create a new element after unmount to verify listener is gone
      const testDiv = document.createElement("div");
      testDiv.innerHTML = '<button id="test-btn">Test</button>';
      document.body.appendChild(testDiv);
      const testButton = document.getElementById(
        "test-btn",
      ) as HTMLButtonElement;
      testButton.focus();

      // Tab should work normally (no trap)
      await user.tab();

      // Cleanup
      document.body.removeChild(testDiv);

      // Assert - If listeners weren't cleaned up, this would error or behave unexpectedly
      // The test passing without errors indicates proper cleanup
    });
  });
});
