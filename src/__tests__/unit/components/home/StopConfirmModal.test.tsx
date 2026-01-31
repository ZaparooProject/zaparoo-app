import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "../../../../test-utils";
import userEvent from "@testing-library/user-event";
import { StopConfirmModal } from "@/components/home/StopConfirmModal";

describe("StopConfirmModal", () => {
  const defaultProps = {
    isOpen: true,
    onClose: vi.fn(),
    onConfirm: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("rendering", () => {
    it("should render modal when open", () => {
      // Arrange & Act
      render(<StopConfirmModal {...defaultProps} isOpen={true} />);

      // Assert - SlideModal renders title twice (mobile + desktop)
      const titles = screen.getAllByText("create.nfc.confirm");
      expect(titles.length).toBeGreaterThan(0);
    });

    it("should hide content via aria-hidden when closed", () => {
      // Arrange & Act
      render(<StopConfirmModal {...defaultProps} isOpen={false} />);

      // Assert - Modal should be hidden
      const dialog = screen.getByRole("dialog", { hidden: true });
      expect(dialog).toHaveAttribute("aria-hidden", "true");
    });

    it("should display confirmation message", () => {
      // Arrange & Act
      render(<StopConfirmModal {...defaultProps} />);

      // Assert
      expect(screen.getByText("stopPlaying")).toBeInTheDocument();
    });

    it("should display cancel and confirm buttons", () => {
      // Arrange & Act
      render(<StopConfirmModal {...defaultProps} />);

      // Assert
      expect(
        screen.getByRole("button", { name: "nav.cancel" }),
      ).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "yes" })).toBeInTheDocument();
    });
  });

  describe("interactions", () => {
    it("should call onClose when cancel button clicked", async () => {
      // Arrange
      const user = userEvent.setup();
      const onClose = vi.fn();
      render(<StopConfirmModal {...defaultProps} onClose={onClose} />);

      // Act
      await user.click(screen.getByRole("button", { name: "nav.cancel" }));

      // Assert
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("should call onConfirm when yes button clicked", async () => {
      // Arrange
      const user = userEvent.setup();
      const onConfirm = vi.fn();
      render(<StopConfirmModal {...defaultProps} onConfirm={onConfirm} />);

      // Act
      await user.click(screen.getByRole("button", { name: "yes" }));

      // Assert
      expect(onConfirm).toHaveBeenCalledTimes(1);
    });

    it("should call onClose when modal drag handle is used", async () => {
      // Arrange
      const user = userEvent.setup();
      const onClose = vi.fn();
      render(<StopConfirmModal {...defaultProps} onClose={onClose} />);

      // Act - Click one of the close buttons (modal has both mobile and desktop variants)
      const closeButtons = screen.getAllByRole("button", { name: "nav.close" });
      expect(closeButtons[0]).toBeDefined();
      await user.click(closeButtons[0]!);

      // Assert
      expect(onClose).toHaveBeenCalled();
    });
  });

  describe("accessibility", () => {
    it("should have dialog role", () => {
      // Arrange & Act
      render(<StopConfirmModal {...defaultProps} />);

      // Assert
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });

    it("should have accessible buttons", () => {
      // Arrange & Act
      render(<StopConfirmModal {...defaultProps} />);

      // Assert - Buttons should be focusable and have accessible names
      const buttons = screen.getAllByRole("button");
      expect(buttons.length).toBeGreaterThanOrEqual(2);
      buttons.forEach((button) => {
        expect(button).toHaveAccessibleName();
      });
    });
  });
});
