/**
 * Safe Area Regression Tests
 *
 * iOS webviews do not resolve CSS env() safe-area values reliably, so the
 * native insets are read into the store and handed to the page chrome as
 * inline custom properties. These tests check that seeded insets reach those
 * properties through the real PageFrame.
 *
 * Navigation chrome (dock, sidebar, tablet bar) reads the shell-level insets;
 * that contract is covered in integration/root-layout.test.tsx.
 */
import { render, screen } from "../../../test-utils";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { PageFrame } from "@/components/PageFrame";
import { useStatusStore } from "@/lib/store";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
  useLocation: () => ({ pathname: "/" }),
  useRouter: () => undefined,
}));

/** The nearest ancestor that publishes the given custom property inline. */
function ancestorPublishing(element: HTMLElement, property: string) {
  let current: HTMLElement | null = element;
  while (current) {
    if (current.style.getPropertyValue(property) !== "") return current;
    current = current.parentElement;
  }
  throw new Error(`No ancestor publishes ${property}`);
}

describe("Safe area insets", () => {
  beforeEach(() => {
    useStatusStore.setState({
      safeInsets: { top: "47px", bottom: "34px", left: "10px", right: "12px" },
    });
  });

  it("should publish seeded insets on the page header", () => {
    render(
      <PageFrame headerCenter={<h1>Title</h1>}>
        <div>Content</div>
      </PageFrame>,
    );

    const heading = screen.getByRole("heading", { name: "Title" });
    const header = ancestorPublishing(heading, "--page-header-safe-right");
    expect(header.style.getPropertyValue("--page-header-safe-top")).toContain(
      "47px",
    );
    expect(header.style.getPropertyValue("--page-header-safe-right")).toBe(
      "12px",
    );
    expect(header.style.getPropertyValue("--page-header-safe-left")).toBe(
      "10px",
    );
  });

  it("should publish seeded insets on the page scroll container", () => {
    render(
      <PageFrame>
        <div>Content</div>
      </PageFrame>,
    );

    const scroller = ancestorPublishing(
      screen.getByText("Content"),
      "--page-scroll-safe-top",
    );
    expect(scroller.style.getPropertyValue("--page-scroll-safe-top")).toBe(
      "47px",
    );
    expect(scroller.style.getPropertyValue("--page-scroll-safe-right")).toBe(
      "12px",
    );
    expect(scroller.style.getPropertyValue("--page-scroll-safe-left")).toBe(
      "10px",
    );
  });

  it("should keep headerless content keyboard-accessible with native insets", async () => {
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
