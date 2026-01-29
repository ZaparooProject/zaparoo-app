import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { useRef } from "react";
import { vi, describe, it, expect } from "vitest";
import { BackToTop } from "@/components/BackToTop";
import "@/test-setup";

// Mock lodash debounce
vi.mock("lodash", () => ({
  debounce: <T extends (...args: unknown[]) => unknown>(
    fn: T,
    _delay: number,
  ) => {
    const debouncedFn = (...args: Parameters<T>) => fn(...args);
    debouncedFn.cancel = vi.fn();
    return debouncedFn;
  },
}));

// Mock react-i18next
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

// Test component wrapper that creates a scroll container
function TestWrapper({
  threshold,
  scrollTop = 0,
}: {
  threshold?: number;
  scrollTop?: number;
}) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Set up initial scroll position
  if (scrollContainerRef.current) {
    Object.defineProperty(scrollContainerRef.current, "scrollTop", {
      value: scrollTop,
      writable: true,
    });
  }

  return (
    <div>
      <div
        ref={scrollContainerRef}
        style={{ height: "400px", overflow: "auto" }}
        data-testid="scroll-container"
      >
        <div style={{ height: "1000px" }}>Long content</div>
      </div>
      <BackToTop
        scrollContainerRef={scrollContainerRef}
        threshold={threshold}
      />
    </div>
  );
}

describe("BackToTop", () => {
  it("should render the back to top button", () => {
    render(<TestWrapper />);

    const button = screen.getByRole("button", { name: "backToTop" });
    expect(button).toBeInTheDocument();
  });

  it("should be hidden by default when scroll position is 0", () => {
    render(<TestWrapper />);

    const button = screen.getByRole("button", { name: "backToTop" });
    expect(button.parentElement).toHaveClass(
      "opacity-0",
      "pointer-events-none",
    );
  });

  it("should show when scrolled past threshold", async () => {
    render(<TestWrapper />);

    const container = screen.getByTestId("scroll-container");
    const button = screen.getByRole("button", { name: "backToTop" });

    // Mock scrollTop property
    Object.defineProperty(container, "scrollTop", {
      value: 400,
      writable: true,
    });

    // Trigger scroll event
    fireEvent.scroll(container);

    await waitFor(() => {
      expect(button.parentElement).toHaveClass(
        "opacity-100",
        "pointer-events-auto",
      );
    });
  });

  it("should use custom threshold", async () => {
    render(<TestWrapper threshold={500} />);

    const container = screen.getByTestId("scroll-container");
    const button = screen.getByRole("button", { name: "backToTop" });

    // Scroll to just below custom threshold
    Object.defineProperty(container, "scrollTop", {
      value: 300,
      writable: true,
    });

    fireEvent.scroll(container);

    await waitFor(() => {
      expect(button.parentElement).toHaveClass(
        "opacity-0",
        "pointer-events-none",
      );
    });

    // Scroll past custom threshold
    Object.defineProperty(container, "scrollTop", {
      value: 600,
      writable: true,
    });

    fireEvent.scroll(container);

    await waitFor(() => {
      expect(button.parentElement).toHaveClass(
        "opacity-100",
        "pointer-events-auto",
      );
    });
  });

  it("should scroll to top when button is clicked", () => {
    render(<TestWrapper />);

    const container = screen.getByTestId("scroll-container");
    const button = screen.getByRole("button", { name: "backToTop" });

    // Mock scrollTo method
    const scrollToSpy = vi.fn();
    container.scrollTo = scrollToSpy;

    fireEvent.click(button);

    expect(scrollToSpy).toHaveBeenCalledWith({
      top: 0,
      behavior: "smooth",
    });
  });

  it("should hide when scrolled back to top", async () => {
    render(<TestWrapper />);

    const container = screen.getByTestId("scroll-container");
    const button = screen.getByRole("button", { name: "backToTop" });

    // First scroll down
    Object.defineProperty(container, "scrollTop", {
      value: 400,
      writable: true,
    });
    fireEvent.scroll(container);

    await waitFor(() => {
      expect(button.parentElement).toHaveClass("opacity-100");
    });

    // Then scroll back to top
    Object.defineProperty(container, "scrollTop", {
      value: 0,
      writable: true,
    });
    fireEvent.scroll(container);

    await waitFor(() => {
      expect(button.parentElement).toHaveClass(
        "opacity-0",
        "pointer-events-none",
      );
    });
  });

  it("should handle missing scroll container gracefully", () => {
    const emptyRef = { current: null };

    // Should render without throwing
    render(<BackToTop scrollContainerRef={emptyRef} />);

    // Button should still be rendered but hidden
    const button = screen.getByRole("button", { name: "backToTop" });
    expect(button).toBeInTheDocument();
    expect(button.parentElement).toHaveClass(
      "opacity-0",
      "pointer-events-none",
    );

    // Clicking should not throw even without a scroll container
    fireEvent.click(button);
    expect(button).toBeInTheDocument();
  });
});
