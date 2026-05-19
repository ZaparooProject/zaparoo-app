import { render, screen } from "../../../../test-utils";
import { describe, it, expect } from "vitest";
import { EmptyState } from "../../../../components/wui/EmptyState";

// The render wrapper from test-utils mounts a react-hot-toast Toaster which
// includes its own `role="status"` announcer. We locate the EmptyState wrapper
// by walking up from its title text rather than querying for the status role
// directly.
const wrapperOf = (title: string): HTMLElement => {
  const el = screen.getByText(title).closest('[role="status"]');
  if (!(el instanceof HTMLElement)) {
    throw new Error(`No status wrapper found for title "${title}"`);
  }
  return el;
};

describe("EmptyState", () => {
  it("renders the title", () => {
    render(<EmptyState title="Nothing here" />);
    expect(screen.getByText("Nothing here")).toBeInTheDocument();
  });

  it("wraps content in an element with role=status", () => {
    render(<EmptyState title="Nothing here" />);
    expect(wrapperOf("Nothing here")).toBeInTheDocument();
  });

  it("renders a description below the title when provided", () => {
    render(
      <EmptyState title="No items" description="Try adjusting your filters" />,
    );
    expect(screen.getByText("No items")).toBeInTheDocument();
    expect(screen.getByText("Try adjusting your filters")).toBeInTheDocument();
  });

  it("renders an icon when provided", () => {
    render(
      <EmptyState
        icon={<span data-testid="empty-icon">★</span>}
        title="Empty"
      />,
    );
    expect(screen.getByTestId("empty-icon")).toBeInTheDocument();
  });

  it("renders an action slot when provided", () => {
    render(
      <EmptyState
        title="Empty"
        action={<button data-testid="empty-action">Do thing</button>}
      />,
    );
    expect(screen.getByTestId("empty-action")).toBeInTheDocument();
  });

  it("applies the className prop to the wrapper", () => {
    render(<EmptyState title="Empty" className="h-32" />);
    expect(wrapperOf("Empty")).toHaveClass("h-32");
  });

  it("uses compact padding when size is compact", () => {
    render(<EmptyState title="Empty" size="compact" />);
    expect(wrapperOf("Empty")).toHaveClass("py-4");
  });

  it("uses default padding when size is default", () => {
    render(<EmptyState title="Empty" />);
    expect(wrapperOf("Empty")).toHaveClass("py-8");
  });

  it("uses muted styling when title is the only content", () => {
    render(<EmptyState title="Lonely" />);
    expect(screen.getByText("Lonely")).toHaveClass("text-muted-foreground");
  });

  it("uses prominent styling when a description is provided", () => {
    render(<EmptyState title="Top" description="Hint" />);
    const title = screen.getByText("Top");
    expect(title).toHaveClass("text-foreground");
    expect(title).toHaveClass("font-medium");
  });
});
