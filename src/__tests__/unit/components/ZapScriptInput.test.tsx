import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "../../../test-utils";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { ZapScriptInput } from "@/components/ZapScriptInput";
import { useStatusStore } from "@/lib/store";
import { CoreAPI, CoreApiError } from "@/lib/coreApi";
import { logger } from "@/lib/logger";
import { act } from "@testing-library/react";
import toast from "react-hot-toast";

// Mock Browser plugin
vi.mock("@capacitor/browser", () => ({
  Browser: {
    open: vi.fn(),
  },
}));

// The editor opens on its step view; the textarea and its command palette are
// on the Text tab.
const renderOnTextTab = async (ui: ReactElement) => {
  render(ui);
  await userEvent
    .setup()
    .click(screen.getByRole("tab", { name: "zapscript.builder.text" }));
};

describe("ZapScriptInput", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset store to initial state
    useStatusStore.setState(useStatusStore.getInitialState());
    // Set connected state for most tests
    act(() => {
      useStatusStore.getState().setConnected(true);
    });
  });

  describe("rendering", () => {
    it("should render textarea with placeholder", async () => {
      // Arrange & Act
      await renderOnTextTab(<ZapScriptInput value="" setValue={vi.fn()} />);

      // Assert
      const textarea = screen.getByRole("textbox", {
        name: "create.custom.textareaLabel",
      });
      expect(textarea).toBeInTheDocument();
      expect(textarea).toHaveAttribute(
        "placeholder",
        "create.custom.textPlaceholder",
      );
    });

    it("should display current value in textarea", async () => {
      // Arrange & Act
      await renderOnTextTab(
        <ZapScriptInput value="**launch.system:nes" setValue={vi.fn()} />,
      );

      // Assert
      const textarea = screen.getByRole("textbox", {
        name: "create.custom.textareaLabel",
      });
      expect(textarea).toHaveValue("**launch.system:nes");
    });

    it("should display character count", () => {
      // Arrange & Act
      render(<ZapScriptInput value="test text" setValue={vi.fn()} />);

      // Assert - Translation key with interpolation
      expect(screen.getByText("create.custom.characters")).toBeInTheDocument();
    });

    it("should show the insert tools without a toggle", async () => {
      await renderOnTextTab(<ZapScriptInput value="" setValue={vi.fn()} />);

      for (const name of ["insertMedia", "insertSystem", "insertCommand"]) {
        expect(
          screen.getByRole("button", { name: `create.custom.${name}` }),
        ).toBeInTheDocument();
      }
      expect(
        screen.getByRole("button", { name: "create.custom.zapscriptHelp" }),
      ).toBeInTheDocument();
    });
  });

  describe("textarea interaction", () => {
    it("should call setValue when typing", async () => {
      // Arrange
      const user = userEvent.setup();
      const setValue = vi.fn();
      await renderOnTextTab(<ZapScriptInput value="" setValue={setValue} />);

      // Act
      const textarea = screen.getByRole("textbox", {
        name: "create.custom.textareaLabel",
      });
      await user.type(textarea, "hello");

      // Assert - setValue is called for each character
      expect(setValue).toHaveBeenCalled();
    });
  });

  describe("run button", () => {
    it("should be disabled when value is empty", () => {
      // Arrange & Act
      render(<ZapScriptInput value="" setValue={vi.fn()} />);

      // Assert
      const runButton = screen.getByRole("button", {
        name: "create.custom.runZapScript",
      });
      expect(runButton).toBeDisabled();
    });

    it("should be enabled when value is not empty and connected", () => {
      // Arrange & Act
      render(<ZapScriptInput value="**launch.system:nes" setValue={vi.fn()} />);

      // Assert
      const runButton = screen.getByRole("button", {
        name: "create.custom.runZapScript",
      });
      expect(runButton).toBeEnabled();
    });

    it("should be disabled when not connected", () => {
      // Arrange
      act(() => {
        useStatusStore.getState().setConnected(false);
      });

      // Act
      render(<ZapScriptInput value="**launch.system:nes" setValue={vi.fn()} />);

      // Assert
      const runButton = screen.getByRole("button", {
        name: "create.custom.runZapScript",
      });
      expect(runButton).toBeDisabled();
    });

    describe("Core run failures", () => {
      const send = vi.fn();

      beforeEach(() => {
        CoreAPI.setWsInstance({ isConnected: true, send });
        send.mockClear();
      });

      afterEach(() => {
        vi.restoreAllMocks();
      });

      const runAndFail = async (error: { message: string; data?: unknown }) => {
        const user = userEvent.setup();
        render(
          <ZapScriptInput
            value="**launch.search:snes/mario"
            setValue={vi.fn()}
          />,
        );
        await user.click(
          screen.getByRole("button", { name: "create.custom.runZapScript" }),
        );
        const request = send.mock.calls
          .map(([payload]) => JSON.parse(payload as string))
          .find((sent) => sent.method === "run");
        await act(async () => {
          await CoreAPI.processReceived({
            data: JSON.stringify({
              jsonrpc: "2.0",
              id: request.id,
              error: { code: 1, ...error },
            }),
          } as MessageEvent);
        });
      };

      it("should show the failure toast without reporting expected script outcomes", async () => {
        const toastError = vi.spyOn(toast, "error");
        const loggerError = vi.spyOn(logger, "error");
        const loggerWarn = vi.spyOn(logger, "warn");

        await runAndFail({
          message: "ZapScript is invalid",
          data: { category: "invalid_script" },
        });

        await waitFor(() => {
          expect(toastError).toHaveBeenCalledWith("create.custom.failMsg");
        });
        expect(loggerWarn).toHaveBeenCalledWith(
          "ZapScript run failed:",
          expect.any(CoreApiError),
          expect.objectContaining({
            action: "runZapScript",
            runErrorCategory: "invalid_script",
          }),
        );
        expect(loggerError).not.toHaveBeenCalled();
      });

      it("should report unexpected execution failures once as a warning", async () => {
        const toastError = vi.spyOn(toast, "error");
        const loggerError = vi.spyOn(logger, "error");

        await runAndFail({
          message: "ZapScript execution failed",
          data: { category: "execution_failed" },
        });

        await waitFor(() => {
          expect(toastError).toHaveBeenCalledWith("create.custom.failMsg");
        });
        expect(loggerError).toHaveBeenCalledTimes(1);
        expect(loggerError).toHaveBeenCalledWith(
          "ZapScript run failed:",
          expect.any(CoreApiError),
          expect.objectContaining({
            category: "api",
            action: "runZapScript",
            severity: "warning",
            runErrorCategory: "execution_failed",
          }),
        );
      });
    });
  });

  describe("clear button", () => {
    it("should be disabled when value is empty", () => {
      // Arrange & Act
      render(<ZapScriptInput value="" setValue={vi.fn()} />);

      // Assert - The editor's clear button (not the one in the hidden confirm modal) should be disabled
      // When modal is closed (aria-hidden="true"), getByRole only finds buttons in accessible tree
      const clearButtons = screen.getAllByRole("button", {
        name: "create.custom.clear",
      }) as HTMLButtonElement[];
      // At least one clear button should be disabled (the editor's own)
      const disabledButton = clearButtons.find((btn) => btn.disabled);
      expect(disabledButton).toBeTruthy();
    });

    it("should be enabled when value is not empty", () => {
      // Arrange & Act
      render(<ZapScriptInput value="some text" setValue={vi.fn()} />);

      // Assert - The editor's clear button should be enabled
      const clearButtons = screen.getAllByRole("button", {
        name: "create.custom.clear",
      }) as HTMLButtonElement[];
      const enabledButton = clearButtons.find((btn) => !btn.disabled);
      expect(enabledButton).toBeTruthy();
    });

    it("should open confirm modal when clicked", async () => {
      // Arrange
      const user = userEvent.setup();
      render(<ZapScriptInput value="some text" setValue={vi.fn()} />);

      // Act - Click the enabled clear button to open confirm modal
      const clearButtons = screen.getAllByRole("button", {
        name: "create.custom.clear",
      }) as HTMLButtonElement[];
      const enabledButton = clearButtons.find((btn) => !btn.disabled);
      expect(enabledButton).toBeTruthy();
      await user.click(enabledButton!);

      // Assert - Confirm modal should open (SlideModal renders title twice for mobile/desktop)
      await waitFor(() => {
        const titles = screen.getAllByText("create.custom.clearConfirmTitle");
        expect(titles.length).toBeGreaterThan(0);
      });
    });

    it("should clear value when confirmed", async () => {
      // Arrange
      const user = userEvent.setup();
      const setValue = vi.fn();
      render(<ZapScriptInput value="some text" setValue={setValue} />);

      // Act - Open confirm modal by clicking the enabled clear button
      const clearButtons = screen.getAllByRole("button", {
        name: "create.custom.clear",
      }) as HTMLButtonElement[];
      const enabledButton = clearButtons.find((btn) => !btn.disabled);
      expect(enabledButton).toBeTruthy();
      await user.click(enabledButton!);

      await waitFor(() => {
        const titles = screen.getAllByText("create.custom.clearConfirmTitle");
        expect(titles.length).toBeGreaterThan(0);
      });

      // Click the clear button in the visible modal dialog
      // The modal has Cancel and Clear buttons - find Clear by its text content
      const dialog = screen.getByRole("dialog");
      const modalClearButton = within(dialog).getByRole("button", {
        name: "create.custom.clear",
      });
      await user.click(modalClearButton);

      // Assert
      expect(setValue).toHaveBeenCalledWith("");
    });
  });

  describe("secondary action buttons", () => {
    it("should show search media button", async () => {
      // Arrange & Act
      await renderOnTextTab(<ZapScriptInput value="" setValue={vi.fn()} />);

      // Assert - Button has aria-label from insertMedia prop
      expect(
        screen.getByLabelText("create.custom.insertMedia"),
      ).toBeInTheDocument();
    });

    it("should show select system button", async () => {
      // Arrange & Act
      await renderOnTextTab(<ZapScriptInput value="" setValue={vi.fn()} />);

      // Assert - Button has aria-label from insertSystem prop
      expect(
        screen.getByLabelText("create.custom.insertSystem"),
      ).toBeInTheDocument();
    });

    it("should show commands button", async () => {
      // Arrange & Act
      await renderOnTextTab(<ZapScriptInput value="" setValue={vi.fn()} />);

      // Assert - Button has aria-label from insertCommand prop
      expect(
        screen.getByLabelText("create.custom.insertCommand"),
      ).toBeInTheDocument();
    });

    it("should show help button", async () => {
      // Arrange & Act
      await renderOnTextTab(<ZapScriptInput value="" setValue={vi.fn()} />);

      // Assert - Find by visible label text
      expect(
        screen.getByRole("button", { name: "create.custom.zapscriptHelp" }),
      ).toBeInTheDocument();
    });

    it("should disable media and system buttons when not connected", async () => {
      // Arrange
      act(() => {
        useStatusStore.getState().setConnected(false);
      });

      // Act
      await renderOnTextTab(<ZapScriptInput value="" setValue={vi.fn()} />);

      // Assert - Use aria-label to find buttons
      expect(screen.getByLabelText("create.custom.insertMedia")).toBeDisabled();
      expect(
        screen.getByLabelText("create.custom.insertSystem"),
      ).toBeDisabled();
    });
  });

  describe("rows prop", () => {
    it("should use default rows of 4", async () => {
      // Arrange & Act
      await renderOnTextTab(<ZapScriptInput value="" setValue={vi.fn()} />);

      // Assert
      const textarea = screen.getByRole("textbox", {
        name: "create.custom.textareaLabel",
      });
      expect(textarea).toHaveAttribute("rows", "4");
    });

    it("should use custom rows when provided", async () => {
      // Arrange & Act
      await renderOnTextTab(
        <ZapScriptInput value="" setValue={vi.fn()} rows={8} />,
      );

      // Assert
      const textarea = screen.getByRole("textbox", {
        name: "create.custom.textareaLabel",
      });
      expect(textarea).toHaveAttribute("rows", "8");
    });
  });

  describe("accessibility", () => {
    it("should have live region for character count", () => {
      // Arrange & Act
      render(<ZapScriptInput value="test" setValue={vi.fn()} />);

      // Assert
      const charCount = screen.getByText("create.custom.characters");
      expect(charCount).toHaveAttribute("aria-live", "polite");
      expect(charCount).toHaveAttribute("aria-atomic", "true");
    });

    it("should give two editors on one page distinct ids", () => {
      render(
        <>
          <ZapScriptInput value="" setValue={vi.fn()} aria-label="first" />
          <ZapScriptInput value="" setValue={vi.fn()} aria-label="second" />
        </>,
      );

      const panelIds = screen
        .getAllByRole("tab")
        .map((tab) => tab.getAttribute("aria-controls"));
      expect(new Set(panelIds).size).toBe(4);
      for (const tab of screen.getAllByRole("tab")) {
        expect(
          document.getElementById(tab.getAttribute("aria-controls")!),
        ).toHaveAttribute("aria-labelledby", tab.id);
      }
    });

    it("should lock the textarea and its insert tools when disabled", async () => {
      await renderOnTextTab(
        <ZapScriptInput value="abc" setValue={vi.fn()} disabled />,
      );

      expect(
        screen.getByRole("textbox", { name: "create.custom.textareaLabel" }),
      ).toBeDisabled();
      expect(
        screen.getByLabelText("create.custom.insertCommand"),
      ).toBeDisabled();
      expect(
        screen.getByRole("button", { name: "create.custom.clear" }),
      ).toBeDisabled();
    });
  });

  describe("help link", () => {
    it("should open zapscript documentation when help button clicked", async () => {
      // Arrange
      const { Browser } = await import("@capacitor/browser");
      const user = userEvent.setup();
      await renderOnTextTab(<ZapScriptInput value="" setValue={vi.fn()} />);

      // Act
      await user.click(
        screen.getByRole("button", { name: "create.custom.zapscriptHelp" }),
      );

      // Assert
      expect(Browser.open).toHaveBeenCalledWith({
        url: "https://zaparoo.org/docs/zapscript/",
      });
    });
  });

  describe("media search modal", () => {
    it("should open media search modal when search media button clicked", async () => {
      // Arrange
      const user = userEvent.setup();
      await renderOnTextTab(<ZapScriptInput value="" setValue={vi.fn()} />);

      // Act
      await user.click(screen.getByLabelText("create.custom.insertMedia"));

      // Assert - MediaSearchModal should be open (check for modal elements)
      await waitFor(() => {
        // The modal should render with its title
        const titles = screen.getAllByText("create.search.title");
        expect(titles.length).toBeGreaterThan(0);
      });
    });
  });

  describe("system selector modal", () => {
    it("should open system selector when select system button clicked", async () => {
      // Arrange
      const user = userEvent.setup();
      await renderOnTextTab(<ZapScriptInput value="" setValue={vi.fn()} />);

      // Act
      await user.click(screen.getByLabelText("create.custom.insertSystem"));

      // Assert - SystemSelector should be open
      await waitFor(() => {
        // SystemSelector modal should be visible with title
        const titles = screen.getAllByText("create.custom.selectSystem");
        expect(titles.length).toBeGreaterThan(0);
      });
    });
  });

  describe("commands modal", () => {
    it("should open commands modal when commands button clicked", async () => {
      // Arrange
      const user = userEvent.setup();
      await renderOnTextTab(<ZapScriptInput value="" setValue={vi.fn()} />);

      // Act
      await user.click(screen.getByLabelText("create.custom.insertCommand"));

      // Assert - CommandsModal should be open
      await waitFor(() => {
        // CommandsModal should be visible with its title (title is "create.custom.commands")
        // Look for the dialog role which is rendered when modal opens
        expect(screen.getByRole("dialog")).toBeInTheDocument();
      });
    });
  });

  describe("cursor position tracking", () => {
    const renderEditor = async (value: string, setValue = vi.fn()) => {
      await renderOnTextTab(
        <ZapScriptInput value={value} setValue={setValue} />,
      );
      return {
        setValue,
        textarea: screen.getByRole("textbox", {
          name: "create.custom.textareaLabel",
        }) as HTMLTextAreaElement,
      };
    };

    const insertStop = async (user: ReturnType<typeof userEvent.setup>) => {
      await user.click(screen.getByLabelText("create.custom.insertCommand"));
      const catalogue = await screen.findByRole("dialog", {
        name: "create.custom.commandsTitle",
      });
      await user.click(
        within(catalogue).getByRole("button", { name: /(^|\s)stop(\s|$)/ }),
      );
    };

    it("should append to pre-filled text that has never been focused", async () => {
      const user = userEvent.setup();
      const { setValue } = await renderEditor("**launch.system:snes");

      await insertStop(user);

      expect(setValue).toHaveBeenCalledWith("**launch.system:snes||**stop");
    });

    it("should insert at the caret the user placed, as a step of its own", async () => {
      const user = userEvent.setup();
      const { setValue, textarea } = await renderEditor("hello world");

      await user.click(textarea);
      textarea.setSelectionRange(5, 5);
      fireEvent.select(textarea);

      await insertStop(user);

      expect(setValue).toHaveBeenCalledWith("hello||**stop|| world");
    });

    it("should keep the caret the textarea had when focus moved to a tool", async () => {
      const user = userEvent.setup();
      const { setValue, textarea } = await renderEditor("hello world");

      await user.click(textarea);
      textarea.setSelectionRange(0, 0);
      // No select event: the live selection is read as focus leaves.
      await insertStop(user);

      expect(setValue).toHaveBeenCalledWith("**stop||hello world");
    });

    it.each([
      ["", "**stop"],
      ["**delay:500||", "**delay:500||**stop"],
      ["**delay:500 || ", "**delay:500 || **stop"],
    ])(
      "should not add a separator that is not needed: %j",
      async (value, expected) => {
        const user = userEvent.setup();
        const { setValue } = await renderEditor(value);

        await insertStop(user);

        expect(setValue).toHaveBeenCalledWith(expected);
      },
    );
  });
});
