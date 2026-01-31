import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "../../../test-utils";
import userEvent from "@testing-library/user-event";
import { ConfirmClearModal } from "@/components/ConfirmClearModal";

describe("ConfirmClearModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("rendering", () => {
    it("should render modal when open", () => {
      // Arrange & Act
      render(
        <ConfirmClearModal isOpen={true} close={vi.fn()} onConfirm={vi.fn()} />,
      );

      // Assert - Modal should be visible (not aria-hidden)
      const dialog = screen.getByRole("dialog");
      expect(dialog).toHaveAttribute("aria-hidden", "false");
      // SlideModal renders title twice (mobile + desktop), so use getAllByText
      const titles = screen.getAllByText("create.custom.clearConfirmTitle");
      expect(titles.length).toBeGreaterThan(0);
    });

    it("should hide content when closed via aria-hidden", () => {
      // Arrange & Act
      render(
        <ConfirmClearModal
          isOpen={false}
          close={vi.fn()}
          onConfirm={vi.fn()}
        />,
      );

      // Assert - Modal should be hidden (aria-hidden="true")
      const dialog = screen.getByRole("dialog", { hidden: true });
      expect(dialog).toHaveAttribute("aria-hidden", "true");
    });

    it("should show cancel and clear buttons when open", () => {
      // Arrange & Act
      render(
        <ConfirmClearModal isOpen={true} close={vi.fn()} onConfirm={vi.fn()} />,
      );

      // Assert - Button labels are translation keys
      expect(
        screen.getByRole("button", { name: "nav.cancel" }),
      ).toBeInTheDocument();
      // Find clear button by its specific aria-label (not the button text)
      expect(screen.getByLabelText("create.custom.clear")).toBeInTheDocument();
    });
  });

  describe("interactions", () => {
    it("should call close when cancel button is clicked", async () => {
      // Arrange
      const user = userEvent.setup();
      const close = vi.fn();
      const onConfirm = vi.fn();
      render(
        <ConfirmClearModal isOpen={true} close={close} onConfirm={onConfirm} />,
      );

      // Act
      await user.click(screen.getByRole("button", { name: "nav.cancel" }));

      // Assert
      expect(close).toHaveBeenCalledTimes(1);
      expect(onConfirm).not.toHaveBeenCalled();
    });

    it("should call both onConfirm and close when clear button is clicked", async () => {
      // Arrange
      const user = userEvent.setup();
      const close = vi.fn();
      const onConfirm = vi.fn();
      render(
        <ConfirmClearModal isOpen={true} close={close} onConfirm={onConfirm} />,
      );

      // Act - use aria-label to find the clear button specifically
      await user.click(screen.getByLabelText("create.custom.clear"));

      // Assert
      expect(onConfirm).toHaveBeenCalledTimes(1);
      expect(close).toHaveBeenCalledTimes(1);
    });

    it("should call onConfirm before close when clearing", async () => {
      // Arrange
      const user = userEvent.setup();
      const callOrder: string[] = [];
      const close = vi.fn(() => callOrder.push("close"));
      const onConfirm = vi.fn(() => callOrder.push("confirm"));
      render(
        <ConfirmClearModal isOpen={true} close={close} onConfirm={onConfirm} />,
      );

      // Act - use aria-label to find the clear button specifically
      await user.click(screen.getByLabelText("create.custom.clear"));

      // Assert - confirm should be called before close
      expect(callOrder).toEqual(["confirm", "close"]);
    });
  });

  describe("accessibility", () => {
    it("should have accessible buttons", () => {
      // Arrange & Act
      render(
        <ConfirmClearModal isOpen={true} close={vi.fn()} onConfirm={vi.fn()} />,
      );

      // Assert - Buttons should be accessible
      const cancelButton = screen.getByRole("button", { name: "nav.cancel" });
      const clearButton = screen.getByLabelText("create.custom.clear");

      expect(cancelButton).toBeEnabled();
      expect(clearButton).toBeEnabled();
    });
  });
});
