import { formatAppDateTime } from "@/lib/formatDate";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "../../../../test-utils";
import userEvent from "@testing-library/user-event";
import { HistoryModal } from "@/components/home/HistoryModal";
import { CoreAPI } from "@/lib/coreApi";
import { ConnectionState, useStatusStore } from "@/lib/store";
import { seedActiveDevice } from "../../../../test-utils/deviceRegistry";

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

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.spyOn(CoreAPI, "run").mockResolvedValue(undefined);
    vi.spyOn(CoreAPI, "mediaHistory").mockResolvedValue({ entries: [] });
    vi.spyOn(CoreAPI, "isConnected").mockReturnValue(true);
    await seedActiveDevice();
    useStatusStore.setState({
      connected: true,
      connectionState: ConnectionState.CONNECTED,
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

  describe("played entry details", () => {
    const playedEntry = {
      systemId: "SNES",
      systemName: "Super Nintendo",
      mediaName: "Super Mario World",
      mediaPath: "/games/mario.sfc",
      startedAt: "2026-09-20T08:00:00.000Z",
      playTime: 90,
    };

    it("should hand the played entry to its owner for details", async () => {
      const user = userEvent.setup();
      const onSelectMedia = vi.fn();
      vi.mocked(CoreAPI.mediaHistory).mockResolvedValue({
        entries: [playedEntry],
      });
      render(
        <HistoryModal
          {...defaultProps}
          historyData={{ entries: [] }}
          onSelectMedia={onSelectMedia}
        />,
      );

      await user.click(
        screen.getByRole("tab", { name: "scan.historyTabPlayed" }),
      );
      await user.click(
        await screen.findByRole("button", { name: "scan.coverRowDetails" }),
      );

      expect(onSelectMedia).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "Super Mario World",
          path: "/games/mario.sfc",
        }),
      );
    });

    it("should offer no details control without an owner", async () => {
      const user = userEvent.setup();
      vi.mocked(CoreAPI.mediaHistory).mockResolvedValue({
        entries: [playedEntry],
      });
      render(<HistoryModal {...defaultProps} historyData={{ entries: [] }} />);

      await user.click(
        screen.getByRole("tab", { name: "scan.historyTabPlayed" }),
      );

      await screen.findByRole("button", { name: "scan.coverRowLaunch" });
      expect(
        screen.queryByRole("button", { name: "scan.coverRowDetails" }),
      ).not.toBeInTheDocument();
    });
  });

  describe("empty state", () => {
    it("should say there are no scans when history has no entries", () => {
      render(<HistoryModal {...defaultProps} historyData={{ entries: [] }} />);

      expect(screen.getByText("scan.history.empty")).toBeVisible();
    });

    it("should say nothing has been played when play history is empty", async () => {
      const user = userEvent.setup();
      render(<HistoryModal {...defaultProps} historyData={{ entries: [] }} />);

      await user.click(
        screen.getByRole("tab", { name: "scan.historyTabPlayed" }),
      );

      expect(await screen.findByText("scan.historyPlayedEmpty")).toBeVisible();
      expect(
        screen.queryByRole("button", { name: "scan.coverRowLaunch" }),
      ).not.toBeInTheDocument();
    });
  });

  describe("scan history request states", () => {
    it("should offer a retry instead of loading forever when the request fails", async () => {
      const user = userEvent.setup();
      const onRetryHistory = vi.fn();
      render(
        <HistoryModal
          {...defaultProps}
          historyData={undefined}
          historyError
          onRetryHistory={onRetryHistory}
        />,
      );

      expect(screen.getByText("scan.historyLoadError")).toBeInTheDocument();
      expect(screen.queryByText("loading")).not.toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: "scan.retry" }));

      expect(onRetryHistory).toHaveBeenCalledTimes(1);
    });

    it("should say the device is not connected when there is nothing cached", () => {
      useStatusStore.setState({ connected: false });
      render(<HistoryModal {...defaultProps} historyData={undefined} />);

      expect(screen.getByText("settings.notConnected")).toBeInTheDocument();
      expect(screen.queryByText("loading")).not.toBeInTheDocument();
    });

    it("should announce loading while the first request is pending", async () => {
      render(<HistoryModal {...defaultProps} historyData={undefined} />);

      expect(await screen.findByText("loading")).toBeInTheDocument();
    });

    it("should keep earlier scans visible beside a failed refresh", () => {
      render(
        <HistoryModal
          {...defaultProps}
          historyData={{ entries: [createHistoryEntry()] }}
          historyError
        />,
      );

      expect(screen.getByText("scan.historyLoadError")).toBeInTheDocument();
      expect(screen.getByText("game:mario")).toBeInTheDocument();
    });

    it("should not offer replay when Core has no live transport", () => {
      vi.mocked(CoreAPI.isConnected).mockReturnValue(false);
      render(
        <HistoryModal
          {...defaultProps}
          historyData={{ entries: [createHistoryEntry()] }}
        />,
      );

      expect(
        screen.getByRole("button", { name: "scan.historyReplay" }),
      ).toBeDisabled();
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
        screen.getByText(formatAppDateTime(time) ?? ""),
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
        name: "copyToClipboard",
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
        name: "copyToClipboard",
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
        name: "copyToClipboard",
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
        name: "copyToClipboard",
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
        name: "copyToClipboard",
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
        screen.queryByRole("button", { name: "copyToClipboard" }),
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
        name: "copyToClipboard",
      });
      expect(copyButtons[0]).toBeDefined();
      await user.click(copyButtons[0]!);

      // Assert - Button state changes to "copied"
      expect(
        screen.getByRole("button", { name: "copied" }),
      ).toBeInTheDocument();
    });
  });
});
