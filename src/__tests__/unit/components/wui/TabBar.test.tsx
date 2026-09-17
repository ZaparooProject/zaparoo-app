import { useState } from "react";
import { describe, expect, it } from "vitest";
import userEvent from "@testing-library/user-event";
import { render, screen } from "@/test-utils";
import { TabBar } from "@/components/wui/TabBar";

function Choices({ disabled = false }: { disabled?: boolean }) {
  const [value, setValue] = useState("");
  return (
    <TabBar
      label="Choice"
      value={value}
      options={[
        { value: "first", label: "First" },
        { value: "second", label: "Second" },
      ]}
      onChange={setValue}
      disabled={disabled}
    />
  );
}

describe("TabBar", () => {
  it("should allow keyboard entry before any option is selected", async () => {
    const user = userEvent.setup();
    render(<Choices />);
    const first = screen.getByRole("radio", { name: "First" });
    const second = screen.getByRole("radio", { name: "Second" });
    await user.tab();
    expect(first).toHaveFocus();
    expect(first).not.toBeChecked();
    await user.keyboard("{ArrowRight}");
    expect(second).toHaveFocus();
    expect(second).toBeChecked();
    await user.keyboard("{Home}");
    expect(first).toHaveFocus();
    expect(first).toBeChecked();
    await user.keyboard("{End}");
    expect(second).toBeChecked();
  });

  it("should not activate or focus disabled choices", async () => {
    const user = userEvent.setup();
    render(<Choices disabled />);
    const first = screen.getByRole("radio", { name: "First" });
    await user.click(first);
    await user.tab();
    expect(first).toBeDisabled();
    expect(first).not.toHaveFocus();
    expect(first).not.toBeChecked();
  });
});
