import { describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { render, screen, waitFor, within } from "@/test-utils";
import { SettingHelp } from "@/components/wui/SettingHelp";
import { ToggleSwitch } from "@/components/wui/ToggleSwitch";

describe("SettingHelp", () => {
  it.each([false, true])(
    "does not activate a containing setting when help opens or closes (disabled: %s)",
    async (disabled) => {
      const user = userEvent.setup();
      const setValue = vi.fn();
      const onDisabledClick = vi.fn();
      render(
        <ToggleSwitch
          label="Remote control"
          help={<SettingHelp title="Remote control" description="Help text" />}
          value={false}
          setValue={setValue}
          disabled={disabled}
          onDisabledClick={onDisabledClick}
        />,
      );
      await user.click(
        screen.getByRole("button", { name: "Help for Remote control" }),
      );
      expect(setValue).not.toHaveBeenCalled();
      const dialog = screen.getByRole("dialog", { name: "Remote control" });
      await user.click(
        within(dialog).getAllByRole("button", { name: "nav.close" })[0]!,
      );
      await waitFor(() =>
        expect(
          screen.queryByRole("dialog", { name: "Remote control" }),
        ).not.toBeInTheDocument(),
      );
      expect(setValue).not.toHaveBeenCalled();
      expect(screen.getByRole("checkbox")).not.toBeChecked();
      expect(onDisabledClick).not.toHaveBeenCalled();
      await user.click(
        screen.getByText("Remote control", { selector: "label" }),
      );
      if (disabled) {
        expect(onDisabledClick).toHaveBeenCalledOnce();
      } else {
        expect(setValue).toHaveBeenCalledWith(true);
      }
    },
  );
  it("allows Escape dismissal without activating a disabled row", async () => {
    const user = userEvent.setup();
    const onDisabledClick = vi.fn();
    const setValue = vi.fn();
    render(
      <ToggleSwitch
        label="Reader mode"
        value={false}
        setValue={setValue}
        disabled
        onDisabledClick={onDisabledClick}
        help={<SettingHelp title="Reader mode" description="Help text" />}
      />,
    );
    const trigger = screen.getByRole("button", {
      name: "Help for Reader mode",
    });
    trigger.focus();
    await user.keyboard("{Enter}");
    expect(screen.getByRole("dialog", { name: "Reader mode" })).toBeVisible();
    await user.keyboard("{Escape}");
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "Reader mode" }),
      ).not.toBeInTheDocument(),
    );
    await waitFor(() => expect(trigger).toHaveFocus());
    expect(onDisabledClick).not.toHaveBeenCalled();
    expect(setValue).not.toHaveBeenCalled();
  });

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
