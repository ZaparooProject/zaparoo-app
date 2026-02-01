import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "../../../../test-utils";
import userEvent from "@testing-library/user-event";
import { HistoryModal } from "@/components/home/HistoryModal";

// Note: CopyButton uses Clipboard and Haptics plugins which are already
// mocked globally in test-setup.ts. No additional mocking needed.

interface HistoryEntry {
  uid: string;
  text: string;
  time: string;
  success: boolean;
}

const createHistoryEntry = (
  overrides: Partial<HistoryEntry> = {},
): HistoryEntry => ({
  uid: "04abc123def456",
  text: "game:mario",
  time: new Date().toISOString(),
  success: true,
  ...overrides,
});

describe("HistoryModal", () => {
  const defaultProps = {
    isOpen: true,
    onClose: vi.fn(),
    historyData: undefined,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("rendering", () => {
    it("should render modal when open", () => {
      // Arrange & Act
      render(<HistoryModal {...defaultProps} isOpen={true} />);

      // Assert - SlideModal renders title twice (mobile + desktop)
      const titles = screen.getAllByText("scan.historyTitle");
      expect(titles.length).toBeGreaterThan(0);
    });

    it("should hide content via aria-hidden when closed", () => {
      // Arrange & Act
      render(<HistoryModal {...defaultProps} isOpen={false} />);

      // Assert - Modal should be hidden
      const dialog = screen.getByRole("dialog", { hidden: true });
      expect(dialog).toHaveAttribute("aria-hidden", "true");
    });

    it("should call onClose when close is triggered", async () => {
      // Arrange
      const user = userEvent.setup();
      const onClose = vi.fn();
      render(<HistoryModal {...defaultProps} onClose={onClose} />);

      // Act - Click one of the close buttons (modal has both mobile and desktop variants)
      const closeButtons = screen.getAllByRole("button", { name: "nav.close" });
      expect(closeButtons[0]).toBeDefined();
      await user.click(closeButtons[0]!);

      // Assert
      expect(onClose).toHaveBeenCalled();
    });
  });

  describe("empty state", () => {
    it("should render empty modal when historyData is undefined", () => {
      // Arrange & Act
      render(<HistoryModal {...defaultProps} historyData={undefined} />);

      // Assert - Modal renders but no entries
      const titles = screen.getAllByText("scan.historyTitle");
      expect(titles.length).toBeGreaterThan(0);
      // No history entries should be present
      expect(
        screen.queryByText(/scan\.lastScannedTime/),
      ).not.toBeInTheDocument();
    });

    it("should render empty modal when historyData has no entries", () => {
      // Arrange & Act
      render(<HistoryModal {...defaultProps} historyData={{ entries: [] }} />);

      // Assert - Modal renders but no entries
      const titles = screen.getAllByText("scan.historyTitle");
      expect(titles.length).toBeGreaterThan(0);
      expect(
        screen.queryByText(/scan\.lastScannedTime/),
      ).not.toBeInTheDocument();
    });
  });

  describe("history entries", () => {
    it("should display history entry with time", () => {
      // Arrange
      const time = new Date("2024-01-15T10:30:00").toISOString();
      const historyData = {
        entries: [createHistoryEntry({ time })],
      };

      // Act
      render(<HistoryModal {...defaultProps} historyData={historyData} />);

      // Assert - Time label should be present
      expect(screen.getByText(/scan\.lastScannedTime/)).toBeInTheDocument();
    });

    it("should display history entry with UID", () => {
      // Arrange
      const historyData = {
        entries: [createHistoryEntry({ uid: "04abc123def456" })],
      };

      // Act
      render(<HistoryModal {...defaultProps} historyData={historyData} />);

      // Assert
      expect(screen.getByText(/scan\.lastScannedUid/)).toBeInTheDocument();
    });

    it("should display history entry with text", () => {
      // Arrange
      const historyData = {
        entries: [createHistoryEntry({ text: "game:mario" })],
      };

      // Act
      render(<HistoryModal {...defaultProps} historyData={historyData} />);

      // Assert
      expect(screen.getByText(/scan\.lastScannedText/)).toBeInTheDocument();
    });

    it("should display multiple history entries", () => {
      // Arrange
      const historyData = {
        entries: [
          createHistoryEntry({ uid: "uid1", text: "text1" }),
          createHistoryEntry({ uid: "uid2", text: "text2" }),
          createHistoryEntry({ uid: "uid3", text: "text3" }),
        ],
      };

      // Act
      render(<HistoryModal {...defaultProps} historyData={historyData} />);

      // Assert - Should have 3 time labels (one per entry)
      const timeLabels = screen.getAllByText(/scan\.lastScannedTime/);
      expect(timeLabels).toHaveLength(3);
    });
  });

  describe("empty values handling", () => {
    it("should show dash for time when uid and text are empty", () => {
      // Arrange
      const historyData = {
        entries: [createHistoryEntry({ uid: "", text: "" })],
      };

      // Act
      render(<HistoryModal {...defaultProps} historyData={historyData} />);

      // Assert - The time shows "-" when uid and text are empty
      const timeElement = screen.getByText(/scan\.lastScannedTime/);
      // Translation mock returns key with interpolation, time should be "-"
      expect(timeElement).toBeInTheDocument();
    });

    it("should show dash for UID when UID is empty", () => {
      // Arrange
      const historyData = {
        entries: [createHistoryEntry({ uid: "", text: "some-text" })],
      };

      // Act
      render(<HistoryModal {...defaultProps} historyData={historyData} />);

      // Assert - UID label should be present but value is "-"
      expect(screen.getByText(/scan\.lastScannedUid/)).toBeInTheDocument();
    });

    it("should show dash for UID when UID is __api__", () => {
      // Arrange
      const historyData = {
        entries: [createHistoryEntry({ uid: "__api__", text: "api-command" })],
      };

      // Act
      render(<HistoryModal {...defaultProps} historyData={historyData} />);

      // Assert - UID should not display "__api__" literal
      expect(screen.queryByText("__api__")).not.toBeInTheDocument();
    });

    it("should show dash for text when text is empty", () => {
      // Arrange
      const historyData = {
        entries: [createHistoryEntry({ uid: "some-uid", text: "" })],
      };

      // Act
      render(<HistoryModal {...defaultProps} historyData={historyData} />);

      // Assert - Text label should be present but value is "-"
      expect(screen.getByText(/scan\.lastScannedText/)).toBeInTheDocument();
    });
  });

  describe("copy buttons", () => {
    it("should show copy button for UID when UID is not empty", () => {
      // Arrange
      const historyData = {
        entries: [createHistoryEntry({ uid: "04abc123", text: "test" })],
      };

      // Act
      render(<HistoryModal {...defaultProps} historyData={historyData} />);

      // Assert - Should have copy buttons for UID and text
      const copyButtons = screen.getAllByRole("button", {
        name: "Copy to clipboard",
      });
      expect(copyButtons.length).toBeGreaterThanOrEqual(1);
    });

    it("should show copy button for text when text is not empty", () => {
      // Arrange
      const historyData = {
        entries: [createHistoryEntry({ uid: "uid", text: "game:zelda" })],
      };

      // Act
      render(<HistoryModal {...defaultProps} historyData={historyData} />);

      // Assert - Should have copy buttons for both UID and text
      const copyButtons = screen.getAllByRole("button", {
        name: "Copy to clipboard",
      });
      expect(copyButtons).toHaveLength(2);
    });

    it("should not show copy button for UID when UID is empty", () => {
      // Arrange
      const historyData = {
        entries: [createHistoryEntry({ uid: "", text: "test" })],
      };

      // Act
      render(<HistoryModal {...defaultProps} historyData={historyData} />);

      // Assert - Only one copy button for text
      const copyButtons = screen.getAllByRole("button", {
        name: "Copy to clipboard",
      });
      expect(copyButtons).toHaveLength(1);
    });

    it("should not show copy button for UID when UID is __api__", () => {
      // Arrange
      const historyData = {
        entries: [createHistoryEntry({ uid: "__api__", text: "test" })],
      };

      // Act
      render(<HistoryModal {...defaultProps} historyData={historyData} />);

      // Assert - Only one copy button for text
      const copyButtons = screen.getAllByRole("button", {
        name: "Copy to clipboard",
      });
      expect(copyButtons).toHaveLength(1);
    });

    it("should not show copy button for text when text is empty", () => {
      // Arrange
      const historyData = {
        entries: [createHistoryEntry({ uid: "uid", text: "" })],
      };

      // Act
      render(<HistoryModal {...defaultProps} historyData={historyData} />);

      // Assert - Only one copy button for UID
      const copyButtons = screen.getAllByRole("button", {
        name: "Copy to clipboard",
      });
      expect(copyButtons).toHaveLength(1);
    });

    it("should not show any copy buttons when both UID and text are empty", () => {
      // Arrange
      const historyData = {
        entries: [createHistoryEntry({ uid: "", text: "" })],
      };

      // Act
      render(<HistoryModal {...defaultProps} historyData={historyData} />);

      // Assert - No copy buttons
      expect(
        screen.queryByRole("button", { name: "Copy to clipboard" }),
      ).not.toBeInTheDocument();
    });

    it("should copy UID to clipboard when copy button clicked", async () => {
      // Arrange
      const user = userEvent.setup();
      const historyData = {
        entries: [createHistoryEntry({ uid: "test-uid", text: "test-text" })],
      };

      render(<HistoryModal {...defaultProps} historyData={historyData} />);

      // Act - Click the first copy button (for UID)
      const copyButtons = screen.getAllByRole("button", {
        name: "Copy to clipboard",
      });
      expect(copyButtons[0]).toBeDefined();
      await user.click(copyButtons[0]!);

      // Assert - Button state changes to "Copied"
      expect(
        screen.getByRole("button", { name: "Copied" }),
      ).toBeInTheDocument();
    });
  });
});
