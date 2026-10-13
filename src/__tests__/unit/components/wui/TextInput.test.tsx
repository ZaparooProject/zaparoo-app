import { render, screen } from "../../../../test-utils";
import { TextInput } from "@/components/wui/TextInput";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";

describe("TextInput", () => {
  it("renders input with placeholder", () => {
    render(<TextInput value="" placeholder="Enter text here" />);

    const input = screen.getByPlaceholderText("Enter text here");
    expect(input).toBeInTheDocument();
  });

  it("calls setValue when text is entered", async () => {
    const mockSetValue = vi.fn();
    const user = userEvent.setup();

    render(
      <TextInput value="" setValue={mockSetValue} placeholder="Enter text" />,
    );

    const input = screen.getByPlaceholderText("Enter text");
    await user.type(input, "test input");

    expect(mockSetValue).toHaveBeenCalledWith("test input");
  });

  it("should keep Save mounted through editing and keyboard saving", async () => {
    const mockSaveValue = vi.fn();
    const user = userEvent.setup();

    render(
      <TextInput
        label="Device name"
        value="initial"
        saveValue={mockSaveValue}
      />,
    );

    const input = screen.getByRole("textbox", { name: "Device name" });
    const saveButton = screen.getByRole("button", { name: "save" });
    expect(saveButton).toBeDisabled();
    await user.click(saveButton);
    expect(mockSaveValue).not.toHaveBeenCalled();

    await user.clear(input);
    await user.type(input, "modified text");

    expect(screen.getByRole("button", { name: "save" })).toBe(saveButton);
    expect(saveButton).toBeEnabled();
    await user.tab();
    expect(saveButton).toHaveFocus();
    await user.keyboard("{Enter}");

    expect(mockSaveValue).toHaveBeenCalledExactlyOnceWith("modified text");
    expect(screen.getByRole("button", { name: "save" })).toBe(saveButton);
    expect(saveButton).toBeDisabled();
    expect(input).toHaveValue("modified text");
  });

  it("should hide clear and save actions when changed to read-only", async () => {
    const mockSetValue = vi.fn();
    const mockSaveValue = vi.fn();
    const user = userEvent.setup();
    const { rerender } = render(
      <TextInput
        value="initial"
        setValue={mockSetValue}
        saveValue={mockSaveValue}
        clearable
      />,
    );

    const input = screen.getByRole("textbox");
    await user.type(input, " edit");
    expect(screen.getByRole("button", { name: "save" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "clearSearch" }),
    ).toBeInTheDocument();

    rerender(
      <TextInput
        value="initial"
        setValue={mockSetValue}
        saveValue={mockSaveValue}
        clearable
        readOnly
      />,
    );

    expect(input).toHaveAttribute("readonly");
    expect(input).toHaveValue("initial edit");
    expect(
      screen.queryByRole("button", { name: "save" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "clearSearch" }),
    ).not.toBeInTheDocument();
    expect(mockSaveValue).not.toHaveBeenCalled();
  });

  it("calls onKeyUp handler when Enter key is pressed", async () => {
    const mockOnKeyUp = vi.fn();
    const user = userEvent.setup();

    render(
      <TextInput value="" onKeyUp={mockOnKeyUp} placeholder="Enter text" />,
    );

    const input = screen.getByPlaceholderText("Enter text");
    await user.type(input, "test{Enter}");

    expect(mockOnKeyUp).toHaveBeenCalled();
    const lastCall =
      mockOnKeyUp.mock.calls[mockOnKeyUp.mock.calls.length - 1]![0];
    expect(lastCall.key).toBe("Enter");
  });
});
