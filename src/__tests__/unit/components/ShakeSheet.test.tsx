/**
 * ShakeSheet: the non-modal sheet that shows the shake charge and follows
 * the launch it starts until Core reports the result.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, render, screen } from "@/test-utils";
import userEvent from "@testing-library/user-event";
import { ShakeSheet, SHAKE_SHEET_DISMISS_MS } from "@/components/ShakeSheet";
import { useShakeSheetStore } from "@/lib/shakeSheetStore";
import { launchFeedback, MEDIA_WINDOW_MS } from "@/lib/launchFeedback";

const MARIO = {
  name: "Super Mario World",
  systemId: "TestConsole",
  systemName: "Test Console",
  path: "TestConsole/Super Mario World.sfc",
};

/** Text of every live status region, including the app announcer's. */
const announced = () =>
  screen.getAllByRole("status").map((region) => region.textContent);

function mockReducedMotion(reduce: boolean) {
  vi.spyOn(window, "matchMedia").mockImplementation((query) => ({
    matches: reduce && query.includes("prefers-reduced-motion"),
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => true,
  }));
}

describe("ShakeSheet", () => {
  let animate: ReturnType<typeof vi.fn>;
  let cancel: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    useShakeSheetStore.getState().dismiss();
    cancel = vi.fn();
    animate = vi.fn(() => ({ cancel }));
    Object.defineProperty(HTMLElement.prototype, "animate", {
      configurable: true,
      writable: true,
      value: animate,
    });
    mockReducedMotion(false);
  });

  afterEach(() => {
    delete (HTMLElement.prototype as { animate?: unknown }).animate;
    vi.restoreAllMocks();
  });

  const shake = (progress: number, random: boolean) =>
    act(() => {
      useShakeSheetStore.getState().charge(progress, random);
    });
  const confirm = () =>
    act(() => {
      useShakeSheetStore.getState().confirm();
    });

  it("stays hidden until the user shakes", () => {
    render(<ShakeSheet />);

    expect(screen.queryByRole("heading")).not.toBeInTheDocument();
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
  });

  it("shows the charge while the user shakes", () => {
    render(<ShakeSheet />);

    shake(0.5, false);

    expect(
      screen.getByRole("heading", { name: "shakeSheet.charging" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("progressbar", { name: "shakeSheet.charge" }),
    ).toHaveAttribute("aria-valuenow", "50");
    // Non-random commands have no reel.
    expect(animate).not.toHaveBeenCalled();
  });

  it("spins the reel for a random command until Core reports the game", () => {
    vi.useFakeTimers();
    render(<ShakeSheet />);

    shake(0.5, true);
    expect(animate).toHaveBeenCalledTimes(1);

    confirm();
    act(() => {
      const id = launchFeedback.begin("shake");
      launchFeedback.resolved(id);
    });
    // Still waiting on Core well after the run resolved: it keeps spinning.
    act(() => {
      vi.advanceTimersByTime(MEDIA_WINDOW_MS - 1);
    });
    expect(
      screen.getByRole("heading", { name: "shakeSheet.launching" }),
    ).toBeInTheDocument();
    expect(cancel).not.toHaveBeenCalled();
    expect(announced()).toContain("shakeSheet.launching");

    act(() => {
      launchFeedback.mediaStarted(MARIO);
    });

    expect(cancel).toHaveBeenCalled();
    expect(
      screen.getByRole("heading", { name: "Super Mario World" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Test Console")).toBeInTheDocument();
    expect(announced()).toContain("shakeSheet.launchedMedia");
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(SHAKE_SHEET_DISMISS_MS);
    });
    expect(screen.queryByRole("heading")).not.toBeInTheDocument();
  });

  it("shows Launching for a non-random command, then the result", () => {
    vi.useFakeTimers();
    render(<ShakeSheet />);

    shake(1, false);
    confirm();
    expect(
      screen.getByRole("heading", { name: "shakeSheet.launching" }),
    ).toBeInTheDocument();

    act(() => {
      const id = launchFeedback.begin("shake");
      launchFeedback.resolved(id);
    });
    act(() => {
      vi.advanceTimersByTime(MEDIA_WINDOW_MS);
    });

    expect(
      screen.getByRole("heading", { name: "shakeSheet.launched" }),
    ).toBeInTheDocument();
  });

  it("keeps a failure on screen until dismissed", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({
      advanceTimers: vi.advanceTimersByTime.bind(vi),
    });
    render(<ShakeSheet />);

    shake(1, true);
    confirm();
    act(() => {
      useShakeSheetStore.getState().fail("No media found");
    });

    expect(
      screen.getByRole("heading", { name: "shakeSheet.failed" }),
    ).toBeInTheDocument();
    expect(screen.getByText("No media found")).toBeInTheDocument();
    expect(cancel).toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(SHAKE_SHEET_DISMISS_MS * 3);
    });
    expect(
      screen.getByRole("heading", { name: "shakeSheet.failed" }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "nav.close" }));
    expect(screen.queryByRole("heading")).not.toBeInTheDocument();
  });

  it("closes when another launch replaces the shake's", () => {
    render(<ShakeSheet />);

    shake(1, true);
    confirm();
    act(() => {
      launchFeedback.begin("shake");
      launchFeedback.begin("nfc");
    });

    expect(screen.queryByRole("heading")).not.toBeInTheDocument();
  });

  it("does not spin with reduced motion", () => {
    mockReducedMotion(true);
    render(<ShakeSheet />);

    shake(0.5, true);
    confirm();

    expect(animate).not.toHaveBeenCalled();
    expect(
      screen.getByRole("heading", { name: "shakeSheet.launching" }),
    ).toBeInTheDocument();

    act(() => {
      launchFeedback.begin("shake");
      launchFeedback.mediaStarted(MARIO);
    });
    expect(
      screen.getByRole("heading", { name: "Super Mario World" }),
    ).toBeInTheDocument();
  });
});
