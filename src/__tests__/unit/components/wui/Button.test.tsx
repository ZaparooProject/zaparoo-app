import { render, screen } from "../../../../test-utils";
import { describe, it, expect } from "vitest";
import { Button } from "../../../../components/wui/Button";

describe("Button", () => {
  it("should not have autoFocus prop in interface", () => {
    // This test ensures the Button interface doesn't include autoFocus
    render(<Button label="Test button" />);
    const buttonElement = screen.getByRole("button", { name: "Test button" });

    // AutoFocus should not be a supported prop
    expect(buttonElement).not.toHaveAttribute("autoFocus");
    expect(buttonElement).not.toHaveAttribute("autofocus");
  });
});
