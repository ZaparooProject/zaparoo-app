import { afterEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@/test-utils";
import {
  DEFAULT_LOADING_DELAY_MS,
  DelayedLoading,
} from "@/components/DelayedLoading";

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
    act(() => vi.advanceTimersByTime(DEFAULT_LOADING_DELAY_MS - 1));
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

    act(() => vi.advanceTimersByTime(DEFAULT_LOADING_DELAY_MS));

    expect(screen.getByText("Loading")).toBeInTheDocument();
  });

  it("should reveal immediately when delay changes to zero", () => {
    vi.useFakeTimers();
    const { rerender } = render(
      <DelayedLoading>
        <span>Loading</span>
      </DelayedLoading>,
    );

    expect(screen.queryByText("Loading")).not.toBeInTheDocument();

    rerender(
      <DelayedLoading delayMs={0}>
        <span>Loading</span>
      </DelayedLoading>,
    );

    expect(screen.getByText("Loading")).toBeInTheDocument();
  });
});
