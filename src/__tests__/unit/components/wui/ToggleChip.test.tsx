import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "../../../../test-utils";
import userEvent from "@testing-library/user-event";
import { ToggleChip } from "@/components/wui/ToggleChip";
import { Haptics } from "@capacitor/haptics";
import { Capacitor } from "@capacitor/core";

describe("ToggleChip", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    // Reset platform mock to default (web)
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(false);
  });

  describe("rendering", () => {
    it("should render with label", () => {
      // Arrange & Act
      const setState = vi.fn();
      render(<ToggleChip label="Filter" state={false} setState={setState} />);

      // Assert
      expect(
        screen.getByRole("button", { name: "Filter" }),
      ).toBeInTheDocument();
    });

    it("should render with icon only", () => {
      // Arrange & Act
      const setState = vi.fn();
      render(
        <ToggleChip
          icon={<span data-testid="icon">★</span>}
          state={false}
          setState={setState}
          aria-label="Favorite"
        />,
      );

      // Assert
      expect(
        screen.getByRole("button", { name: "Favorite" }),
      ).toBeInTheDocument();
      expect(screen.getByTestId("icon")).toBeInTheDocument();
    });

    it("should render with both icon and label", () => {
      // Arrange & Act
      const setState = vi.fn();
      render(
        <ToggleChip
          label="Sort"
          icon={<span data-testid="sort-icon">↑</span>}
          state={false}
          setState={setState}
        />,
      );

      // Assert
      expect(screen.getByRole("button", { name: "Sort" })).toBeInTheDocument();
      expect(screen.getByTestId("sort-icon")).toBeInTheDocument();
    });
  });

  describe("toggle behavior", () => {
    it("should toggle state from false to true when clicked", async () => {
      // Arrange
      const user = userEvent.setup();
      const setState = vi.fn();
      render(<ToggleChip label="Toggle" state={false} setState={setState} />);

      // Act
      await user.click(screen.getByRole("button", { name: "Toggle" }));

      // Assert
      expect(setState).toHaveBeenCalledWith(true);
    });

    it("should toggle state from true to false when clicked", async () => {
      // Arrange
      const user = userEvent.setup();
      const setState = vi.fn();
      render(<ToggleChip label="Toggle" state={true} setState={setState} />);

      // Act
      await user.click(screen.getByRole("button", { name: "Toggle" }));

      // Assert
      expect(setState).toHaveBeenCalledWith(false);
    });

    it("should trigger haptic feedback when clicked on native platform", async () => {
      // Arrange - Mock native platform for haptics to work
      vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);
      const user = userEvent.setup();
      const setState = vi.fn();
      render(<ToggleChip label="Haptic" state={false} setState={setState} />);

      // Act
      await user.click(screen.getByRole("button", { name: "Haptic" }));

      // Assert
      expect(Haptics.impact).toHaveBeenCalled();
    });
  });

  describe("disabled state", () => {
    it("should not toggle state when disabled", async () => {
      // Arrange
      const user = userEvent.setup();
      const setState = vi.fn();
      render(
        <ToggleChip
          label="Disabled"
          state={false}
          setState={setState}
          disabled
        />,
      );

      // Act
      await user.click(screen.getByRole("button", { name: "Disabled" }));

      // Assert
      expect(setState).not.toHaveBeenCalled();
    });

    it("should not trigger haptic feedback when disabled", async () => {
      // Arrange
      const user = userEvent.setup();
      const setState = vi.fn();
      render(
        <ToggleChip
          label="Disabled"
          state={false}
          setState={setState}
          disabled
        />,
      );

      // Act
      await user.click(screen.getByRole("button", { name: "Disabled" }));

      // Assert
      expect(Haptics.impact).not.toHaveBeenCalled();
    });
  });

  describe("accessibility", () => {
    it("should have aria-pressed false when state is false", () => {
      // Arrange & Act
      const setState = vi.fn();
      render(<ToggleChip label="Off" state={false} setState={setState} />);

      // Assert
      expect(screen.getByRole("button", { name: "Off" })).toHaveAttribute(
        "aria-pressed",
        "false",
      );
    });

    it("should have aria-pressed true when state is true", () => {
      // Arrange & Act
      const setState = vi.fn();
      render(<ToggleChip label="On" state={true} setState={setState} />);

      // Assert
      expect(screen.getByRole("button", { name: "On" })).toHaveAttribute(
        "aria-pressed",
        "true",
      );
    });

    it("should use aria-label when provided instead of label", () => {
      // Arrange & Act
      const setState = vi.fn();
      render(
        <ToggleChip
          label="X"
          state={false}
          setState={setState}
          aria-label="Close filter"
        />,
      );

      // Assert
      expect(
        screen.getByRole("button", { name: "Close filter" }),
      ).toBeInTheDocument();
    });

    it("should use label as aria-label fallback when no explicit aria-label", () => {
      // Arrange & Act
      const setState = vi.fn();
      render(<ToggleChip label="Category" state={false} setState={setState} />);

      // Assert
      const button = screen.getByRole("button", { name: "Category" });
      expect(button).toHaveAttribute("aria-label", "Category");
    });
  });

  describe("compact mode", () => {
    it("should render in compact mode", () => {
      // Arrange & Act
      const setState = vi.fn();
      render(
        <ToggleChip
          label="Compact"
          state={false}
          setState={setState}
          compact
        />,
      );

      // Assert - Component renders without error
      expect(
        screen.getByRole("button", { name: "Compact" }),
      ).toBeInTheDocument();
    });
  });
});
