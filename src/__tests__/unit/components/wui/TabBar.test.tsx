import { useState } from "react";
import { describe, expect, it } from "vitest";
import userEvent from "@testing-library/user-event";
import { render, screen } from "@/test-utils";
import { TabBar } from "@/components/wui/TabBar";
import { getTabBarPanelId, getTabBarTabId } from "@/components/wui/tabBarIds";

function Panels({ disabled = false }: { disabled?: boolean }) {
  const [value, setValue] = useState("first");
  return (
    <>
      <TabBar
        label="Panels"
        value={value}
        options={[
          { value: "first", label: "First" },
          { value: "second", label: "Second" },
        ]}
        onChange={setValue}
        disabled={disabled}
      />
      {["first", "second"].map((key) => (
        <div
          key={key}
          role="tabpanel"
          id={getTabBarPanelId(getTabBarTabId(key))}
          aria-labelledby={getTabBarTabId(key)}
          hidden={value !== key}
        >
          {key} content
        </div>
      ))}
    </>
  );
}

describe("TabBar", () => {
  it("switches associated panels through arrow/Home/End navigation", async () => {
    const user = userEvent.setup();
    render(<Panels />);
    const first = screen.getByRole("tab", { name: "First" });
    const second = screen.getByRole("tab", { name: "Second" });
    expect(screen.getByRole("tablist", { name: "Panels" })).toBeVisible();
    expect(screen.queryByRole("radiogroup")).not.toBeInTheDocument();
    expect(first).toHaveAttribute(
      "aria-controls",
      screen.getByRole("tabpanel", { name: "First" }).id,
    );
    await user.tab();
    expect(first).toHaveFocus();
    await user.keyboard("{ArrowRight}");
    expect(second).toHaveFocus();
    expect(second).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tabpanel", { name: "Second" })).toHaveTextContent(
      "second content",
    );
    await user.keyboard("{Home}");
    expect(first).toHaveFocus();
    expect(first).toHaveAttribute("aria-selected", "true");
    await user.keyboard("{End}");
    expect(second).toHaveAttribute("aria-selected", "true");
  });

  it("does not activate or focus disabled tabs", async () => {
    const user = userEvent.setup();
    render(<Panels disabled />);
    const second = screen.getByRole("tab", { name: "Second" });
    await user.click(second);
    await user.tab();
    expect(second).toBeDisabled();
    expect(second).not.toHaveFocus();
    expect(second).toHaveAttribute("aria-selected", "false");
  });
});
