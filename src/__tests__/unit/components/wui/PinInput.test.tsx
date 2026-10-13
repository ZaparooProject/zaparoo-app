import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { render, screen } from "@/test-utils";
import { PinInput } from "@/components/wui/PinInput";

function ControlledPin({
  onComplete,
}: {
  onComplete: (value: string) => void;
}) {
  const [value, setValue] = useState("");
  return (
    <PinInput
      label="PIN"
      value={value}
      setValue={setValue}
      onComplete={onComplete}
    />
  );
}

describe("PinInput", () => {
  it("should retain numeric entry, leading zeros, and completion after keyboard focus", async () => {
    const user = userEvent.setup();
    const complete = vi.fn();
    render(<ControlledPin onComplete={complete} />);
    const input = screen.getByRole("textbox", { name: "PIN" });
    await user.tab();
    expect(input).toHaveFocus();
    await user.keyboard("a01234");
    expect(input).toHaveValue("01234");
    expect(complete).not.toHaveBeenCalled();
    await user.keyboard("5");
    expect(input).toHaveValue("012345");
    expect(complete).toHaveBeenCalledExactlyOnceWith("012345");
  });

  it("should accept a pasted one-time code without changing autofill semantics", async () => {
    const user = userEvent.setup();
    const complete = vi.fn();
    render(<ControlledPin onComplete={complete} />);
    const input = screen.getByRole("textbox", { name: "PIN" });
    expect(input).toHaveAttribute("autocomplete", "one-time-code");
    await user.click(input);
    await user.paste("012345");
    expect(input).toHaveValue("012345");
    expect(complete).toHaveBeenCalledExactlyOnceWith("012345");
  });
});
