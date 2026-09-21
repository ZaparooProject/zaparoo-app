import { describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { fireEvent, render, screen } from "@/test-utils";
import { CircleButton } from "@/components/wui/CircleButton";

describe("CircleButton", () => {
  it("exposes its accessible name and material variant", () => {
    render(
      <CircleButton
        icon={<span>🔑</span>}
        variant="secondary"
        aria-label="Pair"
      />,
    );

    expect(screen.getByRole("button", { name: "Pair" })).toHaveAttribute(
      "data-variant",
      "secondary",
    );
  });

  it("fires its action and reports tactile press state", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <CircleButton
        icon={<span>🔑</span>}
        aria-label="Pair"
        onClick={onClick}
      />,
    );

    const button = screen.getByRole("button", { name: "Pair" });
    fireEvent.mouseDown(button);
    expect(button).toHaveAttribute("data-pressed", "true");
    fireEvent.mouseUp(button);

    await user.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("does not fire while disabled", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <CircleButton
        icon={<span>🔑</span>}
        aria-label="Pair"
        onClick={onClick}
        disabled
      />,
    );

    await user.click(screen.getByRole("button", { name: "Pair" }));
    expect(onClick).not.toHaveBeenCalled();
  });
});
