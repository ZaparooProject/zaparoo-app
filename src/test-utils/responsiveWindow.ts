import { act } from "@testing-library/react";
import { vi } from "vitest";

function matchesWidth(query: string, width: number): boolean {
  const minimum = /min-width:\s*(\d+)px/.exec(query);
  const maximum = /max-width:\s*(\d+)px/.exec(query);
  if (!minimum && !maximum) return false;
  if (minimum && width < Number(minimum[1])) return false;
  if (maximum && width > Number(maximum[1])) return false;
  return true;
}

/**
 * Drives `window.matchMedia` from a simulated viewport width so adaptive
 * layouts can be resized in jsdom. Understands `min-width` and `max-width`
 * pixel queries; every other media feature reports no match.
 *
 * Returns a function that changes the width and notifies listeners.
 */
export function responsiveWindow(initialWidth: number) {
  let width = initialWidth;
  const listeners = new Set<() => void>();
  vi.spyOn(window, "matchMedia").mockImplementation((query) => ({
    get matches() {
      return matchesWidth(query, width);
    },
    media: query,
    onchange: null,
    addEventListener: (_type: string, listener: unknown) => {
      listeners.add(listener as () => void);
    },
    removeEventListener: (_type: string, listener: unknown) => {
      listeners.delete(listener as () => void);
    },
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => true,
  }));
  return async (nextWidth: number) => {
    await act(() => {
      width = nextWidth;
      listeners.forEach((listener) => listener());
    });
  };
}
