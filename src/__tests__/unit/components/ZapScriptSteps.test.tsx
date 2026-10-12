import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useState } from "react";
import userEvent from "@testing-library/user-event";
import {
  act,
  findA11yViolations,
  render,
  screen,
  waitFor,
  within,
} from "../../../test-utils";
import { responsiveWindow } from "../../../test-utils/responsiveWindow";
import { ZapScriptInput } from "@/components/ZapScriptInput";
import { CoreAPI } from "@/lib/coreApi";
import { useStatusStore } from "@/lib/store";

// A parent that holds the script, so every edit round-trips through `value`
// the way it does on a real page.
function Editor(props: {
  initial: string;
  onChange?: (value: string) => void;
  disabled?: boolean;
  split?: boolean;
}) {
  const [value, setValue] = useState(props.initial);
  return (
    <ZapScriptInput
      value={value}
      setValue={(next) => {
        props.onChange?.(next);
        setValue(next);
      }}
      disabled={props.disabled}
      split={props.split}
    />
  );
}

const renderEditor = (
  initial: string,
  options: { disabled?: boolean; split?: boolean } = {},
) => {
  const onChange = vi.fn<(value: string) => void>();
  const view = render(
    <Editor initial={initial} onChange={onChange} {...options} />,
  );
  return { ...view, onChange, user: userEvent.setup() };
};

const stepList = () =>
  screen.getByRole("list", { name: "zapscript.builder.steps" });
const steps = () =>
  within(stepList()).getAllByRole("listitem", {
    name: "zapscript.builder.stepLabel",
  });
const step = (position: number) => steps()[position - 1]!;
const field = (position: number, name: string) =>
  within(step(position)).getByRole("textbox", { name });
const stepButton = (position: number, name: string) =>
  within(step(position)).getByRole("button", { name });
const tab = (name: "steps" | "text") =>
  screen.getByRole("tab", { name: `zapscript.builder.${name}` });
const textarea = () =>
  screen.getByRole("textbox", { name: "create.custom.textareaLabel" });
const addStepButton = () =>
  screen.getByRole("button", { name: "zapscript.builder.addStep" });

// A command's button in the catalogue is named by its description and name.
const addStep = async (
  user: ReturnType<typeof userEvent.setup>,
  name: string,
) => {
  await user.click(addStepButton());
  const catalogue = await screen.findByRole("dialog", {
    name: "create.custom.commandsTitle",
  });
  await user.click(
    within(catalogue).getByRole("button", {
      name: new RegExp(`(^|\\s)${name.replaceAll(".", "\\.")}(\\s|$)`),
    }),
  );
};

describe("ZapScriptInput steps", () => {
  beforeEach(() => {
    useStatusStore.setState(useStatusStore.getInitialState());
    act(() => {
      useStatusStore.getState().setConnected(true);
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("reading a script", () => {
    it("should show one step per command with its field values", () => {
      renderEditor("**launch.system:snes||**delay:500");

      expect(steps()).toHaveLength(2);
      expect(within(step(1)).getByText("launch.system")).toBeInTheDocument();
      expect(
        within(step(1)).getByText(
          "zapscript.commands.launch_system.description",
        ),
      ).toBeInTheDocument();
      expect(field(1, "zapscript.args.system")).toHaveValue("snes");
      expect(within(step(2)).getByText("delay")).toBeInTheDocument();
      expect(field(2, "zapscript.args.duration")).toHaveValue("500");
    });

    it("should open on the steps with the text view hidden", () => {
      renderEditor("**launch.system:snes");

      expect(tab("steps")).toHaveAttribute("aria-selected", "true");
      expect(tab("text")).toHaveAttribute("aria-selected", "false");
      expect(
        screen.queryByRole("textbox", { name: "create.custom.textareaLabel" }),
      ).not.toBeInTheDocument();
    });

    it("should show plain media text as a launch step", () => {
      renderEditor("SNES/Super Metroid.sfc");

      expect(steps()).toHaveLength(1);
      expect(within(step(1)).getByText("launch")).toBeInTheDocument();
      expect(field(1, "zapscript.args.media")).toHaveValue(
        "SNES/Super Metroid.sfc",
      );
    });

    it("should offer to add the first step when the script is empty", () => {
      renderEditor("");

      expect(screen.getByText("zapscript.builder.empty")).toBeInTheDocument();
      expect(addStepButton()).toBeEnabled();
      expect(
        screen.queryByRole("list", { name: "zapscript.builder.steps" }),
      ).not.toBeInTheDocument();
    });

    it("should have no accessibility violations", async () => {
      const { baseElement } = renderEditor(
        '**launch.system:snes?launcher=retroarch||**launch:{"name":"Mario"}',
      );

      expect(await findA11yViolations(baseElement)).toEqual([]);
    });

    it("should show the same script on the text tab", async () => {
      const { user } = renderEditor("**launch.system:snes||**delay:500");

      await user.click(tab("text"));

      expect(textarea()).toHaveValue("**launch.system:snes||**delay:500");
      expect(
        screen.queryByRole("list", { name: "zapscript.builder.steps" }),
      ).not.toBeInTheDocument();
    });
  });

  describe("editing a field", () => {
    it("should rewrite the script and leave the other step's text as written", async () => {
      // The second step is not how the builder would write it.
      const { user, onChange } = renderEditor(
        "**launch.system:snes||**DELAY: 500",
      );

      const system = field(1, "zapscript.args.system");
      await user.clear(system);
      await user.type(system, "genesis");

      expect(onChange).toHaveBeenLastCalledWith(
        "**launch.system:genesis||**DELAY: 500",
      );
      expect(field(2, "zapscript.args.duration")).toHaveValue("500");
    });

    it("should keep focus in the field while typing", async () => {
      const { user } = renderEditor("**launch.system:snes||**delay:500");

      const duration = field(2, "zapscript.args.duration");
      await user.type(duration, "0");

      expect(field(2, "zapscript.args.duration")).toBe(duration);
      expect(duration).toHaveFocus();
      expect(duration).toHaveValue("5000");
    });

    it("should write a value containing a comma quoted", async () => {
      const { user, onChange } = renderEditor("**echo");

      await user.type(field(1, "zapscript.args.text"), "a, b");

      expect(onChange).toHaveBeenLastCalledWith('**echo:"a, b"');
      expect(field(1, "zapscript.args.text")).toHaveValue("a, b");
    });

    it("should drop the argument when its field is emptied", async () => {
      const { user, onChange } = renderEditor("**delay:500||**stop");

      await user.clear(field(1, "zapscript.args.duration"));

      expect(onChange).toHaveBeenLastCalledWith("**delay||**stop");
    });

    it("should show the edit on the text tab", async () => {
      const { user } = renderEditor("**delay:500");
      await user.type(field(1, "zapscript.args.duration"), "0");

      await user.click(tab("text"));

      expect(textarea()).toHaveValue("**delay:5000");
    });
  });

  describe("adding, removing and moving steps", () => {
    it("should add the first step from the catalogue", async () => {
      const { user, onChange } = renderEditor("");

      await addStep(user, "launch.system");

      expect(onChange).toHaveBeenLastCalledWith("**launch.system");
      expect(steps()).toHaveLength(1);
      expect(field(1, "zapscript.args.system")).toHaveValue("");
      await waitFor(() =>
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
      );
    });

    it("should append a step from the catalogue and fill it in", async () => {
      const { user, onChange } = renderEditor("**launch.system:snes");

      await addStep(user, "delay");

      expect(onChange).toHaveBeenLastCalledWith(
        "**launch.system:snes||**delay",
      );
      expect(steps()).toHaveLength(2);

      await user.type(field(2, "zapscript.args.duration"), "500");

      expect(onChange).toHaveBeenLastCalledWith(
        "**launch.system:snes||**delay:500",
      );
    });

    it("should remove a step from the script", async () => {
      const { user, onChange } = renderEditor(
        "**launch.system:snes||**delay:500||**stop",
      );

      await user.click(stepButton(2, "zapscript.builder.remove"));

      expect(onChange).toHaveBeenLastCalledWith("**launch.system:snes||**stop");
      expect(steps()).toHaveLength(2);
      expect(within(step(2)).getByText("stop")).toBeInTheDocument();
    });

    it("should return to the empty state when the last step is removed", async () => {
      const { user, onChange } = renderEditor("**stop");

      await user.click(stepButton(1, "zapscript.builder.remove"));

      expect(onChange).toHaveBeenLastCalledWith("");
      expect(screen.getByText("zapscript.builder.empty")).toBeInTheDocument();
    });

    it("should rewrite the script in the new order when a step moves down", async () => {
      const { user, onChange } = renderEditor(
        "**launch.system:snes||**delay:500||**stop",
      );

      await user.click(stepButton(1, "zapscript.builder.moveDown"));

      expect(onChange).toHaveBeenLastCalledWith(
        "**delay:500||**launch.system:snes||**stop",
      );
      expect(field(1, "zapscript.args.duration")).toHaveValue("500");
      expect(field(2, "zapscript.args.system")).toHaveValue("snes");
    });

    it("should rewrite the script in the new order when a step moves up", async () => {
      const { user, onChange } = renderEditor(
        "**launch.system:snes||**delay:500||**stop",
      );

      await user.click(stepButton(3, "zapscript.builder.moveUp"));

      expect(onChange).toHaveBeenLastCalledWith(
        "**launch.system:snes||**stop||**delay:500",
      );
    });

    it("should not offer to move the first step up or the last step down", () => {
      renderEditor("**launch.system:snes||**delay:500");

      expect(stepButton(1, "zapscript.builder.moveUp")).toBeDisabled();
      expect(stepButton(1, "zapscript.builder.moveDown")).toBeEnabled();
      expect(stepButton(2, "zapscript.builder.moveUp")).toBeEnabled();
      expect(stepButton(2, "zapscript.builder.moveDown")).toBeDisabled();
    });
  });

  describe("options", () => {
    const options = (position: number) =>
      stepButton(position, "zapscript.builder.options");

    it("should keep options closed until asked for", async () => {
      const { user } = renderEditor("**launch.system:snes");

      expect(options(1)).toHaveAttribute("aria-expanded", "false");
      expect(
        within(step(1)).queryByRole("textbox", {
          name: "zapscript.advArgs.launcher",
        }),
      ).not.toBeInTheDocument();

      await user.click(options(1));

      expect(options(1)).toHaveAttribute("aria-expanded", "true");
      expect(field(1, "zapscript.advArgs.launcher")).toHaveValue("");
    });

    it("should open options the script already uses", () => {
      renderEditor("**launch.system:snes?launcher=retroarch");

      expect(options(1)).toHaveAttribute("aria-expanded", "true");
      expect(field(1, "zapscript.advArgs.launcher")).toHaveValue("retroarch");
    });

    it("should rewrite an edited option", async () => {
      const { user, onChange } = renderEditor(
        "**launch.system:snes?launcher=retroarch||**stop",
      );

      const launcher = field(1, "zapscript.advArgs.launcher");
      await user.clear(launcher);
      await user.type(launcher, "mesen");

      expect(onChange).toHaveBeenLastCalledWith(
        "**launch.system:snes?launcher=mesen||**stop",
      );
      expect(launcher).toHaveFocus();
    });

    it("should remove an option when its field is emptied", async () => {
      const { user, onChange } = renderEditor(
        "**launch.system:snes?launcher=retroarch",
      );

      await user.clear(field(1, "zapscript.advArgs.launcher"));

      expect(onChange).toHaveBeenLastCalledWith("**launch.system:snes");
      expect(field(1, "zapscript.advArgs.launcher")).toHaveValue("");
    });

    it("should set an option that was not in the script", async () => {
      const { user, onChange } = renderEditor("**launch.system:snes");
      await user.click(options(1));

      await user.type(field(1, "zapscript.advArgs.launcher"), "mesen");

      expect(onChange).toHaveBeenLastCalledWith(
        "**launch.system:snes?launcher=mesen",
      );
    });

    it("should keep an option the catalogue does not list editable", async () => {
      const { user, onChange } = renderEditor("**stop?custom=1");

      await user.type(field(1, "custom"), "2");

      expect(onChange).toHaveBeenLastCalledWith("**stop?custom=12");
    });
  });

  describe("text steps", () => {
    it("should show a JSON argument as a text step and write edits verbatim", async () => {
      const { user, onChange } = renderEditor(
        '**launch:{"name":"Mario"}||**DELAY: 500',
      );

      expect(steps()).toHaveLength(2);
      const text = field(1, "zapscript.builder.textStepField");
      expect(text).toHaveValue('**launch:{"name":"Mario"}');
      expect(
        within(step(1)).queryByRole("textbox", {
          name: "zapscript.args.media",
        }),
      ).not.toBeInTheDocument();

      await user.type(text, " and more, text");

      expect(onChange).toHaveBeenLastCalledWith(
        '**launch:{"name":"Mario"} and more, text||**DELAY: 500',
      );
      expect(text).toHaveFocus();
    });

    it.each([
      ["an unknown command", "**not.a.command:1"],
      ["a JSON argument", '**launch:{"name":"Mario"}'],
      ["media title shorthand", "@SNES/Super Metroid"],
      ["more arguments than fields", "**delay:500,600"],
    ])("should show %s as a text step", (_case, script) => {
      renderEditor(`${script}||**stop`);

      expect(steps()).toHaveLength(2);
      expect(field(1, "zapscript.builder.textStepField")).toHaveValue(script);
    });

    it("should still move and remove a text step", async () => {
      const { user, onChange } = renderEditor("@SNES/Super Metroid||**stop");

      await user.click(stepButton(1, "zapscript.builder.moveDown"));
      expect(onChange).toHaveBeenLastCalledWith("**stop||@SNES/Super Metroid");

      await user.click(stepButton(2, "zapscript.builder.remove"));
      expect(onChange).toHaveBeenLastCalledWith("**stop");
    });
  });

  describe("scripts that cannot be split into steps", () => {
    it.each([
      ["a leading #", "#lang=en **stop"],
      ["an unmatched quote", '**echo:"unfinished'],
    ])("should open %s on the text tab", (_case, script) => {
      renderEditor(script);

      expect(tab("text")).toHaveAttribute("aria-selected", "true");
      expect(textarea()).toHaveValue(script);
    });

    it("should offer to edit as text from the steps tab", async () => {
      const { user, onChange } = renderEditor("#lang=en **stop");

      await user.click(tab("steps"));

      expect(
        screen.getByText("zapscript.builder.textOnly"),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "zapscript.builder.addStep" }),
      ).not.toBeInTheDocument();

      await user.click(
        screen.getByRole("button", { name: "zapscript.builder.editAsText" }),
      );

      expect(tab("text")).toHaveAttribute("aria-selected", "true");
      expect(textarea()).toHaveValue("#lang=en **stop");
      expect(textarea()).toHaveFocus();
      expect(onChange).not.toHaveBeenCalled();
    });

    it("should show steps again once the text can be split", async () => {
      const { user } = renderEditor("#lang=en **stop");

      await user.clear(textarea());
      await user.type(textarea(), "**delay:500");
      await user.click(tab("steps"));

      expect(steps()).toHaveLength(1);
      expect(field(1, "zapscript.args.duration")).toHaveValue("500");
    });
  });

  describe("value changed from outside", () => {
    it("should re-read the steps when the parent replaces the script", () => {
      const setValue = vi.fn();
      const { rerender } = render(
        <ZapScriptInput value="**launch.system:snes" setValue={setValue} />,
      );
      expect(field(1, "zapscript.args.system")).toHaveValue("snes");

      rerender(
        <ZapScriptInput
          value="**delay:500||**launch.system:genesis"
          setValue={setValue}
        />,
      );

      expect(steps()).toHaveLength(2);
      expect(field(1, "zapscript.args.duration")).toHaveValue("500");
      expect(field(2, "zapscript.args.system")).toHaveValue("genesis");
      expect(setValue).not.toHaveBeenCalled();
    });

    it("should re-read the steps after an edit on the text tab", async () => {
      const { user } = renderEditor("**launch.system:snes");

      await user.click(tab("text"));
      await user.type(textarea(), "||**delay:500");
      await user.click(tab("steps"));

      expect(steps()).toHaveLength(2);
      expect(field(2, "zapscript.args.duration")).toHaveValue("500");
    });

    it("should show the empty state when the parent clears the script", () => {
      const { rerender } = render(
        <ZapScriptInput value="**stop" setValue={vi.fn()} />,
      );

      rerender(<ZapScriptInput value="" setValue={vi.fn()} />);

      expect(screen.getByText("zapscript.builder.empty")).toBeInTheDocument();
    });
  });

  describe("disabled", () => {
    it("should lock step fields and buttons", () => {
      renderEditor(
        "**launch.system:snes?launcher=retroarch||@SNES/Super Metroid",
        { disabled: true },
      );

      expect(field(1, "zapscript.args.system")).toBeDisabled();
      expect(field(1, "zapscript.advArgs.launcher")).toBeDisabled();
      expect(field(2, "zapscript.builder.textStepField")).toBeDisabled();
      expect(stepButton(1, "zapscript.builder.chooseSystemFor")).toBeDisabled();
      for (const position of [1, 2]) {
        for (const name of ["moveUp", "moveDown", "remove"]) {
          expect(
            stepButton(position, `zapscript.builder.${name}`),
          ).toBeDisabled();
        }
      }
      expect(addStepButton()).toBeDisabled();
      expect(
        screen.getByRole("button", { name: "create.custom.clear" }),
      ).toBeDisabled();
    });

    it("should lock adding the first step", () => {
      renderEditor("", { disabled: true });

      expect(addStepButton()).toBeDisabled();
    });
  });

  describe("expressions", () => {
    it("should show an expression in the field it was written in", () => {
      renderEditor('**echo:[[platform]]?when=[[platform == "mister"]]');

      expect(field(1, "zapscript.args.text")).toHaveValue("[[platform]]");
      expect(field(1, "zapscript.advArgs.when")).toHaveValue(
        '[[platform == "mister"]]',
      );
    });

    it("should write an expression typed into an option as it was typed", async () => {
      const { user, onChange } = renderEditor("**launch.system:snes");
      await user.click(stepButton(1, "zapscript.builder.options"));

      // `[[` is how user-event spells a literal `[`.
      await user.type(
        field(1, "zapscript.advArgs.when"),
        "[[[[media.playing && a,b]]",
      );

      expect(onChange).toHaveBeenLastCalledWith(
        "**launch.system:snes?when=[[media.playing && a,b]]",
      );
    });

    it("should keep ordinary square brackets in a value", async () => {
      const { user, onChange } = renderEditor("**launch.system:snes");

      await user.type(field(1, "zapscript.args.system"), " [[!]");

      expect(onChange).toHaveBeenLastCalledWith("**launch.system:snes [!]");
    });
  });

  describe("platform options", () => {
    const setNameField = () =>
      within(step(1)).queryByRole("textbox", {
        name: "zapscript.advArgs.set_name",
      });

    it("should offer the MiSTer set name options only on a MiSTer", async () => {
      act(() => {
        useStatusStore.getState().setCorePlatform("linux");
      });
      const { user } = renderEditor("**launch:SNES/a.sfc");
      await user.click(stepButton(1, "zapscript.builder.options"));

      expect(setNameField()).not.toBeInTheDocument();
      expect(
        within(step(1)).queryByRole("textbox", {
          name: "zapscript.advArgs.set_name_same_dir",
        }),
      ).not.toBeInTheDocument();

      act(() => {
        useStatusStore.getState().setCorePlatform("mister");
      });

      expect(setNameField()).toBeInTheDocument();
      expect(
        field(1, "zapscript.advArgs.set_name_same_dir"),
      ).toBeInTheDocument();
    });

    it("should still show a set name the script already has", () => {
      act(() => {
        useStatusStore.getState().setCorePlatform("linux");
      });
      renderEditor("**launch:SNES/a.sfc?set_name=SNES2");

      expect(setNameField()).toHaveValue("SNES2");
    });
  });

  describe("pickers", () => {
    it("should fill a launcher option from the launchers Core reports", async () => {
      act(() => {
        useStatusStore.getState().setCoreVersion("2.18.0");
      });
      vi.spyOn(CoreAPI, "launchers").mockResolvedValue({
        launchers: [
          {
            id: "SNES",
            systemId: "SNES",
            systemName: "Super NES",
            available: true,
          },
          { id: "Genesis", systemId: "Genesis", available: false },
          { id: "ZaparooVirtual-genesisabc", available: true },
        ],
      });
      const { user, onChange } = renderEditor("**launch.system:snes");
      await user.click(stepButton(1, "zapscript.builder.options"));

      await user.click(stepButton(1, "zapscript.builder.chooseLauncherFor"));
      const dialog = await screen.findByRole("dialog", {
        name: "launcherSelector.title",
      });
      await user.type(
        within(dialog).getByRole("searchbox", {
          name: "launcherSelector.search",
        }),
        "gen",
      );
      expect(
        within(dialog).queryByRole("button", { name: /SNES/ }),
      ).not.toBeInTheDocument();
      await user.click(within(dialog).getByRole("button", { name: /Genesis/ }));

      expect(onChange).toHaveBeenLastCalledWith(
        "**launch.system:snes?launcher=Genesis",
      );
    });

    it("should leave the launcher a plain field on a Core that cannot list them", async () => {
      act(() => {
        useStatusStore.getState().setCoreVersion("2.11.0");
      });
      const { user } = renderEditor("**launch.system:snes");
      await user.click(stepButton(1, "zapscript.builder.options"));

      expect(field(1, "zapscript.advArgs.launcher")).toBeEnabled();
      expect(
        within(step(1)).queryByRole("button", {
          name: "zapscript.builder.chooseLauncherFor",
        }),
      ).not.toBeInTheDocument();
    });

    it("should lock the system picker while disconnected", () => {
      act(() => {
        useStatusStore.getState().setConnected(false);
      });

      renderEditor("**launch.system:snes");

      expect(stepButton(1, "zapscript.builder.chooseSystemFor")).toBeDisabled();
      expect(field(1, "zapscript.args.system")).toBeEnabled();
    });

    it("should open the media search for a media field", async () => {
      const { user } = renderEditor("**launch:SNES/Mario.sfc");

      await user.click(stepButton(1, "zapscript.builder.searchMediaFor"));

      expect(
        await screen.findByRole("dialog", { name: "create.search.title" }),
      ).toBeInTheDocument();
    });
  });

  describe("run and clear", () => {
    it("should run the script as edited in the steps", async () => {
      const run = vi.spyOn(CoreAPI, "run").mockResolvedValue();
      const { user } = renderEditor("**launch.system:snes||**delay:500");
      await user.type(field(2, "zapscript.args.duration"), "0");

      await user.click(
        screen.getByRole("button", { name: "create.custom.runZapScript" }),
      );

      expect(run).toHaveBeenCalledTimes(1);
      expect(run).toHaveBeenCalledWith({
        uid: "",
        text: "**launch.system:snes||**delay:5000",
      });
    });

    it("should not offer to run or clear an empty script", () => {
      renderEditor("");

      expect(
        screen.getByRole("button", { name: "create.custom.runZapScript" }),
      ).toBeDisabled();
      expect(
        screen.getByRole("button", { name: "create.custom.clear" }),
      ).toBeDisabled();
    });

    it("should clear every step once confirmed", async () => {
      const { user, onChange } = renderEditor(
        "**launch.system:snes||**delay:500",
      );

      await user.click(
        screen.getByRole("button", { name: "create.custom.clear" }),
      );
      const confirm = await screen.findByRole("dialog", {
        name: "create.custom.clearConfirmTitle",
      });
      await user.click(
        within(confirm).getByRole("button", { name: "create.custom.clear" }),
      );

      expect(onChange).toHaveBeenLastCalledWith("");
      expect(screen.getByText("zapscript.builder.empty")).toBeInTheDocument();
      expect(tab("steps")).toHaveAttribute("aria-selected", "true");
    });

    it("should keep the steps when clearing is cancelled", async () => {
      const { user, onChange } = renderEditor("**delay:500");

      await user.click(
        screen.getByRole("button", { name: "create.custom.clear" }),
      );
      const confirm = await screen.findByRole("dialog", {
        name: "create.custom.clearConfirmTitle",
      });
      await user.click(
        within(confirm).getByRole("button", { name: "nav.cancel" }),
      );

      expect(onChange).not.toHaveBeenCalled();
      expect(field(1, "zapscript.args.duration")).toHaveValue("500");
    });
  });

  describe("side by side", () => {
    it("should show the steps and the text together on a wide page", async () => {
      responsiveWindow(1440);
      const { user, onChange } = renderEditor("**delay:500", { split: true });

      expect(screen.queryByRole("tab")).not.toBeInTheDocument();
      expect(
        screen.getByRole("group", { name: "zapscript.builder.steps" }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("group", { name: "zapscript.builder.text" }),
      ).toBeInTheDocument();

      await user.type(field(1, "zapscript.args.duration"), "0");
      expect(onChange).toHaveBeenLastCalledWith("**delay:5000");
      expect(textarea()).toHaveValue("**delay:5000");

      await user.type(textarea(), "||**stop");
      expect(steps()).toHaveLength(2);
    });

    it("should fall back to tabs when the page narrows", async () => {
      const resize = responsiveWindow(1440);
      renderEditor("**delay:500", { split: true });

      await resize(820);

      expect(tab("steps")).toHaveAttribute("aria-selected", "true");
      expect(field(1, "zapscript.args.duration")).toHaveValue("500");
    });

    it("should keep tabs on a wide page unless asked to split", () => {
      responsiveWindow(1440);
      renderEditor("**delay:500");

      expect(tab("steps")).toHaveAttribute("aria-selected", "true");
    });
  });
  describe("fidelity and focus", () => {
    it("should keep the order of options when one is edited", async () => {
      const { user, onChange } = renderEditor(
        "**launch.system:snes?launcher=a&when=b",
      );
      await user.type(field(1, "zapscript.advArgs.launcher"), "Z");
      expect(onChange).toHaveBeenLastCalledWith(
        "**launch.system:snes?launcher=aZ&when=b",
      );
    });

    it("should show a value with a line break as a text step", () => {
      renderEditor("**echo:a^nb");
      expect(
        within(step(1)).getByRole("textbox", {
          name: "zapscript.builder.textStepField",
        }),
      ).toHaveValue("**echo:a^nb");
    });

    it("should not invent a step for an empty segment", () => {
      renderEditor("**echo:hi||||**stop");
      expect(steps()).toHaveLength(2);
    });

    it("should keep focus on the moved step's arrows", async () => {
      const { user } = renderEditor("**stop||**delay:5||**screenshot");
      await user.click(stepButton(3, "zapscript.builder.moveUp"));
      expect(stepButton(2, "zapscript.builder.moveUp")).toHaveFocus();
      await user.click(stepButton(2, "zapscript.builder.moveUp"));
      // At the top its up arrow is unavailable, so focus takes the other one.
      expect(stepButton(1, "zapscript.builder.moveDown")).toHaveFocus();
    });

    it("should move focus to Add step when a step is removed", async () => {
      const { user } = renderEditor("**stop||**delay:5");
      await user.click(stepButton(1, "zapscript.builder.remove"));
      expect(steps()).toHaveLength(1);
      expect(addStepButton()).toHaveFocus();
    });

    it("should open the catalogue unfiltered each time", async () => {
      const { user } = renderEditor("");
      await user.click(addStepButton());
      const search = () =>
        within(
          screen.getByRole("dialog", { name: "create.custom.commandsTitle" }),
        ).getByRole("searchbox", { name: "zapscript.builder.searchCommands" });
      await user.type(search(), "echo");
      await user.keyboard("{Escape}");
      await user.click(addStepButton());
      expect(search()).toHaveValue("");
    });
  });
});
