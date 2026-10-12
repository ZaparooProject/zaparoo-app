import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useDebouncedSave } from "@/hooks/useDebouncedSave";

interface Props {
  saved: string | undefined;
}

describe("useDebouncedSave", () => {
  const save = vi.fn<(draft: string) => Promise<unknown>>();

  const setup = (...args: [saved?: string | undefined]) => {
    const saved = args.length === 0 ? "15" : args[0];
    return renderHook(
      (props: Props) =>
        useDebouncedSave<string>({
          saved: props.saved,
          serialize: (value) => String(Number(value) || 0),
          canSave: (value) => value.trim() !== "",
          save,
        }),
      { initialProps: { saved } },
    );
  };

  beforeEach(() => {
    vi.useFakeTimers();
    save.mockReset().mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should write a changed draft once after the pause", async () => {
    const { result } = setup();

    act(() => result.current[1]("3"));
    act(() => result.current[1]("30"));
    expect(save).not.toHaveBeenCalled();

    await act(() => vi.advanceTimersByTimeAsync(500));

    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith("30");
  });

  it("should not write an emptied field as zero", async () => {
    const { result } = setup();

    act(() => result.current[1](""));
    await act(() => vi.advanceTimersByTimeAsync(2000));

    expect(save).not.toHaveBeenCalled();
    expect(result.current[0]).toBe("");
  });

  it("should not write a draft that matches the saved value", async () => {
    const { result } = setup();

    act(() => result.current[1]("015"));
    await act(() => vi.advanceTimersByTimeAsync(2000));

    expect(save).not.toHaveBeenCalled();
  });

  it("should flush a pending write when the owner unmounts", () => {
    const { result, unmount } = setup();

    act(() => result.current[1]("30"));
    unmount();

    expect(save).toHaveBeenCalledWith("30");
  });

  it("should keep in-progress typing when the saved value is refetched", () => {
    const { result, rerender } = setup();

    act(() => result.current[1]("3"));
    rerender({ saved: "20" });

    expect(result.current[0]).toBe("3");
  });

  it("should follow the saved value while the user is not editing", () => {
    const { result, rerender } = setup(undefined);
    expect(result.current[0]).toBeUndefined();

    rerender({ saved: "15" });
    expect(result.current[0]).toBe("15");

    rerender({ saved: "20" });
    expect(result.current[0]).toBe("20");
  });

  it("should return to the saved value when the write fails", async () => {
    save.mockRejectedValue(new Error("offline"));
    const { result } = setup();

    act(() => result.current[1]("30"));
    await act(() => vi.advanceTimersByTimeAsync(500));

    expect(save).toHaveBeenCalledWith("30");
    expect(result.current[0]).toBe("15");
  });

  it("should adopt the value Core kept after a write", async () => {
    const { result, rerender } = setup();
    // Core clamps the request, and the refetch lands before the write settles.
    save.mockImplementation(async () => {
      rerender({ saved: "10" });
    });

    act(() => result.current[1]("999"));
    await act(() => vi.advanceTimersByTimeAsync(500));

    expect(result.current[0]).toBe("10");
  });
});
