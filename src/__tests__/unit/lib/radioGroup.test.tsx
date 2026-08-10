import { useState } from "react";
import { describe, expect, it } from "vitest";
import userEvent from "@testing-library/user-event";
import { render, screen } from "@/test-utils";
import { handleRadioGroupKeyDown } from "@/lib/radioGroup";

function RadioGroupHarness() {
  const [value, setValue] = useState("one");
  const options = ["one", "two", "three"];

  return (
    <div
      role="radiogroup"
      aria-label="Options"
      onKeyDown={handleRadioGroupKeyDown}
    >
      {options.map((option) => (
        <button
          key={option}
          type="button"
          role="radio"
          aria-checked={value === option}
          tabIndex={value === option ? 0 : -1}
          onClick={() => setValue(option)}
        >
          {option}
        </button>
      ))}
    </div>
  );
}

describe("handleRadioGroupKeyDown", () => {
  it("should move and select with arrow keys", async () => {
    const user = userEvent.setup();
    render(<RadioGroupHarness />);

    const first = screen.getByRole("radio", { name: "one" });
    first.focus();
    await user.keyboard("{ArrowRight}");

    const second = screen.getByRole("radio", { name: "two" });
    expect(second).toHaveFocus();
    expect(second).toBeChecked();
  });

  it("should wrap and support Home and End", async () => {
    const user = userEvent.setup();
    render(<RadioGroupHarness />);

    const first = screen.getByRole("radio", { name: "one" });
    first.focus();
    await user.keyboard("{ArrowLeft}");

    const last = screen.getByRole("radio", { name: "three" });
    expect(last).toHaveFocus();
    expect(last).toBeChecked();

    await user.keyboard("{Home}");
    expect(first).toHaveFocus();
    expect(first).toBeChecked();

    await user.keyboard("{End}");
    expect(last).toHaveFocus();
    expect(last).toBeChecked();
  });
});
