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
    expect(screen.getByText("reader.pressAgainToCancel")).toBeVisible();

    await user.click(button);
    expect(props.onCancel).toHaveBeenCalledOnce();
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

    expect(screen.getByText("spinner.verifyFailed")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "scan.retry" }));
    await user.click(screen.getByRole("button", { name: "nav.cancel" }));

    expect(props.onRetry).toHaveBeenCalledOnce();
    expect(props.onCancel).toHaveBeenCalledOnce();
  });
});
