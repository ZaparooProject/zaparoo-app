import { describe, it, expect, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { render, screen, within } from "../../../test-utils";
import { CommandsModal } from "@/components/CommandsModal";

const renderCatalogue = () => {
  const close = vi.fn();
  const onSelect = vi.fn();
  render(<CommandsModal isOpen={true} close={close} onSelect={onSelect} />);
  const dialog = screen.getByRole("dialog", {
    name: "create.custom.commandsTitle",
  });
  return { close, onSelect, dialog, user: userEvent.setup() };
};

// A command's button is named by its description and its name, so the name is
// matched as a whole word: `stop` must not also find `playlist.stop`.
const commandName = (name: string) =>
  new RegExp(`(^|\\s)${name.replaceAll(".", "\\.")}(\\s|$)`);
const commandButton = (name: string) =>
  screen.getByRole("button", { name: commandName(name) });
const queryCommandButton = (name: string) =>
  screen.queryByRole("button", { name: commandName(name) });
const searchBox = () =>
  screen.getByRole("searchbox", { name: "zapscript.builder.searchCommands" });

describe("CommandsModal", () => {
  it("should render when open", () => {
    const { dialog } = renderCatalogue();

    expect(
      within(dialog).getByRole("heading", {
        name: "create.custom.commandsTitle",
      }),
    ).toBeInTheDocument();
  });

  it("should not render content when closed", () => {
    render(<CommandsModal isOpen={false} close={vi.fn()} onSelect={vi.fn()} />);

    // Modal should have aria-hidden when closed
    const modal = screen.getByRole("dialog", { hidden: true });
    expect(modal).toHaveAttribute("aria-hidden", "true");
  });

  it.each([
    "launch",
    "playlist",
    "input",
    "profile",
    "utility",
    "http",
    "mister",
  ])("should render the %s group", (group) => {
    renderCatalogue();

    expect(
      screen.getByRole("heading", { name: `zapscript.groups.${group}` }),
    ).toBeInTheDocument();
  });

  it.each([
    ["launch", ["launch", "launch.system", "launch.random", "launch.search"]],
    [
      "input",
      ["input.keyboard", "input.gamepad", "input.coinp1", "input.coinp2"],
    ],
    [
      "playlist",
      ["playlist.load", "playlist.play", "playlist.stop", "playlist.next"],
    ],
  ])("should list the %s commands under their group", (group, names) => {
    renderCatalogue();

    const section = screen.getByRole("region", {
      name: `zapscript.groups.${group}`,
    });
    for (const name of names) {
      expect(
        within(section).getByRole("button", { name: commandName(name) }),
      ).toBeInTheDocument();
    }
  });

  it("should describe each command in plain language", () => {
    renderCatalogue();

    expect(commandButton("launch.system")).toHaveTextContent(
      "zapscript.commands.launch_system.description",
    );
  });

  it.each(["system", "key", "random", "shell", "get"])(
    "should not offer the deprecated %s command",
    (name) => {
      renderCatalogue();

      expect(queryCommandButton(name)).not.toBeInTheDocument();
    },
  );

  it.each(["evaluate", "traits", "ui.notice", "ui.picker"])(
    "should not offer %s, which cannot be a step of its own",
    (name) => {
      renderCatalogue();

      expect(queryCommandButton(name)).not.toBeInTheDocument();
    },
  );

  it("should not show a group with nothing to offer", () => {
    renderCatalogue();

    expect(
      screen.queryByRole("heading", { name: "zapscript.groups.ui" }),
    ).not.toBeInTheDocument();
  });

  describe("search", () => {
    it("should filter commands by name", async () => {
      const { user } = renderCatalogue();

      await user.type(searchBox(), "coinp");

      expect(commandButton("input.coinp1")).toBeInTheDocument();
      expect(commandButton("input.coinp4")).toBeInTheDocument();
      expect(queryCommandButton("input.keyboard")).not.toBeInTheDocument();
      expect(queryCommandButton("launch.system")).not.toBeInTheDocument();
      expect(
        screen.queryByRole("heading", { name: "zapscript.groups.launch" }),
      ).not.toBeInTheDocument();
    });

    it("should ignore case and surrounding spaces", async () => {
      const { user } = renderCatalogue();

      await user.type(searchBox(), " DELAY ");

      expect(commandButton("delay")).toBeInTheDocument();
      expect(queryCommandButton("stop")).not.toBeInTheDocument();
    });

    it("should filter commands by description", async () => {
      const { user } = renderCatalogue();

      // Only the description key spells the name with an underscore.
      await user.type(searchBox(), "launch_system");

      expect(commandButton("launch.system")).toBeInTheDocument();
      expect(queryCommandButton("launch")).not.toBeInTheDocument();
      expect(queryCommandButton("launch.random")).not.toBeInTheDocument();
    });

    it("should not find deprecated commands by name", async () => {
      const { user } = renderCatalogue();

      await user.type(searchBox(), "shell");

      expect(queryCommandButton("shell")).not.toBeInTheDocument();
      expect(
        screen.getByText("zapscript.builder.noCommands"),
      ).toBeInTheDocument();
    });

    it("should say when nothing matches", async () => {
      const { user } = renderCatalogue();

      await user.type(searchBox(), "no such command");

      expect(
        screen.getByText("zapscript.builder.noCommands"),
      ).toBeInTheDocument();
      expect(queryCommandButton("stop")).not.toBeInTheDocument();
    });

    it("should list every command again when the search is cleared", async () => {
      const { user } = renderCatalogue();
      await user.type(searchBox(), "coinp");

      await user.clear(searchBox());

      expect(commandButton("launch.system")).toBeInTheDocument();
      expect(commandButton("stop")).toBeInTheDocument();
    });
  });

  describe("selecting", () => {
    it.each(["launch.system", "stop", "delay", "input.coinp1"])(
      "should report the bare name of %s and close",
      async (name) => {
        const { user, onSelect, close } = renderCatalogue();

        await user.click(commandButton(name));

        expect(onSelect).toHaveBeenCalledTimes(1);
        expect(onSelect).toHaveBeenCalledWith(name);
        expect(close).toHaveBeenCalledTimes(1);
      },
    );

    it("should select a command found by searching", async () => {
      const { user, onSelect, close } = renderCatalogue();
      await user.type(searchBox(), "playlist.next");

      await user.click(commandButton("playlist.next"));

      expect(onSelect).toHaveBeenCalledWith("playlist.next");
      expect(close).toHaveBeenCalledTimes(1);
    });
  });
});
