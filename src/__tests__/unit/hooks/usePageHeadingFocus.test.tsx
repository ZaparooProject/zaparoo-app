import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { usePageHeadingFocus } from "../../../hooks/usePageHeadingFocus";
import { Capacitor } from "@capacitor/core";
import { ScreenReader } from "@capacitor/screen-reader";

vi.mock("@capacitor/core", () => import("../../../__mocks__/@capacitor/core"));
vi.mock(
  "@capacitor/screen-reader",
  () => import("../../../__mocks__/@capacitor/screen-reader"),
);

describe("usePageHeadingFocus", () => {
  const originalTitle = document.title;

  beforeEach(() => {
    vi.clearAllMocks();
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

  it("focuses element when screen reader is enabled", async () => {
    // Enable screen reader for this test
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);
    vi.mocked(ScreenReader.isEnabled).mockResolvedValue({ value: true });

    const heading = document.createElement("h1");
    heading.textContent = "Page Title";
    document.body.appendChild(heading);

    const { unmount } = renderHook(() => {
      const ref = usePageHeadingFocus<HTMLHeadingElement>("Test");
      // Manually attach ref before effect runs
      (ref as React.MutableRefObject<HTMLHeadingElement>).current = heading;
      return ref;
    });

    // Wait for screen reader check to complete
    await waitFor(() => {
      expect(heading.getAttribute("tabindex")).toBe("-1");
    });
    expect(document.activeElement).toBe(heading);

    document.body.removeChild(heading);
    unmount();
  });

  it("does not focus element when screen reader is disabled", () => {
    // Screen reader disabled (default mock behavior)
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(false);

    const heading = document.createElement("h1");
    heading.textContent = "Page Title";
    document.body.appendChild(heading);

    renderHook(() => {
      const ref = usePageHeadingFocus<HTMLHeadingElement>("Test");
      (ref as React.MutableRefObject<HTMLHeadingElement>).current = heading;
      return ref;
    });

    // Element should NOT have tabindex set and should NOT be focused
    expect(heading.getAttribute("tabindex")).toBeNull();
    expect(document.activeElement).not.toBe(heading);

    document.body.removeChild(heading);
  });

  it("sets tabindex to -1 on focused element when screen reader enabled", async () => {
    // Enable screen reader for this test
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);
    vi.mocked(ScreenReader.isEnabled).mockResolvedValue({ value: true });

    const heading = document.createElement("h1");
    heading.id = "test-heading";
    document.body.appendChild(heading);

    renderHook(
      ({ title }) => {
        const ref = usePageHeadingFocus<HTMLHeadingElement>(title);
        if (!ref.current) {
          (ref as React.MutableRefObject<HTMLHeadingElement>).current = heading;
        }
        return ref;
      },
      { initialProps: { title: "Test" } },
    );

    // Wait for screen reader check to complete
    await waitFor(() => {
      expect(heading.getAttribute("tabindex")).toBe("-1");
    });

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
