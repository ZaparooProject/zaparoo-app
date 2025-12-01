import { describe, it, expect, vi } from "vitest";
import { render, renderHook, screen } from "../../../test-utils";
import { useSlideModalManager } from "../../../hooks/useSlideModalManager";
import { SlideModalProvider } from "../../../components/SlideModalProvider";

describe("useSlideModalManager", () => {
  it("should throw error when used outside provider", () => {
    // Suppress console.error for this test since we expect an error
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    expect(() => {
      renderHook(() => useSlideModalManager());
    }).toThrow("useSlideModalManager must be used within a SlideModalProvider");

    consoleSpy.mockRestore();
  });

  describe("with provider", () => {
    it("should register and unregister modals", () => {
      const { result } = renderHook(() => useSlideModalManager(), {
        wrapper: SlideModalProvider,
      });

      const mockClose1 = vi.fn();
      const mockClose2 = vi.fn();

      // Register modals
      result.current.registerModal("modal1", mockClose1);
      result.current.registerModal("modal2", mockClose2);

      // Test closeAllExcept
      result.current.closeAllExcept("modal1");

      expect(mockClose1).not.toHaveBeenCalled();
      expect(mockClose2).toHaveBeenCalled();
    });

    it("should unregister modals", () => {
      const { result } = renderHook(() => useSlideModalManager(), {
        wrapper: SlideModalProvider,
      });

      const mockClose = vi.fn();

      // Register modal
      result.current.registerModal("modal1", mockClose);

      // Unregister modal
      result.current.unregisterModal("modal1");

      // Try to close all except modal1 - since it's unregistered, nothing should happen
      result.current.closeAllExcept("other");

      expect(mockClose).not.toHaveBeenCalled();
    });

    it("should handle closeAllExcept with no registered modals", () => {
      const { result } = renderHook(() => useSlideModalManager(), {
        wrapper: SlideModalProvider,
      });

      // This should not throw an error
      expect(() => {
        result.current.closeAllExcept("nonexistent");
      }).not.toThrow();
    });
  });

  describe("SlideModalProvider", () => {
    it("should render children", () => {
      const TestComponent = () => <div>Test Child</div>;

      render(
        <SlideModalProvider>
          <TestComponent />
        </SlideModalProvider>,
      );

      expect(screen.getByText("Test Child")).toBeInTheDocument();
    });
  });
});
