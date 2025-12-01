import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act } from "../../../test-utils";
import { renderHook } from "@testing-library/react";
import {
  A11yAnnouncerProvider,
  useAnnouncer,
} from "../../../components/A11yAnnouncer";

describe("A11yAnnouncer", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("A11yAnnouncerProvider", () => {
    it("renders children", () => {
      render(
        <A11yAnnouncerProvider>
          <div data-testid="child">Child content</div>
        </A11yAnnouncerProvider>,
      );

      expect(screen.getByTestId("child")).toBeInTheDocument();
    });

    it("renders polite aria-live region", () => {
      const { container } = render(
        <A11yAnnouncerProvider>
          <div>Content</div>
        </A11yAnnouncerProvider>,
      );

      const politeRegion = container.querySelector('[aria-live="polite"]');
      expect(politeRegion).toBeInTheDocument();
      expect(politeRegion).toHaveAttribute("aria-atomic", "true");
      expect(politeRegion).toHaveAttribute("role", "status");
      expect(politeRegion).toHaveClass("sr-only");
    });

    it("renders assertive aria-live region", () => {
      const { container } = render(
        <A11yAnnouncerProvider>
          <div>Content</div>
        </A11yAnnouncerProvider>,
      );

      const assertiveRegion = container.querySelector(
        '[aria-live="assertive"]',
      );
      expect(assertiveRegion).toBeInTheDocument();
      expect(assertiveRegion).toHaveAttribute("aria-atomic", "true");
      expect(assertiveRegion).toHaveAttribute("role", "alert");
      expect(assertiveRegion).toHaveClass("sr-only");
    });
  });

  describe("useAnnouncer hook", () => {
    it("throws error when used outside provider", () => {
      // Suppress console.error for this test
      const consoleSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      expect(() => {
        renderHook(() => useAnnouncer());
      }).toThrow("useAnnouncer must be used within A11yAnnouncerProvider");

      consoleSpy.mockRestore();
    });

    it("provides announce function", () => {
      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <A11yAnnouncerProvider>{children}</A11yAnnouncerProvider>
      );

      const { result } = renderHook(() => useAnnouncer(), { wrapper });

      expect(result.current.announce).toBeDefined();
      expect(typeof result.current.announce).toBe("function");
    });

    it("announces polite message by default", async () => {
      const TestComponent = () => {
        const { announce } = useAnnouncer();
        return (
          <button onClick={() => announce("Test message")}>Announce</button>
        );
      };

      const { container } = render(
        <A11yAnnouncerProvider>
          <TestComponent />
        </A11yAnnouncerProvider>,
      );

      const button = screen.getByRole("button");

      await act(async () => {
        button.click();
        // Allow requestAnimationFrame to run
        await vi.advanceTimersByTimeAsync(16);
      });

      const politeRegion = container.querySelector('[aria-live="polite"]');
      expect(politeRegion).toHaveTextContent("Test message");
    });

    it("announces assertive message with priority", async () => {
      const TestComponent = () => {
        const { announce } = useAnnouncer();
        return (
          <button onClick={() => announce("Urgent message", "assertive")}>
            Announce
          </button>
        );
      };

      const { container } = render(
        <A11yAnnouncerProvider>
          <TestComponent />
        </A11yAnnouncerProvider>,
      );

      const button = screen.getByRole("button");

      await act(async () => {
        button.click();
        await vi.advanceTimersByTimeAsync(16);
      });

      const assertiveRegion = container.querySelector(
        '[aria-live="assertive"]',
      );
      expect(assertiveRegion).toHaveTextContent("Urgent message");
    });

    it("clears message after timeout", async () => {
      const TestComponent = () => {
        const { announce } = useAnnouncer();
        return (
          <button onClick={() => announce("Temporary message")}>
            Announce
          </button>
        );
      };

      const { container } = render(
        <A11yAnnouncerProvider>
          <TestComponent />
        </A11yAnnouncerProvider>,
      );

      const button = screen.getByRole("button");

      await act(async () => {
        button.click();
        await vi.advanceTimersByTimeAsync(16);
      });

      const politeRegion = container.querySelector('[aria-live="polite"]');
      expect(politeRegion).toHaveTextContent("Temporary message");

      // After 1 second, message should be cleared
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1000);
      });

      expect(politeRegion).toHaveTextContent("");
    });
  });
});
