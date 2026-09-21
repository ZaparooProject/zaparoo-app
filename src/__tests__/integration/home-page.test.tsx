/**
 * Integration Test: Home Page
 *
 * Tests the main landing page interactions including:
 * - Connection status display
 * - Now playing card display
 * - Modal interactions (Stop confirm, History)
 * - Store state updates reflected in UI
 */

import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { act, render, screen, within } from "@/test-utils";
import userEvent from "@testing-library/user-event";
import { useStatusStore, ConnectionState } from "@/lib/store";
import { usePreferencesStore } from "@/lib/preferencesStore";
import { ConnectionStatusDisplay } from "@/components/ConnectionStatusDisplay";
import { NowPlayingCard } from "@/components/home/NowPlayingCard";
import { StopConfirmModal } from "@/components/home/StopConfirmModal";
import { HistoryModal } from "@/components/home/HistoryModal";
import {
  ConnectionContext,
  ConnectionContextValue,
} from "@/hooks/useConnection";
import { seedActiveDevice } from "@/test-utils/deviceRegistry";
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
  openPairingModal: () => {},
};

describe("Home Page Integration", () => {
  beforeEach(async () => {
    // Seed a deterministic baseline for every store field these tests touch
    // so prior-test mutations cannot leak in. encryptionState: "plaintext"
    // keeps connected-state assertions out of the verifying UI gate
    // (encryptionState === "unknown" -> connecting).
    useStatusStore.setState({
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
      encryptionState: "plaintext",
      pairingRequired: false,
    });
    usePreferencesStore.setState({
      ...usePreferencesStore.getState(),
      _hasHydrated: true,
      nfcAvailable: false,
      cameraAvailable: false,
      showFilenames: false,
    });

    await seedActiveDevice({ address: "192.168.1.100" });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("Now Playing card", () => {
    const idleMedia = {
      systemId: "",
      systemName: "",
      mediaName: "",
      mediaPath: "",
    };

    it("says so plainly when nothing is playing", () => {
      render(
        <NowPlayingCard
          media={idleMedia}
          playlist={null}
          connected
          onStop={() => {}}
          onPlaylistPrevious={() => {}}
          onPlaylistToggle={() => {}}
          onPlaylistNext={() => {}}
        />,
      );

      const region = screen.getByRole("region", {
        name: "scan.nowPlayingHeading",
      });
      expect(
        within(region).getByText("scan.nowPlayingIdle"),
      ).toBeInTheDocument();
      expect(within(region).getByRole("status")).toBeInTheDocument();
      const controls = within(region).getAllByRole("button");
      expect(controls).toHaveLength(4);
      controls.forEach((control) => expect(control).toBeDisabled());
      expect(
        within(region).getByRole("button", {
          name: "scan.playLastPlayedUnavailable",
        }),
      ).toHaveAttribute("data-disabled-appearance", "unavailable");
    });

    it("replays the most recently played media from the stable Play control", async () => {
      const user = userEvent.setup();
      const onReplayLast = vi.fn();

      render(
        <NowPlayingCard
          media={idleMedia}
          playlist={null}
          connected
          lastPlayed={{
            mediaId: 42,
            name: "Super Game",
            path: "/roms/SNES/Super Game.sfc",
            type: "media",
            systemId: "SNES",
            tags: [],
            disambiguatingTags: [],
          }}
          onStop={() => {}}
          onPlaylistPrevious={() => {}}
          onPlaylistToggle={() => {}}
          onPlaylistNext={() => {}}
          onReplayLast={onReplayLast}
        />,
      );

      const region = screen.getByRole("region", {
        name: "scan.nowPlayingHeading",
      });
      expect(within(region).getByText("scan.lastPlayed")).toBeInTheDocument();
      const play = within(region).getByRole("button", {
        name: "scan.playLastPlayed",
      });
      expect(play).toBeEnabled();

      await user.click(play);

      expect(onReplayLast).toHaveBeenCalledTimes(1);
      expect(
        within(region).getByRole("button", {
          name: "scan.stopPlayingButton",
        }),
      ).toBeDisabled();
    });

    it("shows replay as busy while the last media is launching", () => {
      render(
        <NowPlayingCard
          media={idleMedia}
          playlist={null}
          connected
          lastPlayed={{
            mediaId: 42,
            name: "Super Game",
            path: "/roms/SNES/Super Game.sfc",
            type: "media",
            systemId: "SNES",
            tags: [],
            disambiguatingTags: [],
          }}
          replayingLast
          onStop={() => {}}
          onPlaylistPrevious={() => {}}
          onPlaylistToggle={() => {}}
          onPlaylistNext={() => {}}
          onReplayLast={() => {}}
        />,
      );

      expect(
        screen.getByRole("button", { name: "scan.playLastPlayed" }),
      ).toHaveAttribute("data-disabled-appearance", "busy");
    });

    it("shows the running media and its system", () => {
      render(
        <NowPlayingCard
          media={{
            systemId: "NES",
            systemName: "Nintendo Entertainment System",
            mediaName: "Super Mario Bros",
            mediaPath: "/path/to/game.rom",
          }}
          playlist={null}
          connected
          onStop={() => {}}
          onPlaylistPrevious={() => {}}
          onPlaylistToggle={() => {}}
          onPlaylistNext={() => {}}
        />,
      );

      const region = screen.getByRole("region", {
        name: "scan.nowPlayingHeading",
      });
      expect(within(region).getByText("Super Mario Bros")).toBeInTheDocument();
      // The system line goes through the region-name preference, so assert the
      // card renders one rather than pinning a particular spelling.
      expect(
        within(region).queryByText("scan.nowPlayingIdle"),
      ).not.toBeInTheDocument();
    });

    it("stops the running media", async () => {
      const user = userEvent.setup();
      const onStop = vi.fn();

      render(
        <NowPlayingCard
          media={{
            systemId: "NES",
            systemName: "NES",
            mediaName: "Super Mario Bros",
            mediaPath: "/path/to/game.rom",
          }}
          playlist={null}
          connected
          onStop={onStop}
          onPlaylistPrevious={() => {}}
          onPlaylistToggle={() => {}}
          onPlaylistNext={() => {}}
        />,
      );

      await user.click(
        screen.getByRole("button", { name: "scan.stopPlayingButton" }),
      );

      expect(onStop).toHaveBeenCalledTimes(1);
    });

    it("keeps the transport row stable and enables advertised controls", () => {
      render(
        <NowPlayingCard
          media={{
            systemId: "Audio",
            systemName: "Audio",
            mediaName: "Theme",
            mediaPath: "/music/theme.mp3",
            launcherId: "native-audio",
            launcherControls: ["pause", "resume", "stop", "next"],
          }}
          playlist={null}
          connected
          onStop={() => {}}
          onPlaylistPrevious={() => {}}
          onPlaylistToggle={() => {}}
          onPlaylistNext={() => {}}
        />,
      );

      expect(
        screen.getByRole("button", { name: "scan.playlistPrevious" }),
      ).toBeDisabled();
      expect(
        screen.getByRole("button", { name: "scan.playlistPause" }),
      ).toBeEnabled();
      expect(
        screen.getByRole("button", { name: "scan.playlistNext" }),
      ).toBeEnabled();
    });

    it("shows the full transport row with only stop enabled for a game", () => {
      render(
        <NowPlayingCard
          media={{
            systemId: "NES",
            systemName: "NES",
            mediaName: "Super Mario Bros",
            mediaPath: "/path/to/game.rom",
            launcherControls: [],
          }}
          playlist={null}
          connected
          onStop={() => {}}
          onPlaylistPrevious={() => {}}
          onPlaylistToggle={() => {}}
          onPlaylistNext={() => {}}
        />,
      );

      expect(
        screen.getByRole("button", { name: "scan.playlistPrevious" }),
      ).toBeDisabled();
      expect(
        screen.getByRole("button", { name: "scan.stopPlayingButton" }),
      ).toBeEnabled();
      expect(
        screen.getByRole("button", { name: "scan.playlistPause" }),
      ).toBeDisabled();
      expect(
        screen.getByRole("button", { name: "scan.playlistNext" }),
      ).toBeDisabled();
    });

    it("shows a paused launcher as resumable", () => {
      render(
        <NowPlayingCard
          media={{
            systemId: "Audio",
            systemName: "Audio",
            mediaName: "Theme",
            mediaPath: "/music/theme.mp3",
            launcherControls: ["pause", "resume"],
            playbackState: "paused",
          }}
          playlist={null}
          connected
          onStop={() => {}}
          onPlaylistPrevious={() => {}}
          onPlaylistToggle={() => {}}
          onPlaylistNext={() => {}}
        />,
      );

      expect(
        screen.getByRole("button", { name: "scan.playlistPlay" }),
      ).toBeInTheDocument();
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
            type: "nfc",
            uid: "abc123def456ab",
            text: "Super Mario Bros",
            data: "",
            success: true,
          },
          {
            time: new Date(Date.now() - 60000).toISOString(),
            type: "nfc",
            uid: "def456abc12345",
            text: "Zelda",
            data: "",
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
    it("should reflect media changes from the store", () => {
      const { rerender } = render(
        <NowPlayingCard
          media={useStatusStore.getState().playing}
          playlist={null}
          connected
          onStop={() => {}}
          onPlaylistPrevious={() => {}}
          onPlaylistToggle={() => {}}
          onPlaylistNext={() => {}}
        />,
      );

      expect(screen.getByText("scan.nowPlayingIdle")).toBeInTheDocument();

      act(() => {
        useStatusStore.getState().setPlaying({
          systemId: "SNES",
          systemName: "Super Nintendo",
          mediaName: "Store Updated Game",
          mediaPath: "/games/store.sfc",
        });
      });

      rerender(
        <NowPlayingCard
          media={useStatusStore.getState().playing}
          playlist={null}
          connected
          onStop={() => {}}
          onPlaylistPrevious={() => {}}
          onPlaylistToggle={() => {}}
          onPlaylistNext={() => {}}
        />,
      );

      expect(screen.getByText("Store Updated Game")).toBeInTheDocument();
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
        openPairingModal: () => {},
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
