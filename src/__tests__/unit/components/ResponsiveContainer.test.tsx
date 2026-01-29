import { render, screen } from "../../../test-utils";
import { ResponsiveContainer } from "@/components/ResponsiveContainer";

describe("ResponsiveContainer", () => {
  it("should render children correctly", () => {
    render(
      <ResponsiveContainer>
        <div>Test Content</div>
      </ResponsiveContainer>,
    );

    expect(screen.getByText("Test Content")).toBeInTheDocument();
  });

  it("should render multiple children", () => {
    render(
      <ResponsiveContainer>
        <div>First child</div>
        <div>Second child</div>
      </ResponsiveContainer>,
    );

    expect(screen.getByText("First child")).toBeInTheDocument();
    expect(screen.getByText("Second child")).toBeInTheDocument();
  });

  it("should apply custom className", () => {
    const { container } = render(
      <ResponsiveContainer className="custom-class">
        <div>Content</div>
      </ResponsiveContainer>,
    );

    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper).toHaveClass("custom-class");
  });

  it("should accept different maxWidth variants", () => {
    // Test that the component accepts different maxWidth props without error
    const { rerender } = render(
      <ResponsiveContainer maxWidth="app">
        <div>App width</div>
      </ResponsiveContainer>,
    );
    expect(screen.getByText("App width")).toBeInTheDocument();

    rerender(
      <ResponsiveContainer maxWidth="nav">
        <div>Nav width</div>
      </ResponsiveContainer>,
    );
    expect(screen.getByText("Nav width")).toBeInTheDocument();

    rerender(
      <ResponsiveContainer maxWidth="full">
        <div>Full width</div>
      </ResponsiveContainer>,
    );
    expect(screen.getByText("Full width")).toBeInTheDocument();
  });
});
