import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "../../../test-utils";
import { SkipLink } from "../../../components/SkipLink";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const translations: Record<string, string> = {
        "accessibility.skipToContent": "Skip to main content",
      };
      return translations[key] || key;
    },
  }),
}));

describe("SkipLink", () => {
  let targetElement: HTMLDivElement;

  beforeEach(() => {
    // Create target element for the skip link
    targetElement = document.createElement("div");
    targetElement.id = "main-content";
    document.body.appendChild(targetElement);

    // Mock scrollIntoView
    targetElement.scrollIntoView = vi.fn();
  });

  afterEach(() => {
    document.body.removeChild(targetElement);
  });

  it("renders with default translated label", () => {
    render(<SkipLink targetId="main-content" />);

    const link = screen.getByText("Skip to main content");
    expect(link).toBeInTheDocument();
  });

  it("renders with custom label", () => {
    render(<SkipLink targetId="results" label="Skip search results" />);

    const link = screen.getByText("Skip search results");
    expect(link).toBeInTheDocument();
  });

  it("has correct href attribute", () => {
    render(<SkipLink targetId="main-content" />);

    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", "#main-content");
  });

  it("is visually hidden by default (sr-only class)", () => {
    render(<SkipLink targetId="main-content" />);

    const link = screen.getByRole("link");
    expect(link).toHaveClass("sr-only");
  });

  it("focuses target element and scrolls on click", () => {
    render(<SkipLink targetId="main-content" />);

    const link = screen.getByRole("link");
    fireEvent.click(link);

    expect(document.activeElement).toBe(targetElement);
    expect(targetElement.scrollIntoView).toHaveBeenCalledWith({
      behavior: "smooth",
      block: "start",
    });
  });

  it("focuses target element on Enter key press", () => {
    render(<SkipLink targetId="main-content" />);

    const link = screen.getByRole("link");
    fireEvent.keyDown(link, { key: "Enter" });

    expect(document.activeElement).toBe(targetElement);
    expect(targetElement.scrollIntoView).toHaveBeenCalled();
  });

  it("focuses target element on Space key press", () => {
    render(<SkipLink targetId="main-content" />);

    const link = screen.getByRole("link");
    fireEvent.keyDown(link, { key: " " });

    expect(document.activeElement).toBe(targetElement);
    expect(targetElement.scrollIntoView).toHaveBeenCalled();
  });

  it("does nothing on other key presses", () => {
    render(<SkipLink targetId="main-content" />);

    const link = screen.getByRole("link");
    fireEvent.keyDown(link, { key: "Tab" });

    expect(document.activeElement).not.toBe(targetElement);
    expect(targetElement.scrollIntoView).not.toHaveBeenCalled();
  });

  it("handles missing target element gracefully", () => {
    document.body.removeChild(targetElement);

    render(<SkipLink targetId="nonexistent" />);

    const link = screen.getByRole("link");

    // Should not throw
    expect(() => fireEvent.click(link)).not.toThrow();

    // Re-add for cleanup
    document.body.appendChild(targetElement);
  });

  it("prevents default link behavior", () => {
    render(<SkipLink targetId="main-content" />);

    const link = screen.getByRole("link");
    const clickEvent = new MouseEvent("click", { bubbles: true });
    const preventDefaultSpy = vi.spyOn(clickEvent, "preventDefault");

    link.dispatchEvent(clickEvent);

    expect(preventDefaultSpy).toHaveBeenCalled();
  });
});
