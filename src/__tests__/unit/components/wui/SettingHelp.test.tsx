import { describe, expect, it } from "vitest";
import userEvent from "@testing-library/user-event";
import { render, screen, waitFor, within } from "@/test-utils";
import { SettingHelp } from "@/components/wui/SettingHelp";

describe("SettingHelp", () => {
  it("should open formatted help in a slide modal and restore trigger focus", async () => {
    const user = userEvent.setup();
    render(
      <SettingHelp
        title="Reader mode"
        description={"Use **reader mode** here.\n\nSecond paragraph."}
        ariaLabel="Explain reader mode"
      />,
    );

    const trigger = screen.getByRole("button", {
      name: "Explain reader mode",
    });
    const dialog = screen.getByRole("dialog", { hidden: true });
    expect(dialog).toHaveStyle({ transform: "translate3d(0, 100%, 0)" });

    await user.click(trigger);

    expect(screen.getByRole("dialog", { name: "Reader mode" })).toBe(dialog);
    expect(dialog).toHaveStyle({ transform: "translate3d(0, 0, 0)" });
    expect(screen.getByText("reader mode").tagName).toBe("STRONG");
    expect(screen.getByText("Second paragraph.")).toBeInTheDocument();

    await user.click(
      within(dialog).getAllByRole("button", { name: "nav.close" })[0]!,
    );

    expect(
      screen.queryByRole("dialog", { name: "Reader mode" }),
    ).not.toBeInTheDocument();
    await waitFor(() => expect(trigger).toHaveFocus());
  });
});
