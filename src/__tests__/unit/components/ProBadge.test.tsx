import { render, screen } from "../../../test-utils";
import { describe, it, expect, vi, beforeEach } from "vitest";
import userEvent from "@testing-library/user-event";
import { ProBadge } from "@/components/ProBadge";

describe("ProBadge", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return null when show is false", () => {
    render(<ProBadge show={false} />);
    // Component returns null, so no badge text should be present
    expect(
      screen.queryByText("settings.app.proFeature"),
    ).not.toBeInTheDocument();
  });

  it("should render badge text when show is true (default)", () => {
    render(<ProBadge />);
    expect(screen.getByText("settings.app.proFeature")).toBeInTheDocument();
  });

  it("should not be interactive when no onPress provided", () => {
    render(<ProBadge />);
    // When no onPress, badge should not be a button (not interactive)
    expect(screen.getByText("settings.app.proFeature")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("should render as button when onPress is provided", () => {
    const onPress = vi.fn();
    render(<ProBadge onPress={onPress} />);
    expect(screen.getByRole("button")).toBeInTheDocument();
  });

  it("should call onPress when clicked", async () => {
    const user = userEvent.setup();
    const onPress = vi.fn();
    render(<ProBadge onPress={onPress} />);

    await user.click(screen.getByRole("button"));

    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it("should prevent event propagation on click", async () => {
    const user = userEvent.setup();
    const onPress = vi.fn();
    const parentClick = vi.fn();

    render(
      <div onClick={parentClick}>
        <ProBadge onPress={onPress} />
      </div>,
    );

    await user.click(screen.getByRole("button"));

    expect(onPress).toHaveBeenCalledTimes(1);
    expect(parentClick).not.toHaveBeenCalled();
  });
});
