import { render, screen, within } from "../../../../test-utils";
import { describe, expect, it } from "vitest";
import { ModalActionRail } from "@/components/wui/ModalActionRail";
import { Button } from "@/components/wui/Button";

function renderRail() {
  return render(
    <ModalActionRail
      aria-label="Media actions"
      actions={
        <>
          <Button label="Favorite" icon={<span>heart</span>} />
          <Button label="Write" icon={<span>NFC</span>} />
        </>
      }
      primaryAction={<Button label="Launch" />}
    />,
  );
}

describe("ModalActionRail", () => {
  it("groups direct actions separately from the primary action", () => {
    renderRail();

    const actions = screen.getByRole("group", { name: "Media actions" });
    expect(
      within(actions).getByRole("button", { name: "Favorite" }),
    ).toBeVisible();
    expect(
      within(actions).getByRole("button", { name: "Write" }),
    ).toBeVisible();
    expect(
      within(actions).queryByRole("button", { name: "Launch" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Launch" })).toBeVisible();
  });

  it("keeps larger action sets directly available", () => {
    render(
      <ModalActionRail
        aria-label="Media actions"
        actions={Array.from({ length: 7 }, (_, index) => (
          <Button key={index} label={`Action ${index + 1}`} />
        ))}
        primaryAction={<Button label="Launch" />}
      />,
    );

    const actions = screen.getByRole("group", { name: "Media actions" });
    expect(within(actions).getAllByRole("button")).toHaveLength(7);
  });

  it("preserves secondary-to-primary focus order", () => {
    renderRail();

    const favorite = screen.getByRole("button", { name: "Favorite" });
    const write = screen.getByRole("button", { name: "Write" });
    const launch = screen.getByRole("button", { name: "Launch" });

    expect(
      favorite.compareDocumentPosition(write) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      write.compareDocumentPosition(launch) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });
});
