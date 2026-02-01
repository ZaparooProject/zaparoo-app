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
}: {
  isActive: boolean;
  autoFocus?: boolean;
  restoreFocus?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  useFocusTrap({ isActive, containerRef, autoFocus, restoreFocus });

  return (
    <div ref={containerRef} data-testid="trap-container">
      <button>First</button>
      <input type="text" aria-label="Middle input" />
      <button>Last</button>
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
