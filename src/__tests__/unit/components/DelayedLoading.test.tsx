import { afterEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@/test-utils";
import { DelayedLoading } from "@/components/DelayedLoading";

describe("DelayedLoading", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("should hide short loading states", () => {
    vi.useFakeTimers();
    const { unmount } = render(
      <DelayedLoading>
        <span>Loading</span>
      </DelayedLoading>,
    );

    expect(screen.queryByText("Loading")).not.toBeInTheDocument();
    act(() => vi.advanceTimersByTime(299));
    expect(screen.queryByText("Loading")).not.toBeInTheDocument();
    unmount();
    act(() => vi.runAllTimers());
    expect(screen.queryByText("Loading")).not.toBeInTheDocument();
  });

  it("should reveal sustained loading states after the delay", () => {
    vi.useFakeTimers();
    render(
      <DelayedLoading>
        <span>Loading</span>
      </DelayedLoading>,
    );

    act(() => vi.advanceTimersByTime(300));

    expect(screen.getByText("Loading")).toBeInTheDocument();
  });
});
