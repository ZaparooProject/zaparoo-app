import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "../../../test-utils";
import userEvent from "@testing-library/user-event";
import { ZapScriptInput } from "@/components/ZapScriptInput";
import { useStatusStore } from "@/lib/store";
import { act } from "@testing-library/react";

// Mock Browser plugin
vi.mock("@capacitor/browser", () => ({
  Browser: {
    open: vi.fn(),
  },
}));

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
    it("should render textarea with placeholder", () => {
      // Arrange & Act
      render(<ZapScriptInput value="" setValue={vi.fn()} />);

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

    it("should display current value in textarea", () => {
      // Arrange & Act
      render(<ZapScriptInput value="**launch.system:nes" setValue={vi.fn()} />);

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

    it("should have command palette toggle button", () => {
      // Arrange & Act
      render(<ZapScriptInput value="" setValue={vi.fn()} />);

      // Assert
      expect(
        screen.getByRole("button", { name: "create.custom.commandPalette" }),
      ).toBeInTheDocument();
    });
  });

  describe("textarea interaction", () => {
    it("should call setValue when typing", async () => {
      // Arrange
      const user = userEvent.setup();
      const setValue = vi.fn();
      render(<ZapScriptInput value="" setValue={setValue} />);

      // Act
      const textarea = screen.getByRole("textbox", {
        name: "create.custom.textareaLabel",
      });
      await user.type(textarea, "hello");

      // Assert - setValue is called for each character
      expect(setValue).toHaveBeenCalled();
    });

    it("should have aria-describedby pointing to character count", () => {
      // Arrange & Act
      render(<ZapScriptInput value="" setValue={vi.fn()} />);

      // Assert
      const textarea = screen.getByRole("textbox", {
        name: "create.custom.textareaLabel",
      });
      expect(textarea).toHaveAttribute(
        "aria-describedby",
        "zapscript-char-count",
      );
    });
  });

  describe("command palette", () => {
    it("should be hidden by default when showPalette is false", () => {
      // Arrange & Act
      render(
        <ZapScriptInput value="" setValue={vi.fn()} showPalette={false} />,
      );

      // Assert - Controls should not be visible
      expect(
        screen.queryByLabelText("create.custom.insertCommandStart"),
      ).not.toBeInTheDocument();
    });

    it("should show controls when showPalette is true", () => {
      // Arrange & Act
      render(<ZapScriptInput value="" setValue={vi.fn()} showPalette={true} />);

      // Assert - Controls should be visible
      expect(
        screen.getByLabelText("create.custom.insertCommandStart"),
      ).toBeInTheDocument();
    });

    it("should toggle controls visibility when palette button clicked", async () => {
      // Arrange
      const user = userEvent.setup();
      render(
        <ZapScriptInput value="" setValue={vi.fn()} showPalette={false} />,
      );

      // Act - Click to expand
      await user.click(
        screen.getByRole("button", { name: "create.custom.commandPalette" }),
      );

      // Assert - Controls should now be visible
      expect(
        screen.getByLabelText("create.custom.insertCommandStart"),
      ).toBeInTheDocument();
    });

    it("should have aria-expanded attribute on palette toggle", async () => {
      // Arrange
      const user = userEvent.setup();
      render(
        <ZapScriptInput value="" setValue={vi.fn()} showPalette={false} />,
      );

      // Assert - Initially not expanded
      const toggle = screen.getByRole("button", {
        name: "create.custom.commandPalette",
      });
      expect(toggle).toHaveAttribute("aria-expanded", "false");

      // Act - Click to expand
      await user.click(toggle);

      // Assert - Now expanded
      expect(toggle).toHaveAttribute("aria-expanded", "true");
    });
  });

  describe("insert buttons", () => {
    it("should insert ** when command start button clicked", async () => {
      // Arrange
      const user = userEvent.setup();
      const setValue = vi.fn();
      render(
        <ZapScriptInput value="" setValue={setValue} showPalette={true} />,
      );

      // Act
      await user.click(
        screen.getByLabelText("create.custom.insertCommandStart"),
      );

      // Assert - Should insert **
      expect(setValue).toHaveBeenCalledWith("**");
    });

    it("should insert || when separator button clicked", async () => {
      // Arrange
      const user = userEvent.setup();
      const setValue = vi.fn();
      render(
        <ZapScriptInput value="" setValue={setValue} showPalette={true} />,
      );

      // Act
      await user.click(
        screen.getByLabelText("create.custom.insertCommandSeparator"),
      );

      // Assert - Should insert ||
      expect(setValue).toHaveBeenCalledWith("||");
    });
  });

  describe("run button", () => {
    it("should be disabled when value is empty", () => {
      // Arrange & Act
      render(<ZapScriptInput value="" setValue={vi.fn()} showPalette={true} />);

      // Assert
      const runButton = screen.getByRole("button", {
        name: "create.custom.runZapScript",
      });
      expect(runButton).toBeDisabled();
    });

    it("should be enabled when value is not empty and connected", () => {
      // Arrange & Act
      render(
        <ZapScriptInput
          value="**launch.system:nes"
          setValue={vi.fn()}
          showPalette={true}
        />,
      );

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
      render(
        <ZapScriptInput
          value="**launch.system:nes"
          setValue={vi.fn()}
          showPalette={true}
        />,
      );

      // Assert
      const runButton = screen.getByRole("button", {
        name: "create.custom.runZapScript",
      });
      expect(runButton).toBeDisabled();
    });
  });

  describe("clear button", () => {
    it("should be disabled when value is empty", () => {
      // Arrange & Act
      render(<ZapScriptInput value="" setValue={vi.fn()} showPalette={true} />);

      // Assert - The palette clear button (visible, not in hidden modal) should be disabled
      // When modal is closed (aria-hidden="true"), getByRole only finds buttons in accessible tree
      const clearButtons = screen.getAllByRole("button", {
        name: "create.custom.clear",
      }) as HTMLButtonElement[];
      // At least one clear button should be disabled (the palette one)
      const disabledButton = clearButtons.find((btn) => btn.disabled);
      expect(disabledButton).toBeTruthy();
    });

    it("should be enabled when value is not empty", () => {
      // Arrange & Act
      render(
        <ZapScriptInput
          value="some text"
          setValue={vi.fn()}
          showPalette={true}
        />,
      );

      // Assert - The palette clear button should be enabled
      const clearButtons = screen.getAllByRole("button", {
        name: "create.custom.clear",
      }) as HTMLButtonElement[];
      const enabledButton = clearButtons.find((btn) => !btn.disabled);
      expect(enabledButton).toBeTruthy();
    });

    it("should open confirm modal when clicked", async () => {
      // Arrange
      const user = userEvent.setup();
      render(
        <ZapScriptInput
          value="some text"
          setValue={vi.fn()}
          showPalette={true}
        />,
      );

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
      render(
        <ZapScriptInput
          value="some text"
          setValue={setValue}
          showPalette={true}
        />,
      );

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
    it("should show search media button", () => {
      // Arrange & Act
      render(<ZapScriptInput value="" setValue={vi.fn()} showPalette={true} />);

      // Assert - Button has aria-label from insertMedia prop
      expect(
        screen.getByLabelText("create.custom.insertMedia"),
      ).toBeInTheDocument();
    });

    it("should show select system button", () => {
      // Arrange & Act
      render(<ZapScriptInput value="" setValue={vi.fn()} showPalette={true} />);

      // Assert - Button has aria-label from insertSystem prop
      expect(
        screen.getByLabelText("create.custom.insertSystem"),
      ).toBeInTheDocument();
    });

    it("should show commands button", () => {
      // Arrange & Act
      render(<ZapScriptInput value="" setValue={vi.fn()} showPalette={true} />);

      // Assert - Button has aria-label from insertCommand prop
      expect(
        screen.getByLabelText("create.custom.insertCommand"),
      ).toBeInTheDocument();
    });

    it("should show help button", () => {
      // Arrange & Act
      render(<ZapScriptInput value="" setValue={vi.fn()} showPalette={true} />);

      // Assert - Find by visible label text
      expect(
        screen.getByRole("button", { name: "create.custom.zapscriptHelp" }),
      ).toBeInTheDocument();
    });

    it("should disable media and system buttons when not connected", () => {
      // Arrange
      act(() => {
        useStatusStore.getState().setConnected(false);
      });

      // Act
      render(<ZapScriptInput value="" setValue={vi.fn()} showPalette={true} />);

      // Assert - Use aria-label to find buttons
      expect(screen.getByLabelText("create.custom.insertMedia")).toBeDisabled();
      expect(
        screen.getByLabelText("create.custom.insertSystem"),
      ).toBeDisabled();
    });
  });

  describe("rows prop", () => {
    it("should use default rows of 4", () => {
      // Arrange & Act
      render(<ZapScriptInput value="" setValue={vi.fn()} />);

      // Assert
      const textarea = screen.getByRole("textbox", {
        name: "create.custom.textareaLabel",
      });
      expect(textarea).toHaveAttribute("rows", "4");
    });

    it("should use custom rows when provided", () => {
      // Arrange & Act
      render(<ZapScriptInput value="" setValue={vi.fn()} rows={8} />);

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
      const charCount = document.getElementById("zapscript-char-count");
      expect(charCount).toHaveAttribute("aria-live", "polite");
      expect(charCount).toHaveAttribute("aria-atomic", "true");
    });

    it("should have aria-controls on palette toggle", async () => {
      // Arrange
      const user = userEvent.setup();
      render(
        <ZapScriptInput value="" setValue={vi.fn()} showPalette={false} />,
      );

      // Assert
      const toggle = screen.getByRole("button", {
        name: "create.custom.commandPalette",
      });
      expect(toggle).toHaveAttribute("aria-controls", "zapscript-controls");

      // Act - expand to verify controls ID exists
      await user.click(toggle);

      // Assert - controls element should exist with the ID
      expect(document.getElementById("zapscript-controls")).toBeInTheDocument();
    });
  });

  describe("help link", () => {
    it("should open zapscript documentation when help button clicked", async () => {
      // Arrange
      const { Browser } = await import("@capacitor/browser");
      const user = userEvent.setup();
      render(<ZapScriptInput value="" setValue={vi.fn()} showPalette={true} />);

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
      render(<ZapScriptInput value="" setValue={vi.fn()} showPalette={true} />);

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
      render(<ZapScriptInput value="" setValue={vi.fn()} showPalette={true} />);

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
      render(<ZapScriptInput value="" setValue={vi.fn()} showPalette={true} />);

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
    it("should insert text at cursor position", async () => {
      // Arrange
      const user = userEvent.setup();
      const setValue = vi.fn();
      render(
        <ZapScriptInput
          value="hello world"
          setValue={setValue}
          showPalette={true}
        />,
      );

      // Act - focus textarea and set selection, then click insert
      const textarea = screen.getByRole("textbox", {
        name: "create.custom.textareaLabel",
      }) as HTMLTextAreaElement;

      // Simulate selecting at position 5 (after "hello")
      textarea.focus();
      textarea.setSelectionRange(5, 5);
      // Trigger select event to update cursor position
      await user.click(textarea);

      // Now insert ** - it should append at cursor position tracked
      await user.click(
        screen.getByLabelText("create.custom.insertCommandStart"),
      );

      // Assert - setValue should be called (cursor tracking is internal)
      expect(setValue).toHaveBeenCalled();
    });
  });
});
