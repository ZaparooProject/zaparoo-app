import { describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { render, screen } from "@/test-utils";
import { LibraryMediaOptionsModal } from "@/components/library/LibraryMediaOptionsModal";

describe("LibraryMediaOptionsModal", () => {
  it("keeps Go to letter mounted and disables it when unavailable", () => {
    render(
      <LibraryMediaOptionsModal
        isOpen
        close={vi.fn()}
        value="name-asc"
        onChange={vi.fn()}
        canGoToLetter={false}
        onGoToLetter={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("button", { name: "library.goToTitle" }),
    ).toBeDisabled();
  });

  it("runs Go to letter when available", async () => {
    const user = userEvent.setup();
    const onGoToLetter = vi.fn();
    render(
      <LibraryMediaOptionsModal
        isOpen
        close={vi.fn()}
        value="name-asc"
        onChange={vi.fn()}
        canGoToLetter
        onGoToLetter={onGoToLetter}
      />,
    );

    await user.click(screen.getByRole("button", { name: "library.goToTitle" }));
    expect(onGoToLetter).toHaveBeenCalledTimes(1);
  });
});
