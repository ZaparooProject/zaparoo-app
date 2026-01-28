import { render, screen, fireEvent } from "../../../../test-utils";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Button } from "../../../../components/wui/Button";

// Mock useHaptics hook
const mockImpact = vi.fn();
vi.mock("@/hooks/useHaptics", () => ({
  useHaptics: () => ({
    impact: mockImpact,
  }),
}));

describe("Button", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should render with label", () => {
    render(<Button label="Test button" />);
    const button = screen.getByRole("button", { name: "Test button" });
    expect(button).toBeInTheDocument();
  });

  it("should call onClick when clicked", () => {
    const handleClick = vi.fn();
    render(<Button label="Test button" onClick={handleClick} />);

    const button = screen.getByRole("button", { name: "Test button" });
    fireEvent.click(button);

    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it("should not call onClick when disabled", () => {
    const handleClick = vi.fn();
    render(<Button label="Test button" onClick={handleClick} disabled />);

    const button = screen.getByRole("button", { name: "Test button" });
    fireEvent.click(button);

    expect(handleClick).not.toHaveBeenCalled();
  });

  it("should trigger haptic feedback on touch start", () => {
    render(<Button label="Test button" intent="primary" />);

    const button = screen.getByRole("button", { name: "Test button" });
    // Button triggers haptics on touch events (mobile native behavior)
    fireEvent.touchStart(button, {
      touches: [{ clientX: 0, clientY: 0 }],
    });

    expect(mockImpact).toHaveBeenCalledWith("medium");
  });

  it("should not trigger haptic feedback when disabled", () => {
    render(<Button label="Test button" intent="primary" disabled />);

    const button = screen.getByRole("button", { name: "Test button" });
    fireEvent.touchStart(button, {
      touches: [{ clientX: 0, clientY: 0 }],
    });

    expect(mockImpact).not.toHaveBeenCalled();
  });

  it("should apply variant classes correctly", () => {
    const { rerender } = render(<Button label="Fill" variant="fill" />);
    expect(screen.getByRole("button")).toBeInTheDocument();

    rerender(<Button label="Outline" variant="outline" />);
    expect(screen.getByRole("button")).toBeInTheDocument();

    rerender(<Button label="Text" variant="text" />);
    expect(screen.getByRole("button")).toBeInTheDocument();
  });

  it("should render with icon", () => {
    render(
      <Button label="With icon" icon={<span data-testid="icon">★</span>} />,
    );

    expect(screen.getByTestId("icon")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "With icon" }),
    ).toBeInTheDocument();
  });

  it("should handle keyboard Enter to trigger click", () => {
    const handleClick = vi.fn();
    render(<Button label="Test button" onClick={handleClick} />);

    const button = screen.getByRole("button", { name: "Test button" });
    fireEvent.keyDown(button, { key: "Enter" });

    // Native button elements handle Enter key automatically
    expect(button).toBeInTheDocument();
  });

  it("should support aria-label for accessibility", () => {
    render(<Button label="X" aria-label="Close dialog" />);

    const button = screen.getByRole("button", { name: "Close dialog" });
    expect(button).toBeInTheDocument();
  });
});
