/**
 * Safe Area Regression Tests
 *
 * These tests ensure that components properly use the store's safeInsets values
 * via inline styles rather than CSS env() values. This is critical for iOS where
 * the CSS env() values don't work properly in the webview, but the SafeArea plugin
 * correctly returns pixel values.
 *
 * Regression for: Safe area not working on iOS after refactor to Tailwind classes
 */

import { render } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock store with specific safe inset values to verify they're used
const mockSafeInsets = {
  top: "47px",
  bottom: "34px",
  left: "10px",
  right: "10px",
};

vi.mock("@/lib/store", () => {
  const useStatusStore: any = vi.fn((selector) => {
    const mockState = {
      safeInsets: mockSafeInsets,
    };
    if (typeof selector === "function") {
      return selector(mockState);
    }
    return mockState;
  });
  useStatusStore.getState = () => ({ safeInsets: mockSafeInsets });
  return { useStatusStore };
});

vi.mock("@/components/ResponsiveContainer", () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="responsive-container">{children}</div>
  ),
}));

vi.mock("@/hooks/useConnection", () => ({
  useConnection: () => ({
    showConnecting: false,
    showReconnecting: true,
  }),
}));

describe("Safe Area Regression Tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("PageFrame", () => {
    it("should apply safe insets via inline styles, not CSS classes", async () => {
      const { PageFrame } = await import("@/components/PageFrame");

      const { container } = render(
        <PageFrame headerCenter={<h1>Title</h1>}>
          <div>Content</div>
        </PageFrame>,
      );

      // Find the sticky header div
      const stickyDiv = container.querySelector(".sticky.top-0");
      expect(stickyDiv).toBeInTheDocument();

      // Verify inline styles use the store values (not env())
      const style = (stickyDiv as HTMLElement).style;
      expect(style.paddingTop).toBe("calc(1rem + 47px)");
      expect(style.paddingRight).toBe("calc(1rem + 10px)");
      expect(style.paddingLeft).toBe("calc(1rem + 10px)");
    });

    it("should apply safe insets to scroll container via inline styles", async () => {
      const { PageFrame } = await import("@/components/PageFrame");

      const { container } = render(
        <PageFrame>
          <div>Content</div>
        </PageFrame>,
      );

      const scrollContainer = container.querySelector(
        ".flex-1.overflow-y-auto",
      );
      expect(scrollContainer).toBeInTheDocument();

      const style = (scrollContainer as HTMLElement).style;
      expect(style.paddingRight).toBe("calc(1rem + 10px)");
      expect(style.paddingLeft).toBe("calc(1rem + 10px)");
    });

    it("should always render top padding area even without header content", async () => {
      const { PageFrame } = await import("@/components/PageFrame");

      const { container } = render(
        <PageFrame>
          <div>Content without header</div>
        </PageFrame>,
      );

      // The sticky div should exist and have top padding even without header
      const stickyDiv = container.querySelector(".sticky.top-0");
      expect(stickyDiv).toBeInTheDocument();

      const style = (stickyDiv as HTMLElement).style;
      expect(style.paddingTop).toBe("calc(1rem + 47px)");
    });
  });

  describe("BottomNav", () => {
    it("should include safe insets in height and padding", async () => {
      // Need to mock additional dependencies for BottomNav
      vi.doMock("@tanstack/react-router", () => ({
        Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
          <a href={to}>{children}</a>
        ),
        useLocation: () => ({ pathname: "/" }),
      }));

      vi.doMock("@/hooks/useHaptics", () => ({
        useHaptics: () => ({ impact: vi.fn() }),
      }));

      const { BottomNav } = await import("@/components/BottomNav");

      const { container } = render(<BottomNav />);

      const nav = container.querySelector("nav");
      expect(nav).toBeInTheDocument();

      const style = (nav as HTMLElement).style;
      // Height should include safe insets
      expect(style.height).toBe("calc(80px + 34px)");
      // Padding bottom should be the safe inset
      expect(style.paddingBottom).toBe("34px");
    });
  });

  describe("ReconnectingIndicator", () => {
    it("should position above bottom nav accounting for safe insets", async () => {
      const { ReconnectingIndicator } =
        await import("@/components/ReconnectingIndicator");

      const { container } = render(<ReconnectingIndicator />);

      const indicator = container.querySelector('[role="status"]');
      expect(indicator).toBeInTheDocument();

      const style = (indicator as HTMLElement).style;
      // Should be positioned above nav (80px) + safe area (34px) + margin (1rem)
      expect(style.bottom).toBe("calc(80px + 34px + 1rem)");
    });
  });
});

describe("Safe Area Anti-Regression: No CSS env() in components", () => {
  it("PageFrame should not use CSS env() for safe area", async () => {
    const { PageFrame } = await import("@/components/PageFrame");

    const { container } = render(
      <PageFrame headerCenter={<h1>Title</h1>}>
        <div>Content</div>
      </PageFrame>,
    );

    // Get all inline styles
    const allElements = container.querySelectorAll("*");
    allElements.forEach((el) => {
      const style = (el as HTMLElement).getAttribute("style") || "";
      // Ensure no env() usage in inline styles
      expect(style).not.toContain("env(safe-area-inset");
    });
  });
});
