import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { usePageHeadingFocus } from "../../../hooks/usePageHeadingFocus";

describe("usePageHeadingFocus", () => {
  const originalTitle = document.title;

  beforeEach(() => {
    document.title = "Initial Title";
  });

  afterEach(() => {
    document.title = originalTitle;
  });

  it("returns a ref", () => {
    const { result } = renderHook(() =>
      usePageHeadingFocus<HTMLHeadingElement>(),
    );

    expect(result.current).toBeDefined();
    expect(result.current.current).toBeNull(); // No element attached yet
  });

  it("sets document title with provided title", () => {
    renderHook(() => usePageHeadingFocus<HTMLHeadingElement>("My Page"));

    expect(document.title).toBe("My Page - Zaparoo");
  });

  it("does not change title when no title provided", () => {
    const initialTitle = document.title;
    renderHook(() => usePageHeadingFocus<HTMLHeadingElement>());

    expect(document.title).toBe(initialTitle);
  });

  it("resets document title on unmount", () => {
    const { unmount } = renderHook(() =>
      usePageHeadingFocus<HTMLHeadingElement>("Test Page"),
    );

    expect(document.title).toBe("Test Page - Zaparoo");

    unmount();

    expect(document.title).toBe("Zaparoo");
  });

  it("focuses element when ref is attached", () => {
    const heading = document.createElement("h1");
    heading.textContent = "Page Title";
    document.body.appendChild(heading);

    const { unmount } = renderHook(() => {
      const ref = usePageHeadingFocus<HTMLHeadingElement>("Test");
      // Manually attach ref before effect runs
      (ref as React.MutableRefObject<HTMLHeadingElement>).current = heading;
      return ref;
    });

    // Check that the element received tabindex and focus
    expect(heading.getAttribute("tabindex")).toBe("-1");
    expect(document.activeElement).toBe(heading);

    document.body.removeChild(heading);
    unmount();
  });

  it("sets tabindex to -1 on focused element", () => {
    // Create a real component scenario
    const heading = document.createElement("h1");
    heading.id = "test-heading";
    document.body.appendChild(heading);

    // Render the hook and manually simulate what happens
    renderHook(
      ({ title }) => {
        const ref = usePageHeadingFocus<HTMLHeadingElement>(title);
        // Simulate ref attachment before effect runs
        if (!ref.current) {
          (ref as React.MutableRefObject<HTMLHeadingElement>).current = heading;
        }
        return ref;
      },
      { initialProps: { title: "Test" } },
    );

    // Check the element was configured properly
    expect(heading.getAttribute("tabindex")).toBe("-1");

    document.body.removeChild(heading);
  });

  it("updates title when title prop changes", () => {
    const { rerender } = renderHook(
      ({ title }) => usePageHeadingFocus<HTMLHeadingElement>(title),
      { initialProps: { title: "Page 1" } },
    );

    expect(document.title).toBe("Page 1 - Zaparoo");

    rerender({ title: "Page 2" });

    expect(document.title).toBe("Page 2 - Zaparoo");
  });
});
