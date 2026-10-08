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

import { render, screen } from "../../../test-utils";
import userEvent from "@testing-library/user-event";
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
      inboxMessages: [],
      coreVersion: null as string | null,
      coreVersionPending: false,
    };
    if (typeof selector === "function") {
      return selector(mockState);
    }
    return mockState;
  });
  useStatusStore.getState = () => ({
    safeInsets: mockSafeInsets,
    inboxMessages: [],
    coreVersion: null,
    coreVersionPending: false,
  });
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
    openPairingModal: () => {},
  }),
}));

// Mocks for BottomNav - declared at top level for proper hoisting
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
  useLocation: () => ({ pathname: "/" }),
  useRouter: () => undefined,
}));

vi.mock("@/hooks/useHaptics", () => ({
  useHaptics: () => ({ impact: vi.fn() }),
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

      const headerDiv = container.querySelector(".page-header-shell");
      expect(headerDiv).toBeInTheDocument();

      // Verify inline custom properties expose store values to responsive CSS.
      const style = (headerDiv as HTMLElement).style;
      expect(style.getPropertyValue("--page-header-safe-top")).toBe(
        "var(--page-content-safe-top, 47px)",
      );
      expect(style.getPropertyValue("--page-header-safe-right")).toBe("10px");
      expect(style.getPropertyValue("--page-header-safe-left")).toBe("10px");
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
      expect(style.getPropertyValue("--page-scroll-safe-right")).toBe("10px");
      expect(style.getPropertyValue("--page-scroll-safe-left")).toBe("10px");
      expect(style.getPropertyValue("--page-header-overlay-height")).toBe(
        "calc(var(--page-content-safe-top, 47px) + max(56px, 3.5rem) + 1px)",
      );
      expect(style.getPropertyValue("--page-header-overlay-clearance")).toBe(
        "calc(var(--page-content-safe-top, 47px) + 1.5rem + max(68px, 3.5rem))",
      );
    });

    it("should keep headerless content keyboard-accessible with native insets", async () => {
      const { PageFrame } = await import("@/components/PageFrame");
      const user = userEvent.setup();
      render(
        <PageFrame>
          <input aria-label="Address" />
        </PageFrame>,
      );
      await user.tab();
      const input = screen.getByRole("textbox", { name: "Address" });
      expect(input).toHaveFocus();
      await user.keyboard("device.local");
      expect(input).toHaveValue("device.local");
    });
  });

  describe("BottomNav", () => {
    it("should expose safe insets to the full-width dock shell", async () => {
      // Mocks are declared at top level for proper hoisting
      const { BottomNav } = await import("@/components/BottomNav");

      const { container } = render(<BottomNav />);

      const nav = container.querySelector("nav");
      expect(nav).toBeInTheDocument();

      const style = (nav as HTMLElement).style;
      expect(style.getPropertyValue("--bottom-nav-safe-inset")).toBe("34px");
      expect(style.getPropertyValue("--app-navigation-safe-left")).toBe("10px");
      expect(style.getPropertyValue("--app-navigation-safe-right")).toBe(
        "10px",
      );
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
