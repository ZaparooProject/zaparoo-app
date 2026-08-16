import type { PointerEvent } from "react";
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useHapticPress } from "@/hooks/useHapticPress";

const mockImpact = vi.fn();
vi.mock("@/hooks/useHaptics", () => ({
  useHaptics: () => ({ impact: mockImpact }),
}));

function pointerEvent(
  pointerType: string,
  isPrimary = true,
): PointerEvent<HTMLElement> {
  return { pointerType, isPrimary } as PointerEvent<HTMLElement>;
}

describe("useHapticPress", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should trigger the configured impact after a primary touch press", () => {
    const { result } = renderHook(() => useHapticPress("medium"));

    act(() => result.current(pointerEvent("touch")));

    expect(mockImpact).toHaveBeenCalledWith("medium");
  });

  it("should not trigger for mouse or non-primary pointers", () => {
    const { result } = renderHook(() => useHapticPress());

    act(() => {
      result.current(pointerEvent("mouse"));
      result.current(pointerEvent("touch", false));
    });

    expect(mockImpact).not.toHaveBeenCalled();
  });

  it("should not trigger when the control is disabled", () => {
    const { result } = renderHook(() => useHapticPress("light", false));

    act(() => result.current(pointerEvent("touch")));

    expect(mockImpact).not.toHaveBeenCalled();
  });
});
