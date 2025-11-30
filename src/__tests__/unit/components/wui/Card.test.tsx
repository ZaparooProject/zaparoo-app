import { render, screen } from "../../../../test-utils";
import { describe, it, expect, vi } from "vitest";
import { Card } from "../../../../components/wui/Card";
import { fireEvent } from "@testing-library/react";

describe("Card", () => {
  it("should render children content", () => {
    render(<Card>Test content</Card>);

    expect(screen.getByText("Test content")).toBeInTheDocument();
  });

  it("should handle keyboard navigation when clickable", () => {
    const mockOnClick = vi.fn();
    render(<Card onClick={mockOnClick}>Clickable content</Card>);

    const card = screen.getByRole("button");
    expect(card).toBeInTheDocument();
    expect(card).toHaveAttribute("tabIndex", "0");

    fireEvent.keyDown(card, { key: "Enter" });
    expect(mockOnClick).toHaveBeenCalledTimes(1);
  });
});
