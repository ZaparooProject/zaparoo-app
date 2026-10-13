import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { render, screen } from "@/test-utils";
import { RadioGroup } from "@/components/wui/RadioGroup";

function Choices({ disabled = false }: { disabled?: boolean }) {
  const [value, setValue] = useState("");
  return (
    <RadioGroup
      label="Scan mode"
      layout="inline"
      value={value}
      options={[
        { value: "tap", label: "Tap" },
        { value: "hold", label: "Hold" },
      ]}
      onChange={setValue}
      disabled={disabled}
    />
  );
}

describe("RadioGroup", () => {
  it("allows keyboard entry before a selection and arrow/Home/End selection", async () => {
    const user = userEvent.setup();
    render(<Choices />);
    const tap = screen.getByRole("radio", { name: "Tap" });
    const hold = screen.getByRole("radio", { name: "Hold" });
    expect(screen.getByRole("radiogroup", { name: "Scan mode" })).toBeVisible();
    expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
    await user.tab();
    expect(tap).toHaveFocus();
    expect(tap).not.toBeChecked();
    await user.keyboard("{ArrowRight}");
    expect(hold).toHaveFocus();
    expect(hold).toBeChecked();
    await user.keyboard("{ArrowDown}");
    expect(tap).toHaveFocus();
    expect(tap).toBeChecked();
    await user.keyboard("{ArrowLeft}");
    expect(hold).toBeChecked();
    await user.keyboard("{Home}");
    expect(tap).toBeChecked();
    await user.keyboard("{End}");
    expect(hold).toBeChecked();
    expect(tap).not.toBeChecked();
  });

  it("changes selection with pointer and Space, keeping one checked option", async () => {
    const user = userEvent.setup();
    render(<Choices />);
    const tap = screen.getByRole("radio", { name: "Tap" });
    const hold = screen.getByRole("radio", { name: "Hold" });
    await user.click(hold);
    expect(hold).toBeChecked();
    tap.focus();
    await user.keyboard(" ");
    expect(tap).toBeChecked();
    expect(hold).not.toBeChecked();
  });

  it("does not activate or focus disabled options", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <RadioGroup
        label="Plan"
        value="annual"
        options={[
          { value: "annual", label: "Annual" },
          { value: "monthly", label: "Monthly" },
        ]}
        onChange={onChange}
        disabled
      />,
    );
    const annual = screen.getByRole("radio", { name: "Annual" });
    const monthly = screen.getByRole("radio", { name: "Monthly" });
    await user.click(monthly);
    await user.tab();
    expect(annual).toBeDisabled();
    expect(annual).not.toHaveFocus();
    expect(annual).toBeChecked();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("keeps a hidden group label and associates existing help", () => {
    render(
      <RadioGroup
        label="Match"
        labelHidden
        help="How matching works"
        value="exact"
        options={[{ value: "exact", label: "Exact" }]}
        onChange={vi.fn()}
      />,
    );
    expect(
      screen.getByRole("radiogroup", { name: "Match" }),
    ).toHaveAccessibleDescription("How matching works");
  });
});
