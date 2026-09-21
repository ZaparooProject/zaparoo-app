import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { HeaderOverflowMenu } from "@/components/HeaderOverflowMenu";
import { findA11yViolations, render, screen } from "@/test-utils";

const actions = [
  {
    id: "copy",
    label: "Copy",
    icon: <span>C</span>,
    onClick: vi.fn(),
  },
  {
    id: "download",
    label: "Download",
    icon: <span>D</span>,
    onClick: vi.fn(),
  },
];

describe("HeaderOverflowMenu", () => {
  it("keeps secondary actions in a labeled modal", async () => {
    const user = userEvent.setup();
    render(<HeaderOverflowMenu actions={actions} />);

    const trigger = screen.getByRole("button", { name: "nav.moreActions" });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(
      screen.queryByRole("button", { name: "Copy" }),
    ).not.toBeInTheDocument();

    await user.click(trigger);

    expect(
      screen.getByRole("dialog", { name: "nav.moreActions" }),
    ).toBeInTheDocument();
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("button", { name: "Copy" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Download" }),
    ).toBeInTheDocument();
  });

  it("closes before running a selected action", async () => {
    const user = userEvent.setup();
    const copy = vi.fn();
    render(
      <HeaderOverflowMenu actions={[{ ...actions[0]!, onClick: copy }]} />,
    );

    await user.click(screen.getByRole("button", { name: "nav.moreActions" }));
    await user.click(screen.getByRole("button", { name: "Copy" }));

    expect(copy).toHaveBeenCalledOnce();
    expect(
      screen.queryByRole("dialog", { name: "nav.moreActions" }),
    ).not.toBeInTheDocument();
  });

  it("has no detectable accessibility violations while open", async () => {
    const user = userEvent.setup();
    const { baseElement } = render(<HeaderOverflowMenu actions={actions} />);

    await user.click(screen.getByRole("button", { name: "nav.moreActions" }));

    expect(await findA11yViolations(baseElement)).toEqual([]);
  });
});
