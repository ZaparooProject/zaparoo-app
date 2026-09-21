import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "../../../../test-utils";
import userEvent from "@testing-library/user-event";
import { HistoryModal } from "@/components/home/HistoryModal";
import { CoreAPI } from "@/lib/coreApi";
import { useStatusStore } from "@/lib/store";

// Note: CopyButton uses Clipboard and Haptics plugins which are already
// mocked globally in test-setup.ts. No additional mocking needed.

interface HistoryEntry {
  type: string;
  uid: string;
  text: string;
  data: string;
  time: string;
  success: boolean;
}

const createHistoryEntry = (
  overrides: Partial<HistoryEntry> = {},
): HistoryEntry => ({
  type: "nfc",
  uid: "04abc123def456",
  text: "game:mario",
  data: "",
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
    vi.spyOn(CoreAPI, "run").mockResolvedValue(undefined);
    vi.spyOn(CoreAPI, "mediaHistory").mockResolvedValue({ entries: [] });
    useStatusStore.setState({
      connected: true,
      coreVersion: "2.17.0",
      coreVersionPending: false,
    });
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

    it("should expose semantic tabs with matching panels", async () => {
      const user = userEvent.setup();
      render(<HistoryModal {...defaultProps} historyData={{ entries: [] }} />);

      const scansTab = screen.getByRole("tab", {
        name: "scan.historyTabScans",
      });
      const playedTab = screen.getByRole("tab", {
        name: "scan.historyTabPlayed",
      });
      expect(scansTab).toHaveAttribute("aria-selected", "true");

      await user.click(playedTab);

      expect(playedTab).toHaveAttribute("aria-selected", "true");
      expect(screen.getByRole("tabpanel")).toHaveAttribute(
        "aria-labelledby",
        "history-played",
      );
    });

    it("should use the same ghost Play action for played media", async () => {
      const user = userEvent.setup();
      vi.mocked(CoreAPI.mediaHistory).mockResolvedValue({
        entries: [
          {
            systemId: "SNES",
            systemName: "Super Nintendo",
            mediaName: "Super Mario World",
            mediaPath: "/games/mario.sfc",
            startedAt: "2026-09-21T10:30:00.000Z",
            playTime: 120,
          },
          {
            systemId: "SNES",
            systemName: "Super Nintendo",
            mediaName: "Super Mario World",
            mediaPath: "/games/mario.sfc",
            startedAt: "2026-09-20T08:00:00.000Z",
            playTime: 90,
          },
        ],
      });
      render(<HistoryModal {...defaultProps} historyData={{ entries: [] }} />);

      await user.click(
        screen.getByRole("tab", { name: "scan.historyTabPlayed" }),
      );

      const playButton = await screen.findByRole("button", {
        name: "scan.coverRowLaunch",
      });
      expect(playButton).toHaveAttribute("data-variant", "ghost");
      expect(screen.getAllByText("Super Mario World")).toHaveLength(1);
      expect(CoreAPI.mediaHistory).toHaveBeenCalledWith(
        { limit: 50, distinctMedia: true },
        expect.any(AbortSignal),
      );
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
      const time = new Date("2024-01-15T10:30:00").toISOString();
      const historyData = {
        entries: [createHistoryEntry({ time })],
      };

      render(<HistoryModal {...defaultProps} historyData={historyData} />);

      expect(
        screen.getByText(new Date(time).toLocaleString()),
      ).toBeInTheDocument();
    });

    it("should use UID as the primary value when text is absent", () => {
      const historyData = {
        entries: [createHistoryEntry({ uid: "04abc123def456", text: "" })],
      };

      render(<HistoryModal {...defaultProps} historyData={historyData} />);

      expect(screen.getByText("04abc123def456")).toBeInTheDocument();
    });

    it("should use scan text as the primary value", () => {
      const historyData = {
        entries: [createHistoryEntry({ text: "game:mario" })],
      };

      render(<HistoryModal {...defaultProps} historyData={historyData} />);

      expect(screen.getByText("game:mario")).toBeInTheDocument();
    });

    it("should identify failed entries without relying on color", () => {
      render(
        <HistoryModal
          {...defaultProps}
          historyData={{ entries: [createHistoryEntry({ success: false })] }}
        />,
      );

      expect(screen.getByText("scan.historyFailed")).toBeInTheDocument();
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

      expect(screen.getByText("text1")).toBeInTheDocument();
      expect(screen.getByText("text2")).toBeInTheDocument();
      expect(screen.getByText("text3")).toBeInTheDocument();
    });
  });

  describe("replay", () => {
    it("should replay a history entry when play is clicked", async () => {
      // Arrange
      const user = userEvent.setup();
      const historyData = {
        entries: [
          createHistoryEntry({
            type: "nfc",
            uid: "test-uid",
            text: "game:zelda",
            data: "raw-data",
          }),
        ],
      };
      render(<HistoryModal {...defaultProps} historyData={historyData} />);

      // Act
      const replayButton = screen.getByRole("button", {
        name: "scan.historyReplay",
      });
      expect(replayButton).toHaveAttribute("data-variant", "ghost");
      await user.click(replayButton);

      // Assert
      expect(CoreAPI.run).toHaveBeenCalledWith({
        type: "nfc",
        uid: "test-uid",
        text: "game:zelda",
        data: "raw-data",
      });
    });

    it("should disable replay when disconnected", () => {
      // Arrange
      useStatusStore.setState({ connected: false });
      const historyData = { entries: [createHistoryEntry()] };

      // Act
      render(<HistoryModal {...defaultProps} historyData={historyData} />);

      // Assert
      expect(
        screen.getByRole("button", { name: "scan.historyReplay" }),
      ).toBeDisabled();
    });

    it("should disable replay when an entry has no scan data", () => {
      // Arrange
      const historyData = {
        entries: [createHistoryEntry({ uid: "", text: "", data: "" })],
      };

      // Act
      render(<HistoryModal {...defaultProps} historyData={historyData} />);

      // Assert
      expect(
        screen.getByRole("button", { name: "scan.historyReplay" }),
      ).toBeDisabled();
    });
  });

  describe("empty values handling", () => {
    it("should show an explicit fallback when scan data is empty", () => {
      const historyData = {
        entries: [createHistoryEntry({ uid: "", text: "", data: "" })],
      };

      render(<HistoryModal {...defaultProps} historyData={historyData} />);

      expect(screen.getByText("scan.historyUnknown")).toBeInTheDocument();
    });

    it("should omit ID metadata when UID is empty", () => {
      const historyData = {
        entries: [createHistoryEntry({ uid: "", text: "some-text" })],
      };

      render(<HistoryModal {...defaultProps} historyData={historyData} />);

      expect(screen.getByText("some-text")).toBeInTheDocument();
      expect(screen.queryByText("scan.lastScannedUid")).not.toBeInTheDocument();
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

    it("should fall back to UID when text is empty", () => {
      const historyData = {
        entries: [createHistoryEntry({ uid: "some-uid", text: "" })],
      };

      render(<HistoryModal {...defaultProps} historyData={historyData} />);

      expect(screen.getByText("some-uid")).toBeInTheDocument();
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
