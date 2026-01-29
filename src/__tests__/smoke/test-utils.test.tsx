import { describe, it, expect } from "vitest";
import { render, screen } from "../../test-utils";
import { Button } from "../../components/wui/Button";
import { Card } from "../../components/wui/Card";
import { TextInput } from "../../components/wui/TextInput";

// Smoke tests verify that core app components render correctly
// For detailed behavior tests, see unit tests
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

    it("should render as button when onClick is provided", () => {
      render(
        <Card onClick={() => {}}>
          <span>Interactive card</span>
        </Card>,
      );

      expect(screen.getByRole("button")).toBeInTheDocument();
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
  });
});
