import { render, screen, fireEvent } from "../../../../test-utils";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { Card } from "../../../../components/wui/Card";

const mockHapticPress = vi.fn();
vi.mock("@/hooks/useHapticPress", () => ({
  useHapticPress: () => mockHapticPress,
}));

describe("Card", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should render children content", () => {
    render(<Card>Test content</Card>);

    expect(screen.getByText("Test content")).toBeInTheDocument();
  });

  it("should handle click events when clickable", () => {
    const mockOnClick = vi.fn();
    render(<Card onClick={mockOnClick}>Clickable content</Card>);

    const card = screen.getByRole("button");
    fireEvent.click(card);

    expect(mockOnClick).toHaveBeenCalledTimes(1);
  });

  it("should provide haptic feedback for a touchscreen press", () => {
    render(<Card onClick={() => {}}>Clickable content</Card>);

    fireEvent.pointerUp(screen.getByRole("button"), {
      pointerType: "touch",
      isPrimary: true,
    });

    expect(mockHapticPress).toHaveBeenCalledTimes(1);
  });

  it("should provide haptic feedback when pressable inside a link", () => {
    render(<Card pressable>Linked card</Card>);

    fireEvent.pointerUp(screen.getByText("Linked card"), {
      pointerType: "touch",
      isPrimary: true,
    });

    expect(mockHapticPress).toHaveBeenCalledTimes(1);
  });

  it("should handle Enter key for keyboard navigation", () => {
    const mockOnClick = vi.fn();
    render(<Card onClick={mockOnClick}>Clickable content</Card>);

    const card = screen.getByRole("button");
    expect(card).toBeInTheDocument();
    expect(card).toHaveAttribute("tabIndex", "0");

    fireEvent.keyDown(card, { key: "Enter" });
    expect(mockOnClick).toHaveBeenCalledTimes(1);
  });

  it("should handle Space key for keyboard navigation", () => {
    const mockOnClick = vi.fn();
    render(<Card onClick={mockOnClick}>Clickable content</Card>);

    const card = screen.getByRole("button");

    fireEvent.keyDown(card, { key: " " });
    expect(mockOnClick).toHaveBeenCalledTimes(1);
  });

  it("should not be clickable without onClick prop", () => {
    render(<Card>Non-clickable content</Card>);

    // Should not have button role when not clickable
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.getByText("Non-clickable content")).toBeInTheDocument();
  });

  it("should not call onClick when disabled", () => {
    const mockOnClick = vi.fn();
    render(
      <Card onClick={mockOnClick} disabled>
        Disabled content
      </Card>,
    );

    const card = screen.getByRole("button");
    fireEvent.click(card);

    expect(mockOnClick).not.toHaveBeenCalled();
    expect(mockHapticPress).not.toHaveBeenCalled();
  });
});
