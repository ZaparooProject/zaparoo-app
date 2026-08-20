import { describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { render, screen } from "@/test-utils";
import { LibrarySystemFiltersModal } from "@/components/library/LibrarySystemFiltersModal";

function renderModal(
  overrides: Partial<
    React.ComponentProps<typeof LibrarySystemFiltersModal>
  > = {},
) {
  const props: React.ComponentProps<typeof LibrarySystemFiltersModal> = {
    isOpen: true,
    close: vi.fn(),
    manufacturers: ["Nintendo"],
    selectedManufacturer: "",
    onSelectedManufacturerChange: vi.fn(),
    releasePeriod: "any",
    onReleasePeriodChange: vi.fn(),
    sort: "name-asc",
    onSortChange: vi.fn(),
    resultCount: 12,
    onReset: vi.fn(),
    onApply: vi.fn(),
    ...overrides,
  };

  return { ...render(<LibrarySystemFiltersModal {...props} />), props };
}

describe("LibrarySystemFiltersModal", () => {
  it("shows labelled Reset before the primary action", () => {
    renderModal();

    const reset = screen.getByRole("button", {
      name: "library.resetOptions",
    });
    const apply = screen.getByRole("button", {
      name: "library.showSystems",
    });

    expect(reset).toBeDisabled();
    expect(reset).toHaveTextContent("library.resetOptions");
    expect(
      reset.compareDocumentPosition(apply) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("enables and runs Reset when draft filters differ", async () => {
    const user = userEvent.setup();
    const { props } = renderModal({ selectedManufacturer: "Nintendo" });

    await user.click(
      screen.getByRole("button", { name: "library.resetOptions" }),
    );

    expect(props.onReset).toHaveBeenCalledTimes(1);
  });
});
