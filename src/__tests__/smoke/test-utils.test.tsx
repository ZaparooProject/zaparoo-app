import { describe, it, expect } from "vitest";
import { render, screen } from "../../test-utils";

describe("Test Utilities", () => {
  it("should render a component with providers", () => {
    // Verify that render actually works and returns a container
    const { container } = render(<div data-testid="test-element">Hello</div>);

    expect(container).toBeInstanceOf(HTMLElement);
    expect(screen.getByTestId("test-element")).toBeInTheDocument();
    expect(screen.getByText("Hello")).toBeInTheDocument();
  });

  it("should provide screen query utilities", () => {
    render(<button type="button">Click me</button>);

    // Verify screen queries work
    const button = screen.getByRole("button", { name: "Click me" });
    expect(button).toBeInTheDocument();
  });
});
