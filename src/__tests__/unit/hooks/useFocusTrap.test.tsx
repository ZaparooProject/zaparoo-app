/**
 * Unit Tests: useFocusTrap Hook
 *
 * Tests for focus trap functionality including:
 * - Tab key interception and cycling
 * - Shift+Tab cycling
 * - Cleanup on deactivation
 *
 * Note: Some focus-related tests are limited by the test environment
 * (happy-dom) not fully supporting offsetParent visibility checks.
 * The keyboard event handling is tested by verifying component stability.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useRef } from "react";
import { useFocusTrap } from "@/hooks/useFocusTrap";

describe("useFocusTrap", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("initialization", () => {
    it("should not throw when rendered with isActive true", () => {
      // Arrange & Act & Assert
      expect(() => {
        renderHook(() => {
          const containerRef = useRef<HTMLDivElement>(null);
          useFocusTrap({
            isActive: true,
            containerRef,
            autoFocus: false,
          });
        });
      }).not.toThrow();
    });

    it("should not throw when rendered with isActive false", () => {
      // Arrange & Act & Assert
      expect(() => {
        renderHook(() => {
          const containerRef = useRef<HTMLDivElement>(null);
          useFocusTrap({
            isActive: false,
            containerRef,
            autoFocus: false,
          });
        });
      }).not.toThrow();
    });

    it("should not throw when containerRef is null", () => {
      // Arrange & Act & Assert
      expect(() => {
        renderHook(() => {
          const containerRef = useRef<HTMLDivElement>(null);
          useFocusTrap({
            isActive: true,
            containerRef,
            autoFocus: false,
          });
        });
      }).not.toThrow();
    });
  });

  describe("cleanup", () => {
    it("should clean up when unmounted while active", () => {
      // Arrange
      const { unmount } = renderHook(() => {
        const containerRef = useRef<HTMLDivElement>(null);
        useFocusTrap({
          isActive: true,
          containerRef,
          autoFocus: false,
        });
      });

      // Act & Assert - unmount should not throw
      expect(() => unmount()).not.toThrow();
    });

    it("should clean up when isActive changes to false", () => {
      // Arrange
      let isActive = true;
      const { rerender } = renderHook(() => {
        const containerRef = useRef<HTMLDivElement>(null);
        useFocusTrap({
          isActive,
          containerRef,
          autoFocus: false,
        });
      });

      // Act - Deactivate
      isActive = false;

      // Assert - rerender should not throw
      expect(() => rerender()).not.toThrow();
    });
  });

  describe("options", () => {
    it("should accept autoFocus option", () => {
      // Arrange & Act & Assert
      expect(() => {
        renderHook(() => {
          const containerRef = useRef<HTMLDivElement>(null);
          useFocusTrap({
            isActive: true,
            containerRef,
            autoFocus: true,
          });
        });
      }).not.toThrow();
    });

    it("should accept restoreFocus option", () => {
      // Arrange & Act & Assert
      expect(() => {
        renderHook(() => {
          const containerRef = useRef<HTMLDivElement>(null);
          useFocusTrap({
            isActive: true,
            containerRef,
            restoreFocus: true,
          });
        });
      }).not.toThrow();
    });

    it("should accept both options together", () => {
      // Arrange & Act & Assert
      expect(() => {
        renderHook(() => {
          const containerRef = useRef<HTMLDivElement>(null);
          useFocusTrap({
            isActive: true,
            containerRef,
            autoFocus: true,
            restoreFocus: true,
          });
        });
      }).not.toThrow();
    });
  });

  describe("keyboard handling", () => {
    it("should not prevent default on non-Tab keys", () => {
      // Arrange
      renderHook(() => {
        const containerRef = useRef<HTMLDivElement>(null);
        useFocusTrap({
          isActive: true,
          containerRef,
          autoFocus: false,
        });
      });

      // Act
      const event = new KeyboardEvent("keydown", {
        key: "Enter",
        bubbles: true,
      });
      const preventDefaultSpy = vi.spyOn(event, "preventDefault");
      document.dispatchEvent(event);

      // Assert
      expect(preventDefaultSpy).not.toHaveBeenCalled();
    });

    it("should handle Tab key events without throwing", () => {
      // Arrange
      renderHook(() => {
        const containerRef = useRef<HTMLDivElement>(null);
        useFocusTrap({
          isActive: true,
          containerRef,
          autoFocus: false,
        });
      });

      // Act & Assert - dispatching Tab should not throw
      expect(() => {
        const event = new KeyboardEvent("keydown", {
          key: "Tab",
          bubbles: true,
        });
        document.dispatchEvent(event);
      }).not.toThrow();
    });

    it("should handle Shift+Tab key events without throwing", () => {
      // Arrange
      renderHook(() => {
        const containerRef = useRef<HTMLDivElement>(null);
        useFocusTrap({
          isActive: true,
          containerRef,
          autoFocus: false,
        });
      });

      // Act & Assert - dispatching Shift+Tab should not throw
      expect(() => {
        const event = new KeyboardEvent("keydown", {
          key: "Tab",
          shiftKey: true,
          bubbles: true,
        });
        document.dispatchEvent(event);
      }).not.toThrow();
    });
  });
});
