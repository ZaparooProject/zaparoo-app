import { render, screen } from "@testing-library/react";
import { ResponsiveContainer } from "@/components/ResponsiveContainer";

describe("ResponsiveContainer", () => {
  it("should render children correctly", () => {
    render(
      <ResponsiveContainer>
        <div>Test Content</div>
      </ResponsiveContainer>
    );

    expect(screen.getByText("Test Content")).toBeInTheDocument();
  });

  it("should apply default app max-width classes", () => {
    const { container } = render(
      <ResponsiveContainer>
        <div>Content</div>
      </ResponsiveContainer>
    );

    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper).toHaveClass("w-full", "sm:max-w-2xl", "sm:mx-auto");
  });

  it("should apply nav max-width classes when specified", () => {
    const { container } = render(
      <ResponsiveContainer maxWidth="nav">
        <div>Content</div>
      </ResponsiveContainer>
    );

    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper).toHaveClass("w-full", "sm:max-w-lg", "sm:mx-auto");
  });

  it("should apply only base width class for full max-width", () => {
    const { container } = render(
      <ResponsiveContainer maxWidth="full">
        <div>Content</div>
      </ResponsiveContainer>
    );

    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper).toHaveClass("w-full");
    expect(wrapper).not.toHaveClass("sm:max-w-2xl", "sm:max-w-lg", "sm:mx-auto");
  });

  it("should merge custom className with default classes", () => {
    const { container } = render(
      <ResponsiveContainer className="custom-class bg-red-500">
        <div>Content</div>
      </ResponsiveContainer>
    );

    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper).toHaveClass("w-full", "sm:max-w-2xl", "sm:mx-auto", "custom-class", "bg-red-500");
  });
});