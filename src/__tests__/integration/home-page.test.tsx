/**
 * Integration Test: Home Page
 *
 * Tests the main landing page interactions including:
 * - Connection status display
 * - Last scanned info display
 * - Now playing info display
 * - Modal interactions (Stop confirm, History)
 * - Store state updates reflected in UI
 */

import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { render, screen, act } from "../../test-utils";
import userEvent from "@testing-library/user-event";
import { useStatusStore, ConnectionState } from "@/lib/store";
import { usePreferencesStore } from "@/lib/preferencesStore";
import { ConnectionStatusDisplay } from "@/components/ConnectionStatusDisplay";
import { LastScannedInfo } from "@/components/home/LastScannedInfo";
import { NowPlayingInfo } from "@/components/home/NowPlayingInfo";
import { StopConfirmModal } from "@/components/home/StopConfirmModal";
import { HistoryModal } from "@/components/home/HistoryModal";
import { ScanResult } from "@/lib/models";
import {
  ConnectionContext,
  ConnectionContextValue,
} from "@/hooks/useConnection";
import { ReactNode } from "react";

// Helper to provide connection context
function ConnectionWrapper({
  children,
  value,
}: {
  children: ReactNode;
  value: ConnectionContextValue;
}) {
  return (
    <ConnectionContext.Provider value={value}>
      {children}
    </ConnectionContext.Provider>
  );
}

// Default connected context for most tests
const connectedContext: ConnectionContextValue = {
  activeConnection: null,
  isConnected: true,
  hasData: true,
  showConnecting: false,
  showReconnecting: false,
};

describe("Home Page Integration", () => {
  beforeEach(() => {
    // Reset stores to initial state
    useStatusStore.setState({
      ...useStatusStore.getState(),
      connected: true,
      connectionState: ConnectionState.CONNECTED,
      connectionError: "",
      lastToken: { type: "", uid: "", text: "", data: "", scanTime: "" },
      playing: {
        systemId: "",
        systemName: "",
        mediaName: "",
        mediaPath: "",
      },
    });
    usePreferencesStore.setState({
      ...usePreferencesStore.getState(),
      _hasHydrated: true,
      nfcAvailable: false,
      cameraAvailable: false,
      showFilenames: false,
    });

    localStorage.setItem("deviceAddress", "192.168.1.100");
  });

  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  describe("Last Scanned Info", () => {
    it("should show heading and dash placeholders when no token scanned", () => {
      render(
        <LastScannedInfo
          lastToken={{ type: "", uid: "", text: "", data: "", scanTime: "" }}
          scanStatus={ScanResult.Default}
        />,
      );

      // Heading is always visible
      expect(screen.getByText("scan.lastScannedHeading")).toBeInTheDocument();
      // Dash placeholders are shown (hidden from screen readers)
      expect(screen.getAllByText("—").length).toBeGreaterThan(0);
    });

    it("should show token text when scanned", () => {
      const lastToken = {
        type: "ntag215",
        uid: "abc123def456ab",
        text: "Super Mario Bros",
        data: "",
        scanTime: new Date().toISOString(),
      };

      render(
        <LastScannedInfo
          lastToken={lastToken}
          scanStatus={ScanResult.Default}
        />,
      );

      expect(screen.getByText("scan.lastScannedHeading")).toBeInTheDocument();
      // Text content is in a paragraph with other content, use substring match
      expect(screen.getByText(/Super Mario Bros/)).toBeInTheDocument();
      expect(screen.getByText(/abc123def456ab/)).toBeInTheDocument();
    });

    it("should show UID with dash for text when text is empty", () => {
      const lastToken = {
        type: "ntag215",
        uid: "abc123def456ab",
        text: "",
        data: "",
        scanTime: new Date().toISOString(),
      };

      render(
        <LastScannedInfo
          lastToken={lastToken}
          scanStatus={ScanResult.Default}
        />,
      );

      // UID should be shown (use regex for substring match)
      expect(screen.getByText(/abc123def456ab/)).toBeInTheDocument();
      // Text field shows dash
      expect(screen.getAllByText("—").length).toBeGreaterThan(0);
    });

    it("should update when props change", () => {
      const { rerender } = render(
        <LastScannedInfo
          lastToken={{ type: "", uid: "", text: "", data: "", scanTime: "" }}
          scanStatus={ScanResult.Default}
        />,
      );

      // Initially shows dash placeholders
      expect(screen.getAllByText("—").length).toBeGreaterThan(0);

      // Simulate token scan
      const newToken = {
        type: "ntag215",
        uid: "newuid1234567a",
        text: "Zelda",
        data: "",
        scanTime: new Date().toISOString(),
      };

      rerender(
        <LastScannedInfo
          lastToken={newToken}
          scanStatus={ScanResult.Success}
        />,
      );

      // Use regex for substring match as text is mixed with translation keys
      expect(screen.getByText(/Zelda/)).toBeInTheDocument();
      expect(screen.getByText(/newuid1234567a/)).toBeInTheDocument();
    });
  });

  describe("Now Playing Info", () => {
    it("should show heading and dash placeholders when nothing is playing", () => {
      render(
        <NowPlayingInfo
          mediaName=""
          mediaPath=""
          systemName=""
          onStop={() => {}}
          connected={true}
        />,
      );

      // Heading is always visible
      expect(screen.getByText("scan.nowPlayingHeading")).toBeInTheDocument();
      // Dash placeholders are shown
      expect(screen.getAllByText("—").length).toBeGreaterThan(0);
    });

    it("should show media info when playing", () => {
      render(
        <NowPlayingInfo
          mediaName="Super Mario Bros"
          mediaPath="/path/to/game.rom"
          systemName="Nintendo Entertainment System"
          onStop={() => {}}
          connected={true}
        />,
      );

      expect(screen.getByText("scan.nowPlayingHeading")).toBeInTheDocument();
      // Use regex for substring match as text is mixed with translation keys
      expect(screen.getByText(/Super Mario Bros/)).toBeInTheDocument();
      expect(
        screen.getByText(/Nintendo Entertainment System/),
      ).toBeInTheDocument();
    });

    it("should call onStop when stop button is clicked", async () => {
      const user = userEvent.setup();
      const onStop = vi.fn();

      render(
        <NowPlayingInfo
          mediaName="Super Mario Bros"
          mediaPath="/path/to/game.rom"
          systemName="NES"
          onStop={onStop}
          connected={true}
        />,
      );

      const stopButton = screen.getByRole("button", {
        name: /scan.stopPlayingButton/i,
      });
      await user.click(stopButton);

      expect(onStop).toHaveBeenCalledTimes(1);
    });

    it("should disable stop button when disconnected", () => {
      render(
        <NowPlayingInfo
          mediaName="Super Mario Bros"
          mediaPath="/path/to/game.rom"
          systemName="NES"
          onStop={() => {}}
          connected={false}
        />,
      );

      const stopButton = screen.getByRole("button", {
        name: /scan.stopPlayingButton/i,
      });
      expect(stopButton).toBeDisabled();
    });

    it("should disable stop button when no media is playing", () => {
      render(
        <NowPlayingInfo
          mediaName=""
          mediaPath=""
          systemName=""
          onStop={() => {}}
          connected={true}
        />,
      );

      const stopButton = screen.getByRole("button", {
        name: /scan.stopPlayingButton/i,
      });
      expect(stopButton).toBeDisabled();
    });
  });

  describe("Stop Confirm Modal", () => {
    it("should render but hide content visually when closed", () => {
      render(
        <StopConfirmModal
          isOpen={false}
          onClose={() => {}}
          onConfirm={() => {}}
        />,
      );

      // SlideModal keeps content in DOM but positions it off-screen when closed
      // Verify the dialog is rendered with aria-hidden true
      const dialog = screen.getByRole("dialog", { hidden: true });
      expect(dialog).toHaveAttribute("aria-hidden", "true");
    });

    it("should show confirmation text when open", () => {
      render(
        <StopConfirmModal
          isOpen={true}
          onClose={() => {}}
          onConfirm={() => {}}
        />,
      );

      expect(screen.getByText("stopPlaying")).toBeInTheDocument();
    });

    it("should call onClose when cancel is clicked", async () => {
      const user = userEvent.setup();
      const onClose = vi.fn();

      render(
        <StopConfirmModal
          isOpen={true}
          onClose={onClose}
          onConfirm={() => {}}
        />,
      );

      const cancelButton = screen.getByRole("button", { name: /nav.cancel/i });
      await user.click(cancelButton);

      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("should call onConfirm when yes is clicked", async () => {
      const user = userEvent.setup();
      const onConfirm = vi.fn();

      render(
        <StopConfirmModal
          isOpen={true}
          onClose={() => {}}
          onConfirm={onConfirm}
        />,
      );

      const confirmButton = screen.getByRole("button", { name: /yes/i });
      await user.click(confirmButton);

      expect(onConfirm).toHaveBeenCalledTimes(1);
    });
  });

  describe("History Modal", () => {
    it("should render but hide content visually when closed", () => {
      render(
        <HistoryModal
          isOpen={false}
          onClose={() => {}}
          historyData={undefined}
        />,
      );

      // SlideModal keeps content in DOM but positions it off-screen when closed
      // Verify the dialog is rendered with aria-hidden true
      const dialog = screen.getByRole("dialog", { hidden: true });
      expect(dialog).toHaveAttribute("aria-hidden", "true");
    });

    it("should show title when open with no entries", () => {
      render(
        <HistoryModal
          isOpen={true}
          onClose={() => {}}
          historyData={{ entries: [] }}
        />,
      );

      // Title is shown via SlideModal - use getAllByText since there may be multiple
      const titleElements = screen.getAllByText("scan.historyTitle");
      expect(titleElements.length).toBeGreaterThan(0);
    });

    it("should render dialog when open with entries", () => {
      const historyData = {
        entries: [
          {
            time: new Date().toISOString(),
            uid: "abc123def456ab",
            text: "Super Mario Bros",
            success: true,
          },
          {
            time: new Date(Date.now() - 60000).toISOString(),
            uid: "def456abc12345",
            text: "Zelda",
            success: true,
          },
        ],
      };

      render(
        <HistoryModal
          isOpen={true}
          onClose={() => {}}
          historyData={historyData}
        />,
      );

      // Verify dialog is rendered and open
      const dialog = screen.getByRole("dialog");
      expect(dialog).toBeInTheDocument();
      expect(dialog).toHaveAttribute("aria-modal", "true");
      expect(dialog).toHaveAttribute("aria-hidden", "false");
    });
  });

  describe("Store state updates reflected in UI", () => {
    it("should update last token through store action", () => {
      const { rerender } = render(
        <LastScannedInfo
          lastToken={useStatusStore.getState().lastToken}
          scanStatus={ScanResult.Default}
        />,
      );

      // Initially shows dash placeholders
      expect(screen.getAllByText("—").length).toBeGreaterThan(0);

      // Update store
      act(() => {
        useStatusStore.getState().setLastToken({
          type: "ntag215",
          uid: "storetoken1234",
          text: "Store Updated Game",
          data: "",
          scanTime: new Date().toISOString(),
        });
      });

      // Re-render with new state
      rerender(
        <LastScannedInfo
          lastToken={useStatusStore.getState().lastToken}
          scanStatus={ScanResult.Success}
        />,
      );

      // Use regex for substring match
      expect(screen.getByText(/Store Updated Game/)).toBeInTheDocument();
    });

    it("should update playing state through store action", () => {
      const { rerender } = render(
        <NowPlayingInfo
          mediaName={useStatusStore.getState().playing.mediaName}
          mediaPath={useStatusStore.getState().playing.mediaPath}
          systemName={useStatusStore.getState().playing.systemName}
          onStop={() => {}}
          connected={true}
        />,
      );

      // Initially shows dash placeholders
      expect(screen.getAllByText("—").length).toBeGreaterThan(0);

      // Update store
      act(() => {
        useStatusStore.getState().setPlaying({
          systemId: "nes",
          systemName: "Nintendo Entertainment System",
          mediaName: "Duck Hunt",
          mediaPath: "/games/duckhunt.nes",
        });
      });

      // Re-render with new state
      const playing = useStatusStore.getState().playing;
      rerender(
        <NowPlayingInfo
          mediaName={playing.mediaName}
          mediaPath={playing.mediaPath}
          systemName={playing.systemName}
          onStop={() => {}}
          connected={true}
        />,
      );

      // Use regex for substring match
      expect(screen.getByText(/Duck Hunt/)).toBeInTheDocument();
    });
  });

  describe("Connection status integration", () => {
    it("should show connected status with device address", () => {
      render(
        <ConnectionWrapper value={connectedContext}>
          <ConnectionStatusDisplay />
        </ConnectionWrapper>,
      );

      expect(screen.getByText("scan.connectedHeading")).toBeInTheDocument();
      expect(screen.getByText("192.168.1.100")).toBeInTheDocument();
    });

    it("should show disconnected when not connected", () => {
      const disconnectedContext: ConnectionContextValue = {
        activeConnection: null,
        isConnected: false,
        hasData: false,
        showConnecting: false,
        showReconnecting: false,
      };

      render(
        <ConnectionWrapper value={disconnectedContext}>
          <ConnectionStatusDisplay />
        </ConnectionWrapper>,
      );

      expect(screen.getByText("settings.notConnected")).toBeInTheDocument();
    });
  });
});
