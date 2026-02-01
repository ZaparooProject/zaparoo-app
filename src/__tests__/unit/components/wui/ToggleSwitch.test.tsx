import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "../../../../test-utils";
import { ToggleSwitch } from "@/components/wui/ToggleSwitch";

// Mock useHaptics hook
const mockImpact = vi.fn();
vi.mock("@/hooks/useHaptics", () => ({
  useHaptics: () => ({
    impact: mockImpact,
  }),
}));

describe("ToggleSwitch", () => {
  const mockSetValue = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders with label", () => {
    render(
      <ToggleSwitch label="Test Label" value={false} setValue={mockSetValue} />,
    );

    expect(screen.getByText("Test Label")).toBeInTheDocument();
  });

  it("renders checked when value is true", () => {
    render(
      <ToggleSwitch label="Test Label" value={true} setValue={mockSetValue} />,
    );

    const checkbox = screen.getByRole("checkbox");
    expect(checkbox).toBeChecked();
  });

  it("renders unchecked when value is false", () => {
    render(
      <ToggleSwitch label="Test Label" value={false} setValue={mockSetValue} />,
    );

    const checkbox = screen.getByRole("checkbox");
    expect(checkbox).not.toBeChecked();
  });

  it("calls setValue when checkbox is clicked", () => {
    render(
      <ToggleSwitch label="Test Label" value={false} setValue={mockSetValue} />,
    );

    const checkbox = screen.getByRole("checkbox");
    fireEvent.click(checkbox);

    expect(mockSetValue).toHaveBeenCalledWith(true);
  });

  it("triggers haptic feedback when toggled", () => {
    render(
      <ToggleSwitch label="Test Label" value={false} setValue={mockSetValue} />,
    );

    const checkbox = screen.getByRole("checkbox");
    fireEvent.click(checkbox);

    expect(mockImpact).toHaveBeenCalledWith("medium");
  });

  it("should be fully disabled when disabled prop is true", () => {
    render(
      <ToggleSwitch
        label="Test Label"
        value={false}
        setValue={mockSetValue}
        disabled={true}
      />,
    );

    const checkbox = screen.getByRole("checkbox");

    // Checkbox should have disabled attribute
    expect(checkbox).toBeDisabled();

    // Clicking disabled checkbox should not trigger any callbacks
    fireEvent.click(checkbox);
    expect(mockSetValue).not.toHaveBeenCalled();
    expect(mockImpact).not.toHaveBeenCalled();
  });

  it("renders suffix after label", () => {
    render(
      <ToggleSwitch
        label="Test Label"
        value={false}
        setValue={mockSetValue}
        suffix={<span data-testid="suffix">Pro</span>}
      />,
    );

    expect(screen.getByTestId("suffix")).toBeInTheDocument();
  });

  it("shows skeleton when loading", () => {
    render(
      <ToggleSwitch
        label="Test Label"
        value={false}
        setValue={mockSetValue}
        loading={true}
      />,
    );

    // Skeleton should be present, checkbox should not
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });

  it("shows toggle when not loading", () => {
    render(
      <ToggleSwitch
        label="Test Label"
        value={false}
        setValue={mockSetValue}
        loading={false}
      />,
    );

    expect(screen.getByRole("checkbox")).toBeInTheDocument();
  });

  it("calls onDisabledClick when disabled and container clicked", () => {
    const mockOnDisabledClick = vi.fn();
    render(
      <ToggleSwitch
        label="Test Label"
        value={false}
        setValue={mockSetValue}
        disabled={true}
        onDisabledClick={mockOnDisabledClick}
      />,
    );

    // Find the container with button role
    const button = screen.getByRole("button");
    fireEvent.click(button);

    expect(mockOnDisabledClick).toHaveBeenCalled();
  });

  it("handles keyboard Enter for onDisabledClick", () => {
    const mockOnDisabledClick = vi.fn();
    render(
      <ToggleSwitch
        label="Test Label"
        value={false}
        setValue={mockSetValue}
        disabled={true}
        onDisabledClick={mockOnDisabledClick}
      />,
    );

    const button = screen.getByRole("button");
    fireEvent.keyDown(button, { key: "Enter" });

    expect(mockOnDisabledClick).toHaveBeenCalled();
  });

  it("handles keyboard Space for onDisabledClick", () => {
    const mockOnDisabledClick = vi.fn();
    render(
      <ToggleSwitch
        label="Test Label"
        value={false}
        setValue={mockSetValue}
        disabled={true}
        onDisabledClick={mockOnDisabledClick}
      />,
    );

    const button = screen.getByRole("button");
    fireEvent.keyDown(button, { key: " " });

    expect(mockOnDisabledClick).toHaveBeenCalled();
  });

  it("does not have button role when no onDisabledClick", () => {
    render(
      <ToggleSwitch
        label="Test Label"
        value={false}
        setValue={mockSetValue}
        disabled={true}
      />,
    );

    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("renders ReactNode as label", () => {
    render(
      <ToggleSwitch
        label={<span data-testid="custom-label">Custom Label</span>}
        value={false}
        setValue={mockSetValue}
      />,
    );

    expect(screen.getByTestId("custom-label")).toBeInTheDocument();
  });

  it("has proper accessibility - checkbox is present", () => {
    render(
      <ToggleSwitch label="Test Label" value={false} setValue={mockSetValue} />,
    );

    const checkbox = screen.getByRole("checkbox");
    expect(checkbox).toBeInTheDocument();
  });

  it("handles undefined value gracefully", () => {
    render(
      <ToggleSwitch
        label="Test Label"
        value={undefined}
        setValue={mockSetValue}
      />,
    );

    const checkbox = screen.getByRole("checkbox");
    expect(checkbox).not.toBeChecked();
  });
});
