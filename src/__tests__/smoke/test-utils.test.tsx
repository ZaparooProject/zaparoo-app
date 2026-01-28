import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "../../test-utils";
import { Button } from "../../components/wui/Button";
import { Card } from "../../components/wui/Card";
import { TextInput } from "../../components/wui/TextInput";

// Smoke tests verify that core app components render and function correctly
describe("App Component Smoke Tests", () => {
  describe("Button Component", () => {
    it("should render with label", () => {
      render(<Button label="Submit" />);
      expect(
        screen.getByRole("button", { name: "Submit" }),
      ).toBeInTheDocument();
    });

    it("should render with different variants", () => {
      const { rerender } = render(<Button label="Fill" variant="fill" />);
      expect(screen.getByRole("button")).toBeInTheDocument();

      rerender(<Button label="Outline" variant="outline" />);
      expect(screen.getByRole("button")).toBeInTheDocument();

      rerender(<Button label="Text" variant="text" />);
      expect(screen.getByRole("button")).toBeInTheDocument();
    });

    it("should handle click events", () => {
      const onClick = vi.fn();
      render(<Button label="Click me" onClick={onClick} />);

      screen.getByRole("button").click();
      expect(onClick).toHaveBeenCalled();
    });

    it("should render disabled state", () => {
      render(<Button label="Disabled" disabled />);
      expect(screen.getByRole("button")).toBeDisabled();
    });

    it("should support icon-only buttons with aria-label", () => {
      render(
        <Button icon={<span data-testid="icon">X</span>} aria-label="Close" />,
      );
      expect(screen.getByRole("button", { name: "Close" })).toBeInTheDocument();
      expect(screen.getByTestId("icon")).toBeInTheDocument();
    });
  });

  describe("Card Component", () => {
    it("should render children", () => {
      render(
        <Card>
          <span>Card content</span>
        </Card>,
      );
      expect(screen.getByText("Card content")).toBeInTheDocument();
    });

    it("should be interactive when onClick is provided", () => {
      const onClick = vi.fn();
      render(
        <Card onClick={onClick}>
          <span>Interactive card</span>
        </Card>,
      );

      const card = screen.getByRole("button");
      expect(card).toBeInTheDocument();
      card.click();
      expect(onClick).toHaveBeenCalled();
    });
  });

  describe("TextInput Component", () => {
    it("should render with placeholder", () => {
      render(<TextInput placeholder="Enter text" value="" />);
      expect(screen.getByPlaceholderText("Enter text")).toBeInTheDocument();
    });

    it("should render with value", () => {
      render(<TextInput value="test" />);
      expect(screen.getByDisplayValue("test")).toBeInTheDocument();
    });

    it("should call setValue when input changes", () => {
      const setValue = vi.fn();
      render(<TextInput value="" setValue={setValue} />);
      const input = screen.getByRole("textbox");
      fireEvent.change(input, { target: { value: "x" } });
      expect(setValue).toHaveBeenCalledWith("x");
    });
  });
});
