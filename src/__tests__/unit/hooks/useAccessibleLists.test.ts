import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@/test-utils";
import { usePreferencesStore } from "@/lib/preferencesStore";
import { useAccessibleLists } from "@/hooks/useAccessibleLists";
import { useScreenReaderEnabled } from "@/hooks/useScreenReaderEnabled";

vi.mock("@/hooks/useScreenReaderEnabled", () => ({
  useScreenReaderEnabled: vi.fn(),
}));

describe("useAccessibleLists", () => {
  beforeEach(() => {
    vi.mocked(useScreenReaderEnabled).mockReturnValue(false);
    usePreferencesStore.setState({ accessibleLists: false });
  });

  it("should enable normal-flow lists for a detected screen reader", () => {
    vi.mocked(useScreenReaderEnabled).mockReturnValue(true);

    const { result } = renderHook(() => useAccessibleLists());

    expect(result.current).toBe(true);
  });

  it("should honor the manual accessibility preference", () => {
    usePreferencesStore.setState({ accessibleLists: true });

    const { result } = renderHook(() => useAccessibleLists());

    expect(result.current).toBe(true);
  });

  it("should retain virtual lists by default on web", () => {
    const { result } = renderHook(() => useAccessibleLists());

    expect(result.current).toBe(false);
  });
});
