import { render, screen } from "../../../test-utils";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { PageFrame } from "@/components/PageFrame";
import { useRef } from "react";

// Mock store for safe insets
vi.mock("@/lib/store", () => ({
  useStatusStore: vi.fn((selector) => {
    const state = {
      safeInsets: { top: "0px", bottom: "0px", left: "0px", right: "0px" },
    };
    return selector ? selector(state) : state;
  }),
}));

// Test component for ref testing
const TestComponentWithRef = () => {
  const scrollRef = useRef<HTMLDivElement>(null);

  return (
    <PageFrame scrollRef={scrollRef}>
      <div>Content with ref</div>
    </PageFrame>
  );
};

describe("PageFrame", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should render children without header", () => {
    render(
      <PageFrame>
        <div>Test content</div>
      </PageFrame>,
    );

    expect(screen.getByText("Test content")).toBeInTheDocument();
  });

  it("should render with custom header", () => {
    const customHeader = <div data-testid="custom-header">Custom Header</div>;

    render(
      <PageFrame header={customHeader}>
        <div>Test content</div>
      </PageFrame>,
    );

    expect(screen.getByTestId("custom-header")).toBeInTheDocument();
    expect(screen.getByText("Custom Header")).toBeInTheDocument();
  });

  it("should render with headerLeft, headerCenter, and headerRight", () => {
    const headerLeft = <div data-testid="header-left">Left</div>;
    const headerCenter = <div data-testid="header-center">Center</div>;
    const headerRight = <div data-testid="header-right">Right</div>;

    render(
      <PageFrame
        headerLeft={headerLeft}
        headerCenter={headerCenter}
        headerRight={headerRight}
      >
        <div>Test content</div>
      </PageFrame>,
    );

    expect(screen.getByTestId("header-left")).toBeInTheDocument();
    expect(screen.getByTestId("header-center")).toBeInTheDocument();
    expect(screen.getByTestId("header-right")).toBeInTheDocument();
    expect(screen.getByText("Left")).toBeInTheDocument();
    expect(screen.getByText("Center")).toBeInTheDocument();
    expect(screen.getByText("Right")).toBeInTheDocument();
  });

  it("should render headerCenter with title styling", () => {
    render(
      <PageFrame
        headerCenter={<h1 className="text-foreground text-xl">Test Title</h1>}
      >
        <div>Test content</div>
      </PageFrame>,
    );

    expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
    expect(screen.getByText("Test Title")).toBeInTheDocument();
  });

  it("should apply custom className", () => {
    const { container } = render(
      <PageFrame className="custom-class">
        <div>Test content</div>
      </PageFrame>,
    );

    const pageFrame = container.firstChild as HTMLElement;
    expect(pageFrame).toHaveClass("custom-class");
    expect(pageFrame).toHaveClass("flex", "h-full", "w-full", "flex-col");
  });

  it("should pass through additional props", () => {
    render(
      <PageFrame data-testid="page-frame" role="main">
        <div>Test content</div>
      </PageFrame>,
    );

    const pageFrame = screen.getByTestId("page-frame");
    expect(pageFrame).toHaveAttribute("role", "main");
  });

  it("should handle scrollRef", () => {
    render(<TestComponentWithRef />);

    expect(screen.getByText("Content with ref")).toBeInTheDocument();
  });

  it("should render only headerLeft", () => {
    const headerLeft = <div data-testid="only-left">Only Left</div>;

    render(
      <PageFrame headerLeft={headerLeft}>
        <div>Test content</div>
      </PageFrame>,
    );

    expect(screen.getByTestId("only-left")).toBeInTheDocument();
  });

  it("should render only headerRight", () => {
    const headerRight = <div data-testid="only-right">Only Right</div>;

    render(
      <PageFrame headerRight={headerRight}>
        <div>Test content</div>
      </PageFrame>,
    );

    expect(screen.getByTestId("only-right")).toBeInTheDocument();
  });

  it("should apply correct styles when header is present", () => {
    const { container } = render(
      <PageFrame
        headerCenter={<h1 className="text-foreground text-xl">Test Title</h1>}
      >
        <div>Test content</div>
      </PageFrame>,
    );

    const scrollContainer = container.querySelector(".flex-1.overflow-y-auto");
    expect(scrollContainer).toBeInTheDocument();
    expect(scrollContainer).toHaveClass("pb-4");
  });

  it("should apply correct styles when header is not present", () => {
    const { container } = render(
      <PageFrame>
        <div>Test content</div>
      </PageFrame>,
    );

    const scrollContainer = container.querySelector(".flex-1.overflow-y-auto");
    expect(scrollContainer).toBeInTheDocument();
    expect(scrollContainer).toHaveClass("pb-4");
  });

  it("should handle empty header components gracefully", () => {
    render(
      <PageFrame headerLeft={null} headerCenter={null} headerRight={null}>
        <div>Test content</div>
      </PageFrame>,
    );

    // When all header props are null, should not render header content
    // but the content should still be visible
    expect(screen.getByText("Test content")).toBeInTheDocument();
  });
});
