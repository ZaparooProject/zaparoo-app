import { beforeEach, describe, expect, it, vi } from "vitest";
import { NfcIcon } from "lucide-react";
import userEvent from "@testing-library/user-event";
import { render, screen } from "../../../test-utils";
import { ReaderActivityControl } from "@/components/ReaderActivityControl";

describe("ReaderActivityControl", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const props = {
    idleLabel: "Write",
    activeLabel: "Hold tag to reader",
    icon: <NfcIcon />,
    onStart: vi.fn(),
    onCancel: vi.fn(),
    onRetry: vi.fn(),
  };

  it("starts from the idle physical action", async () => {
    const user = userEvent.setup();
    render(<ReaderActivityControl {...props} state="idle" />);

    await user.click(screen.getByRole("button", { name: "Write" }));

    expect(props.onStart).toHaveBeenCalledOnce();
    expect(
      screen.queryByText("reader.pressAgainToCancel"),
    ).not.toBeInTheDocument();
  });

  it("latches waiting state and remains cancelable", async () => {
    const user = userEvent.setup();
    render(<ReaderActivityControl {...props} state="waiting" />);

    const button = screen.getByRole("button", {
      name: "reader.cancelAction",
    });
    expect(button).toHaveAttribute("data-reader-state", "waiting");
    expect(button.parentElement).toHaveAttribute(
      "data-reader-state",
      "waiting",
    );
    expect(button).toHaveAttribute("aria-pressed", "true");
    expect(button).toHaveAttribute("aria-busy", "true");
    const hint = screen.getByText("reader.pressAgainToCancel");
    expect(hint).toBeVisible();
    expect(button).toContainElement(hint);

    await user.click(hint);
    expect(props.onCancel).toHaveBeenCalledOnce();
    expect(props.onStart).not.toHaveBeenCalled();
  });

  it("keeps keyboard focus when switching from start to cancel", async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <ReaderActivityControl {...props} state="idle" />,
    );

    await user.tab();
    await user.keyboard("{Enter}");
    expect(props.onStart).toHaveBeenCalledOnce();

    rerender(<ReaderActivityControl {...props} state="waiting" />);
    expect(
      screen.getByRole("button", { name: "reader.cancelAction" }),
    ).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(props.onCancel).toHaveBeenCalledOnce();
  });

  it("keeps re-tap instructions and cancellation inside the same control", async () => {
    const user = userEvent.setup();
    render(<ReaderActivityControl {...props} state="attention" />);

    const button = screen.getByRole("button", { name: "reader.cancelAction" });
    expect(button).toHaveAttribute("data-reader-state", "attention");
    expect(button).toHaveAttribute("aria-pressed", "true");
    expect(button).toHaveTextContent(props.activeLabel);
    expect(button).toContainElement(
      screen.getByText("reader.pressAgainToCancel"),
    );
    await user.click(button);
    expect(props.onCancel).toHaveBeenCalledOnce();
  });

  it("can omit the visible cancel hint without changing the accessible action", () => {
    render(
      <ReaderActivityControl
        {...props}
        state="waiting"
        showCancelHint={false}
      />,
    );

    expect(
      screen.getByRole("button", { name: "reader.cancelAction" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("reader.pressAgainToCancel"),
    ).not.toBeInTheDocument();
  });

  it("shows explicit retry and cancel actions after verification failure", async () => {
    const user = userEvent.setup();
    render(
      <ReaderActivityControl
        {...props}
        state="error"
        errorMessage="Tag did not save"
      />,
    );

    const status = screen.getByText("spinner.verifyFailed");
    expect(status).toBeVisible();
    expect(screen.getByRole("button", { name: "scan.retry" })).toContainElement(
      status,
    );
    await user.click(status);
    await user.click(screen.getByRole("button", { name: "nav.cancel" }));

    expect(props.onRetry).toHaveBeenCalledOnce();
    expect(props.onCancel).toHaveBeenCalledOnce();
  });
});
