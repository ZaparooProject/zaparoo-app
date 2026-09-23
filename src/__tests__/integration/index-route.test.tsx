/**
 * Integration Test: Index Route (Home Page)
 *
 * Tests the REAL Index component from src/routes/-pages/Index.tsx including:
 * - Page structure and accessibility
 * - Connection status display
 * - Scan controls visibility based on NFC/camera availability
 * - Last scanned token display
 * - Now playing info display
 * - History modal interactions
 * - Stop confirm modal interactions
 * - Reader activity interactions
 * - Store state updates reflected in UI
 */

import React, { ReactNode } from "react";
import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { act, render, screen, waitFor, within } from "@/test-utils";
import userEvent from "@testing-library/user-event";
import { useStatusStore, ConnectionState } from "@/lib/store";
import { usePreferencesStore } from "@/lib/preferencesStore";
import { ScanResult } from "@/lib/models";
import { CoreAPI } from "@/lib/coreApi";
import {
  ConnectionContext,
  ConnectionContextValue,
} from "@/hooks/useConnection";
import { seedActiveDevice } from "@/test-utils/deviceRegistry";
import { KeepAwake } from "@capacitor-community/keep-awake";

function expectIdleNowPlaying() {
  const region = screen.getByRole("region", {
    name: "scan.nowPlayingHeading",
  });
  expect(within(region).getByText("scan.nowPlayingIdle")).toBeVisible();
}

// Mock state that can be modified per-test
const mockScanOperationsState = {
  scanSession: false,
  scanStatus: ScanResult.Default,
  handleScanButton: vi.fn(),
  handleCameraScan: vi.fn(),
  handleStopConfirm: vi.fn(),
  runToken: vi.fn(),
};

// Captures the props Index passes to useScanOperations so tests can drive
// the page's local reader activity via its setWriteOpen callback
const mockScanOperationsProps: {
  current: { setWriteOpen: (open: boolean) => void } | null;
} = { current: null };

const mockNfcWriterState = {
  write: vi.fn(),
  retry: vi.fn(),
  end: vi.fn().mockResolvedValue(undefined),
  writing: false,
  result: null,
  status: null as null | string,
  verifyError: null,
  getVerifyError: vi.fn(() => null),
};

const mockShowRateLimitedErrorToast = vi.hoisted(() => vi.fn());
const mockCoverRowsState = vi.hoisted(() => ({
  recents: [] as Array<{
    name: string;
    path: string;
    type: "media";
    systemId: string;
    systemName: string;
    hasCover?: boolean;
  }>,
  favourites: [] as Array<{
    name: string;
    path: string;
    type: "media";
    systemId: string;
    systemName: string;
    hasCover?: boolean;
  }>,
}));

const mockHistoryQueryState = {
  data: undefined as
    | {
        entries: Array<{
          time: string;
          uid: string;
          text: string;
          success: boolean;
        }>;
      }
    | undefined,
  refetch: vi.fn(),
};

// Mock TanStack Router
vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    createFileRoute: vi.fn(() => {
      return () => ({
        component: null,
      });
    }),
    // Mock Link component to avoid router context requirement
    Link: ({
      children,
      to,
      ...props
    }: {
      children: React.ReactNode;
      to: string;
      [key: string]: unknown;
    }) => {
      return (
        <a href={to} {...props}>
          {children}
        </a>
      );
    },
  };
});

vi.mock("@/hooks/useHomeCoverRows", () => ({
  useRecentlyPlayed: () => mockCoverRowsState.recents,
  useFavourites: () => mockCoverRowsState.favourites,
}));

// Mock useScanOperations
vi.mock("@/hooks/useScanOperations", () => ({
  useScanOperations: vi.fn(
    (props: { setWriteOpen: (open: boolean) => void }) => {
      mockScanOperationsProps.current = props;
      return mockScanOperationsState;
    },
  ),
}));

// Mock useNfcWriter
vi.mock("@/lib/writeNfcHook", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/writeNfcHook")>()),
  useNfcWriter: vi.fn(() => mockNfcWriterState),
}));

// Use vi.hoisted for pro purchase mock
const { mockSetProPurchaseModalOpen, mockProPurchaseState } = vi.hoisted(
  () => ({
    mockSetProPurchaseModalOpen: vi.fn(),
    mockProPurchaseState: {
      proAccess: false,
      proPurchaseModalOpen: false,
    },
  }),
);

// Mock useProPurchase
vi.mock("@/components/ProPurchase", () => ({
  useProPurchase: vi.fn(() => ({
    proAccess: mockProPurchaseState.proAccess,
    purchaseModal: null,
    proPurchaseModalOpen: mockProPurchaseState.proPurchaseModalOpen,
    setProPurchaseModalOpen: mockSetProPurchaseModalOpen,
  })),
}));

// Mock usePageHeadingFocus
vi.mock("@/hooks/usePageHeadingFocus", () => ({
  usePageHeadingFocus: vi.fn(),
}));

// Use vi.hoisted for announcer mock
const { mockAnnounce } = vi.hoisted(() => ({
  mockAnnounce: vi.fn(),
}));

// Mock useAnnouncer but keep the Provider
vi.mock("@/components/A11yAnnouncer", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    useAnnouncer: vi.fn(() => ({
      announce: mockAnnounce,
    })),
  };
});

// Mock useSmartSwipe (used by ReaderActivity)
vi.mock("@/hooks/useSmartSwipe", () => ({
  useSmartSwipe: vi.fn(() => ({})),
}));

// Mock useBackButtonHandler (used by ReaderActivity)
vi.mock("@/hooks/useBackButtonHandler", () => ({
  useBackButtonHandler: vi.fn(),
}));

// Mock useQuery for history
vi.mock("@tanstack/react-query", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    useQuery: vi.fn(() => mockHistoryQueryState),
  };
});

// Mock CoreAPI
vi.mock("@/lib/coreApi", () => ({
  CoreAPI: {
    history: vi.fn(),
    run: vi.fn().mockResolvedValue(undefined),
    mediaControl: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock("@/lib/toastUtils", () => ({
  showRateLimitedErrorToast: mockShowRateLimitedErrorToast,
}));

// Mock NFC cancel session
vi.mock("@/lib/nfc", () => ({
  cancelSession: vi.fn(),
  sessionManager: {
    setShouldRestart: vi.fn(),
    setLaunchOnScan: vi.fn(),
  },
}));

// Use vi.hoisted for Capacitor mock
const { mockIsNativePlatform } = vi.hoisted(() => ({
  mockIsNativePlatform: vi.fn(() => true),
}));

// Mock Capacitor
vi.mock("@capacitor/core", () => ({
  Capacitor: {
    isNativePlatform: mockIsNativePlatform,
    getPlatform: vi.fn(() => "ios"),
  },
}));

// Import the REAL component after mocks are set up
import { Index } from "@/routes/-pages/Index";

// Helper to provide connection context
function TestWrapper({
  children,
  connectionValue,
}: {
  children: ReactNode;
  connectionValue?: ConnectionContextValue;
}) {
  const defaultConnection: ConnectionContextValue = {
    activeConnection: null,
    isConnected: true,
    hasData: true,
    showConnecting: false,
    showReconnecting: false,
    openPairingModal: () => {},
  };

  return (
    <ConnectionContext.Provider value={connectionValue ?? defaultConnection}>
      {children}
    </ConnectionContext.Provider>
  );
}

function seedBackgroundPlaylist(playing = true) {
  useStatusStore.setState({
    backgroundPlaying: {
      systemId: "Audio",
      systemName: "Audio",
      mediaName: "Theme",
      mediaPath: "/music/theme.mp3",
      launcherId: "native-audio",
      launcherControls: ["pause", "resume", "stop"],
      slot: "background",
    },
    playlists: {
      primary: null,
      background: {
        id: "soundtrack",
        name: "Soundtrack",
        slot: "background",
        repeat: "all",
        items: [
          { name: "Intro", zapScript: "@Audio/Intro" },
          { name: "Theme", zapScript: "@Audio/Theme" },
        ],
        index: 1,
        total: 2,
        playing,
      },
    },
  });
}

function seedPrimaryPlaylist({
  audio = false,
  playing = true,
}: { audio?: boolean; playing?: boolean } = {}) {
  const items = audio
    ? [
        { name: "Intro", zapScript: "@Audio/Intro" },
        { name: "Theme", zapScript: "@Audio/Theme" },
      ]
    : [
        { name: "Super Mario World", zapScript: "@SNES/Super Mario World" },
        { name: "F-Zero", zapScript: "@SNES/F-Zero" },
      ];
  useStatusStore.setState({
    playing: {
      systemId: audio ? "Audio" : "SNES",
      systemName: audio ? "Audio" : "Super Nintendo",
      mediaName: items[0]!.name,
      mediaPath: audio ? "/music/intro.mp3" : "/games/smw.sfc",
      launcherId: audio ? "native-audio" : "retroarch",
      launcherControls: audio
        ? ["pause", "resume", "stop"]
        : ["toggle_pause", "stop"],
      slot: "primary",
    },
    playlists: {
      primary: {
        id: audio ? "soundtrack" : "favorites",
        name: audio ? "Soundtrack" : "Favorites",
        slot: "primary",
        repeat: "all",
        items,
        index: 0,
        total: items.length,
        playing,
      },
      background: null,
    },
  });
}

describe("Index Route Integration", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    // Drop state captured from a prior Index render.
    mockScanOperationsProps.current = null;
    mockCoverRowsState.recents = [];
    mockCoverRowsState.favourites = [];

    // Reset stores to connected state
    useStatusStore.setState({
      ...useStatusStore.getInitialState(),
      connected: true,
      connectionState: ConnectionState.CONNECTED,
      lastToken: { type: "", uid: "", text: "", data: "", scanTime: "" },
      playing: {
        systemId: "",
        systemName: "",
        mediaName: "",
        mediaPath: "",
      },
      backgroundPlaying: {
        systemId: "",
        systemName: "",
        mediaName: "",
        mediaPath: "",
      },
      playlists: {
        primary: null,
        background: null,
      },
      coreVersion: "2.15.0",
      coreVersionPending: false,
      writeOpen: false,
      proPurchaseModalOpen: false,
      // Seed encryptionState so connected-state assertions don't hit the
      // verifying UI gate (encryptionState === "unknown" -> connecting).
      encryptionState: "plaintext",
      pairingRequired: false,
    });

    usePreferencesStore.setState({
      ...usePreferencesStore.getInitialState(),
      _hasHydrated: true,
      launcherAccess: false,
      nfcAvailable: true,
      cameraAvailable: true,
      preferRemoteWriter: false,
    });

    // Reset mock state
    mockScanOperationsState.scanSession = false;
    mockScanOperationsState.scanStatus = ScanResult.Default;
    mockScanOperationsState.handleScanButton.mockClear();
    mockScanOperationsState.handleCameraScan.mockClear();
    mockScanOperationsState.handleStopConfirm.mockClear();
    vi.mocked(CoreAPI.run).mockReset().mockResolvedValue(undefined);
    vi.mocked(CoreAPI.mediaControl).mockReset().mockResolvedValue(undefined);
    mockShowRateLimitedErrorToast.mockClear();

    mockNfcWriterState.status = null;
    mockNfcWriterState.writing = false;
    mockNfcWriterState.end.mockClear();

    mockHistoryQueryState.data = undefined;
    mockHistoryQueryState.refetch.mockClear();

    // Reset pro purchase mock state
    mockProPurchaseState.proAccess = false;
    mockProPurchaseState.proPurchaseModalOpen = false;
    mockSetProPurchaseModalOpen.mockClear();

    // Reset Capacitor mock
    mockIsNativePlatform.mockReturnValue(true);

    // Reset announcer mock
    mockAnnounce.mockClear();

    await seedActiveDevice({ address: "192.168.1.100" });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("Page Structure", () => {
    it("should render the home page with Zaparoo heading", () => {
      render(
        <TestWrapper>
          <Index />
        </TestWrapper>,
      );

      expect(
        screen.getByRole("heading", { name: "Zaparoo" }),
      ).toBeInTheDocument();
    });

    it("should render the Zaparoo logo", () => {
      render(
        <TestWrapper>
          <Index />
        </TestWrapper>,
      );

      const logo = screen.getByRole("img", { name: "accessibility.logo" });
      expect(logo).toBeInstanceOf(HTMLCanvasElement);
      expect(logo).toHaveAttribute("width", "160");
      expect(logo).toHaveAttribute("height", "36");
    });

    it("should render history toggle button", () => {
      render(
        <TestWrapper>
          <Index />
        </TestWrapper>,
      );

      expect(
        screen.getByRole("button", { name: /scan.historyTitle/i }),
      ).toBeInTheDocument();
    });

    it("places general controls outside the Now Playing card", () => {
      render(
        <TestWrapper>
          <Index />
        </TestWrapper>,
      );

      expect(
        screen.getByRole("button", { name: "scan.remoteKeyboard" }),
      ).toBeInTheDocument();
      expect(
        within(
          screen.getByRole("region", { name: "scan.nowPlayingHeading" }),
        ).queryByRole("button", { name: "scan.remoteKeyboard" }),
      ).not.toBeInTheDocument();
    });
  });

  describe("Scan actions", () => {
    it("leads with the tap action when the phone has NFC", () => {
      render(
        <TestWrapper>
          <Index />
        </TestWrapper>,
      );

      expect(
        screen.getByRole("button", { name: "scan.tapTag" }),
      ).toBeInTheDocument();
    });

    it("omits the tap action when the phone has no NFC", () => {
      usePreferencesStore.setState({ nfcAvailable: false });

      render(
        <TestWrapper>
          <Index />
        </TestWrapper>,
      );

      expect(
        screen.queryByRole("button", { name: "scan.tapTag" }),
      ).not.toBeInTheDocument();
    });

    it("offers the camera action when the phone has a camera", () => {
      render(
        <TestWrapper>
          <Index />
        </TestWrapper>,
      );

      expect(
        screen.getByRole("button", { name: "scan.scanCode" }),
      ).toBeInTheDocument();
    });

    it("omits the camera action when the phone has no camera", () => {
      usePreferencesStore.setState({ cameraAvailable: false });

      render(
        <TestWrapper>
          <Index />
        </TestWrapper>,
      );

      expect(
        screen.queryByRole("button", { name: "scan.scanCode" }),
      ).not.toBeInTheDocument();
    });

    it("starts a scan from the tap action", async () => {
      const user = userEvent.setup();
      render(
        <TestWrapper>
          <Index />
        </TestWrapper>,
      );

      await user.click(screen.getByRole("button", { name: "scan.tapTag" }));

      expect(mockScanOperationsState.handleScanButton).toHaveBeenCalledTimes(1);
    });

    it("stops a running scan from the same action", async () => {
      const user = userEvent.setup();
      mockScanOperationsState.scanSession = true;

      render(
        <TestWrapper>
          <Index />
        </TestWrapper>,
      );

      const action = screen.getByRole("button", { name: "scan.tapTagStop" });
      expect(action).toHaveAttribute("aria-pressed", "true");

      await user.click(action);

      expect(mockScanOperationsState.handleScanButton).toHaveBeenCalledTimes(1);
    });

    it("opens the camera from the camera action", async () => {
      const user = userEvent.setup();
      render(
        <TestWrapper>
          <Index />
        </TestWrapper>,
      );

      await user.click(screen.getByRole("button", { name: "scan.scanCode" }));

      expect(mockScanOperationsState.handleCameraScan).toHaveBeenCalledTimes(1);
    });

    it("does not offer the camera while a scan is running", () => {
      mockScanOperationsState.scanSession = true;

      render(
        <TestWrapper>
          <Index />
        </TestWrapper>,
      );

      expect(
        screen.getByRole("button", { name: "scan.scanCode" }),
      ).toBeDisabled();
    });
  });

  describe("Device pill", () => {
    it("names the device and its connection state", () => {
      render(
        <TestWrapper>
          <Index />
        </TestWrapper>,
      );

      expect(
        screen.getByRole("button", { name: /scan.devicePill/ }),
      ).toHaveAttribute("aria-haspopup", "dialog");
    });

    it("opens the device sheet", async () => {
      const user = userEvent.setup();
      render(
        <TestWrapper>
          <Index />
        </TestWrapper>,
      );

      const trigger = screen.getByRole("button", { name: /scan.devicePill/ });
      await user.click(trigger);

      expect(
        await screen.findByRole("dialog", { name: "scan.deviceSheetTitle" }),
      ).toBeInTheDocument();
      expect(trigger).toHaveAttribute("aria-expanded", "true");
    });
  });

  describe("Now Playing Info", () => {
    it("should show heading and dash placeholders when nothing is playing", () => {
      render(
        <TestWrapper>
          <Index />
        </TestWrapper>,
      );

      expect(screen.getByText("scan.nowPlayingHeading")).toBeInTheDocument();
    });

    it("should show media info when something is playing", () => {
      useStatusStore.setState({
        playing: {
          systemId: "nes",
          systemName: "Nintendo Entertainment System",
          mediaName: "Super Mario Bros",
          mediaPath: "/games/smb.nes",
        },
      });

      render(
        <TestWrapper>
          <Index />
        </TestWrapper>,
      );

      expect(screen.getByText(/Super Mario Bros/)).toBeInTheDocument();
      expect(
        screen.getByText(/Nintendo Entertainment System/),
      ).toBeInTheDocument();
    });

    it("should show stop button when media is playing", () => {
      useStatusStore.setState({
        playing: {
          systemId: "nes",
          systemName: "NES",
          mediaName: "Game",
          mediaPath: "/game.nes",
        },
      });

      render(
        <TestWrapper>
          <Index />
        </TestWrapper>,
      );

      expect(
        screen.getByRole("button", { name: /scan.stopPlayingButton/i }),
      ).toBeInTheDocument();
    });

    it("should disable stop button when disconnected", () => {
      useStatusStore.setState({
        connected: false,
        playing: {
          systemId: "nes",
          systemName: "NES",
          mediaName: "Game",
          mediaPath: "/game.nes",
        },
      });

      render(
        <TestWrapper>
          <Index />
        </TestWrapper>,
      );

      const stopButton = screen.getByRole("button", {
        name: /scan.stopPlayingButton/i,
      });
      expect(stopButton).toBeDisabled();
    });

    it("should show concurrent primary and background media on supported Core", () => {
      useStatusStore.setState({
        playing: {
          systemId: "SNES",
          systemName: "Super Nintendo",
          mediaName: "Super Mario World",
          mediaPath: "/games/smw.sfc",
        },
        backgroundPlaying: {
          systemId: "Audio",
          systemName: "Audio",
          mediaName: "Theme",
          mediaPath: "/music/theme.mp3",
          launcherId: "native-audio",
          launcherControls: ["pause", "resume", "stop"],
          slot: "background",
        },
        playlists: {
          primary: null,
          background: {
            id: "soundtrack",
            name: "Soundtrack",
            slot: "background",
            repeat: "all",
            items: [
              { name: "Intro", zapScript: "@Audio/Intro" },
              { name: "Theme", zapScript: "@Audio/Theme" },
            ],
            index: 1,
            total: 2,
            playing: true,
          },
        },
      });

      render(
        <TestWrapper>
          <Index />
        </TestWrapper>,
      );

      expect(screen.getByText(/Super Mario World/)).toBeInTheDocument();
      expect(screen.getAllByText(/Theme/).length).toBeGreaterThan(0);
      expect(
        screen.getByRole("heading", { name: "scan.backgroundMediaHeading" }),
      ).toBeInTheDocument();

      // Both slots carry transports now, so scope to the background card. Its
      // group label interpolates the section name in a real locale.
      const background = within(
        screen.getByRole("region", { name: "scan.backgroundMediaHeading" }),
      );
      expect(
        background.getByRole("button", {
          name: "scan.stopBackgroundMediaButton",
        }),
      ).toBeInTheDocument();
      expect(
        background.getByRole("group", { name: "scan.playlistControls" }),
      ).toBeInTheDocument();
      expect(
        background.getByRole("button", { name: "scan.playlistPrevious" }),
      ).toBeInTheDocument();
      expect(
        background.getByRole("button", { name: "scan.playlistPause" }),
      ).toBeInTheDocument();
      expect(
        background.getByRole("button", { name: "scan.playlistNext" }),
      ).toBeInTheDocument();
    });

    it("should hide background media below the Core feature gate", () => {
      useStatusStore.setState({
        coreVersion: "2.14.1",
        backgroundPlaying: {
          systemId: "Audio",
          systemName: "Audio",
          mediaName: "Theme",
          mediaPath: "/music/theme.mp3",
          slot: "background",
        },
      });

      render(
        <TestWrapper>
          <Index />
        </TestWrapper>,
      );

      expect(
        screen.queryByRole("heading", {
          name: "scan.backgroundMediaHeading",
        }),
      ).not.toBeInTheDocument();
      expect(screen.queryByText(/Theme/)).not.toBeInTheDocument();
    });
  });

  describe("Home media rows", () => {
    it("replays the most recently played media from the idle transport", async () => {
      const user = userEvent.setup();
      mockCoverRowsState.recents = [
        {
          name: "Super Mario World",
          path: "/games/smw.sfc",
          type: "media",
          systemId: "SNES",
          systemName: "Super Nintendo",
          hasCover: false,
        },
      ];

      render(
        <TestWrapper>
          <Index />
        </TestWrapper>,
      );

      await user.click(
        screen.getByRole("button", { name: "scan.playLastPlayed" }),
      );

      await waitFor(() => {
        expect(CoreAPI.run).toHaveBeenCalledWith({ text: "/games/smw.sfc" });
      });
    });

    it("opens the shared media details modal from Recently played", async () => {
      const user = userEvent.setup();
      mockCoverRowsState.recents = [
        {
          name: "Super Mario World",
          path: "/games/smw.sfc",
          type: "media",
          systemId: "SNES",
          systemName: "Super Nintendo",
          hasCover: false,
        },
      ];

      render(
        <TestWrapper>
          <Index />
        </TestWrapper>,
      );

      await user.click(
        screen.getByRole("button", { name: "scan.coverRowDetails" }),
      );

      expect(
        await screen.findByRole("dialog", { name: "Super Mario World" }),
      ).toBeInTheDocument();
    });

    it("renders Favorites above Recently played", () => {
      mockCoverRowsState.recents = [
        {
          name: "Recent game",
          path: "/games/recent.sfc",
          type: "media",
          systemId: "SNES",
          systemName: "Super Nintendo",
          hasCover: false,
        },
      ];
      mockCoverRowsState.favourites = [
        {
          name: "Favorite game",
          path: "/games/favorite.sfc",
          type: "media",
          systemId: "SNES",
          systemName: "Super Nintendo",
          hasCover: false,
        },
      ];

      render(
        <TestWrapper>
          <Index />
        </TestWrapper>,
      );

      const recents = screen.getByRole("region", {
        name: "scan.recentsHeading",
      });
      const favourites = screen.getByRole("region", {
        name: "scan.favouritesHeading",
      });
      expect(
        favourites.compareDocumentPosition(recents) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
      expect(within(favourites).getByText("Favorite game")).toBeVisible();
    });
  });

  describe("Playlist Controls", () => {
    it("should send previous and next commands to the background slot", async () => {
      const user = userEvent.setup();
      seedBackgroundPlaylist();

      render(
        <TestWrapper>
          <Index />
        </TestWrapper>,
      );

      const background = screen.getByRole("region", {
        name: "scan.backgroundMediaHeading",
      });
      await user.click(
        within(background).getByRole("button", {
          name: "scan.playlistPrevious",
        }),
      );
      await user.click(
        within(background).getByRole("button", { name: "scan.playlistNext" }),
      );

      expect(CoreAPI.run).toHaveBeenNthCalledWith(1, {
        text: "**playlist.previous?slot=background",
      });
      expect(CoreAPI.run).toHaveBeenNthCalledWith(2, {
        text: "**playlist.next?slot=background",
      });
    });

    it("should send previous and next commands to the primary slot", async () => {
      const user = userEvent.setup();
      seedPrimaryPlaylist();

      render(
        <TestWrapper>
          <Index />
        </TestWrapper>,
      );

      await user.click(
        screen.getByRole("button", { name: "scan.playlistPrevious" }),
      );
      await user.click(
        screen.getByRole("button", { name: "scan.playlistNext" }),
      );

      expect(CoreAPI.run).toHaveBeenNthCalledWith(1, {
        text: "**playlist.previous?slot=primary",
      });
      expect(CoreAPI.run).toHaveBeenNthCalledWith(2, {
        text: "**playlist.next?slot=primary",
      });
    });

    it("should go to and play a selected playlist item", async () => {
      const user = userEvent.setup();
      seedPrimaryPlaylist();

      render(
        <TestWrapper>
          <Index />
        </TestWrapper>,
      );

      await user.click(screen.getByRole("button", { name: "F-Zero" }));

      expect(CoreAPI.run).toHaveBeenCalledWith({
        text: "**playlist.goto:2?slot=primary||**playlist.play?slot=primary",
      });
      await waitFor(() => {
        expect(screen.getByRole("button", { name: "F-Zero" })).toHaveAttribute(
          "aria-current",
          "true",
        );
      });
    });

    it("should pause and play a primary Audio playlist", async () => {
      const user = userEvent.setup();
      seedPrimaryPlaylist({ audio: true });

      render(
        <TestWrapper>
          <Index />
        </TestWrapper>,
      );

      await user.click(
        screen.getByRole("button", { name: "scan.playlistPause" }),
      );

      await waitFor(() => {
        expect(CoreAPI.run).toHaveBeenCalledWith({
          text: "**playlist.pause?slot=primary",
        });
        expect(
          screen.getByRole("button", { name: "scan.playlistPlay" }),
        ).toBeInTheDocument();
      });

      await user.click(
        screen.getByRole("button", { name: "scan.playlistPlay" }),
      );
      await waitFor(() => {
        expect(CoreAPI.run).toHaveBeenLastCalledWith({
          text: "**playlist.play?slot=primary",
        });
      });
    });

    it("should pause and play a background Audio playlist", async () => {
      const user = userEvent.setup();
      seedBackgroundPlaylist();

      render(
        <TestWrapper>
          <Index />
        </TestWrapper>,
      );

      await user.click(
        screen.getByRole("button", { name: "scan.playlistPause" }),
      );
      await waitFor(() => {
        expect(CoreAPI.run).toHaveBeenCalledWith({
          text: "**playlist.pause?slot=background",
        });
      });

      await user.click(
        screen.getByRole("button", { name: "scan.playlistPlay" }),
      );
      await waitFor(() => {
        expect(CoreAPI.run).toHaveBeenLastCalledWith({
          text: "**playlist.play?slot=background",
        });
      });
    });

    it("should disable Pause for a playing non-Audio playlist", () => {
      seedPrimaryPlaylist();

      render(
        <TestWrapper>
          <Index />
        </TestWrapper>,
      );

      expect(
        screen.getByRole("button", { name: "scan.playlistPause" }),
      ).toBeDisabled();
      expect(
        screen.getByRole("button", { name: "scan.playlistPrevious" }),
      ).toBeEnabled();
      expect(
        screen.getByRole("button", { name: "scan.playlistNext" }),
      ).toBeInTheDocument();
    });

    it("should play a paused non-Audio playlist", async () => {
      const user = userEvent.setup();
      seedPrimaryPlaylist({ playing: false });

      render(
        <TestWrapper>
          <Index />
        </TestWrapper>,
      );

      await user.click(
        screen.getByRole("button", { name: "scan.playlistPlay" }),
      );
      expect(CoreAPI.run).toHaveBeenCalledWith({
        text: "**playlist.play?slot=primary",
      });
    });

    it("should report playlist command failures", async () => {
      const user = userEvent.setup();
      seedBackgroundPlaylist();
      vi.mocked(CoreAPI.run).mockRejectedValueOnce(new Error("run failed"));

      render(
        <TestWrapper>
          <Index />
        </TestWrapper>,
      );
      const background = screen.getByRole("region", {
        name: "scan.backgroundMediaHeading",
      });
      await user.click(
        within(background).getByRole("button", { name: "scan.playlistNext" }),
      );

      await waitFor(() => {
        expect(mockShowRateLimitedErrorToast).toHaveBeenCalledWith(
          "scan.playlistControlError",
        );
      });
    });
  });

  describe("History Modal", () => {
    it("should visually disable history button when disconnected", () => {
      useStatusStore.setState({ connected: false });

      render(
        <TestWrapper>
          <Index />
        </TestWrapper>,
      );

      const historyButton = screen.getByRole("button", {
        name: /scan.historyTitle/i,
      });
      expect(historyButton).toBeDisabled();
      expect(historyButton).toHaveClass("cursor-not-allowed");
    });

    it("should open history modal when history button is clicked", async () => {
      const user = userEvent.setup();
      mockHistoryQueryState.data = { entries: [] };

      render(
        <TestWrapper>
          <Index />
        </TestWrapper>,
      );

      const historyButton = screen.getByRole("button", {
        name: /scan.historyTitle/i,
      });
      await user.click(historyButton);

      // Modal should be open - look for the dialog
      await waitFor(() => {
        const dialog = screen.getByRole("dialog");
        expect(dialog).toHaveAttribute("aria-hidden", "false");
      });
    });

    it("should refetch history when modal opens", async () => {
      const user = userEvent.setup();
      mockHistoryQueryState.data = { entries: [] };

      render(
        <TestWrapper>
          <Index />
        </TestWrapper>,
      );

      const historyButton = screen.getByRole("button", {
        name: /scan.historyTitle/i,
      });
      await user.click(historyButton);

      await waitFor(() => {
        expect(mockHistoryQueryState.refetch).toHaveBeenCalled();
      });
    });
  });

  describe("Stop Confirm Modal", () => {
    it("should open stop confirm modal when stop button is clicked", async () => {
      const user = userEvent.setup();
      useStatusStore.setState({
        playing: {
          systemId: "nes",
          systemName: "NES",
          mediaName: "Game",
          mediaPath: "/game.nes",
        },
      });

      render(
        <TestWrapper>
          <Index />
        </TestWrapper>,
      );

      const stopButton = screen.getByRole("button", {
        name: /scan.stopPlayingButton/i,
      });
      await user.click(stopButton);

      // Stop confirm modal should be open
      await waitFor(() => {
        expect(screen.getByText("stopPlaying")).toBeInTheDocument();
      });
    });

    it("should call handleStopConfirm when confirmed", async () => {
      const user = userEvent.setup();
      useStatusStore.setState({
        playing: {
          systemId: "nes",
          systemName: "NES",
          mediaName: "Game",
          mediaPath: "/game.nes",
        },
      });

      render(
        <TestWrapper>
          <Index />
        </TestWrapper>,
      );

      // Open stop confirm modal
      const stopButton = screen.getByRole("button", {
        name: /scan.stopPlayingButton/i,
      });
      await user.click(stopButton);

      // Click confirm
      await waitFor(() => {
        expect(screen.getByText("stopPlaying")).toBeInTheDocument();
      });

      const confirmButton = screen.getByRole("button", { name: /yes/i });
      await user.click(confirmButton);

      expect(mockScanOperationsState.handleStopConfirm).toHaveBeenCalledTimes(
        1,
      );
      expect(CoreAPI.mediaControl).not.toHaveBeenCalled();
    });

    it("should stop a primary playlist through its targeted slot", async () => {
      const user = userEvent.setup();
      seedPrimaryPlaylist();

      render(
        <TestWrapper>
          <Index />
        </TestWrapper>,
      );
      await user.click(
        screen.getByRole("button", { name: "scan.stopPlayingButton" }),
      );
      await user.click(screen.getByRole("button", { name: /yes/i }));

      await waitFor(() => {
        expect(CoreAPI.run).toHaveBeenCalledWith({
          text: "**playlist.stop?slot=primary",
        });
      });
      expect(mockScanOperationsState.handleStopConfirm).not.toHaveBeenCalled();
      expect(CoreAPI.mediaControl).not.toHaveBeenCalled();
    });

    it("should stop a background playlist through its targeted slot", async () => {
      const user = userEvent.setup();
      seedBackgroundPlaylist();

      render(
        <TestWrapper>
          <Index />
        </TestWrapper>,
      );
      await user.click(
        screen.getByRole("button", {
          name: "scan.stopBackgroundMediaButton",
        }),
      );
      await user.click(screen.getByRole("button", { name: /yes/i }));

      await waitFor(() => {
        expect(CoreAPI.run).toHaveBeenCalledWith({
          text: "**playlist.stop?slot=background",
        });
      });
      expect(CoreAPI.mediaControl).not.toHaveBeenCalled();
    });

    it("should stop background media through its targeted slot", async () => {
      const user = userEvent.setup();
      useStatusStore.setState({
        backgroundPlaying: {
          systemId: "Audio",
          systemName: "Audio",
          mediaName: "Theme",
          mediaPath: "/music/theme.mp3",
          slot: "background",
        },
      });

      render(
        <TestWrapper>
          <Index />
        </TestWrapper>,
      );
      await user.click(
        screen.getByRole("button", {
          name: "scan.stopBackgroundMediaButton",
        }),
      );

      expect(screen.getByText("stopBackgroundMedia")).toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: /yes/i }));

      await waitFor(() => {
        expect(CoreAPI.mediaControl).toHaveBeenCalledWith({
          action: "stop",
          slot: "background",
        });
      });
      expect(mockScanOperationsState.handleStopConfirm).not.toHaveBeenCalled();
    });

    it("should keep background media visible when targeted stop fails", async () => {
      const user = userEvent.setup();
      vi.mocked(CoreAPI.mediaControl).mockRejectedValueOnce(
        new Error("control failed"),
      );
      useStatusStore.setState({
        backgroundPlaying: {
          systemId: "Audio",
          systemName: "Audio",
          mediaName: "Theme",
          mediaPath: "/music/theme.mp3",
          slot: "background",
        },
      });

      render(
        <TestWrapper>
          <Index />
        </TestWrapper>,
      );
      await user.click(
        screen.getByRole("button", {
          name: "scan.stopBackgroundMediaButton",
        }),
      );
      await user.click(screen.getByRole("button", { name: /yes/i }));

      await waitFor(() => {
        expect(mockShowRateLimitedErrorToast).toHaveBeenCalledWith(
          "scan.stopBackgroundMediaError",
        );
      });
      expect(screen.getByText(/Theme/)).toBeInTheDocument();
    });

    it("should close stop confirm modal when cancelled", async () => {
      const user = userEvent.setup();
      useStatusStore.setState({
        playing: {
          systemId: "nes",
          systemName: "NES",
          mediaName: "Game",
          mediaPath: "/game.nes",
        },
      });

      render(
        <TestWrapper>
          <Index />
        </TestWrapper>,
      );

      // Open stop confirm modal
      const stopButton = screen.getByRole("button", {
        name: /scan.stopPlayingButton/i,
      });
      await user.click(stopButton);

      await waitFor(() => {
        expect(screen.getByText("stopPlaying")).toBeInTheDocument();
      });

      // Click cancel
      const cancelButton = screen.getByRole("button", { name: /nav.cancel/i });
      await user.click(cancelButton);

      // Modal should be closed - the stopPlaying text should no longer be visible
      // (SlideModal animates off-screen but stays in DOM)
      await waitFor(() => {
        // Find the stop confirm modal's dialog by looking for its content
        const dialogs = screen.getAllByRole("dialog", { hidden: true });
        const stopConfirmDialog = dialogs.find((d) =>
          d.textContent?.includes("stopPlaying"),
        );
        expect(stopConfirmDialog).toHaveAttribute("aria-hidden", "true");
      });
    });
  });

  describe("reader activity", () => {
    // The reader activity on Index is local page state, opened through the
    // setWriteOpen callback the page hands to useScanOperations
    const openReaderActivity = () => {
      act(() => {
        mockScanOperationsProps.current?.setWriteOpen(true);
      });
    };

    it("should render reader activity when the scan flow opens it", () => {
      render(
        <TestWrapper>
          <Index />
        </TestWrapper>,
      );

      openReaderActivity();

      expect(
        screen.getByRole("button", { name: "reader.cancelAction" }),
      ).toHaveAttribute("data-reader-state", "waiting");
    });

    it("should cancel reader activity and call nfcWriter.end", async () => {
      const user = userEvent.setup();

      render(
        <TestWrapper>
          <Index />
        </TestWrapper>,
      );

      openReaderActivity();

      await user.click(
        screen.getByRole("button", { name: "reader.cancelAction" }),
      );

      await waitFor(() => {
        expect(mockNfcWriterState.end).toHaveBeenCalled();
      });
      expect(
        screen.queryByRole("button", { name: "reader.cancelAction" }),
      ).not.toBeInTheDocument();
    });

    it("should auto-close reader activity when nfcWriter status changes", () => {
      const { rerender } = render(
        <TestWrapper>
          <Index />
        </TestWrapper>,
      );

      openReaderActivity();

      // Simulate nfcWriter status change
      mockNfcWriterState.status = "success";

      rerender(
        <TestWrapper>
          <Index />
        </TestWrapper>,
      );

      // The effect should have closed the modal
      expect(
        screen.queryByRole("dialog", { name: /spinner.holdTag/i }),
      ).not.toBeInTheDocument();
    });
  });

  describe("Scan Status Display", () => {
    it("should show scanning status when scan session is active", () => {
      mockScanOperationsState.scanSession = true;

      render(
        <TestWrapper>
          <Index />
        </TestWrapper>,
      );

      expect(screen.getByText("scan.statusScanning")).toBeInTheDocument();
    });

    it("should show success status after successful scan", () => {
      mockScanOperationsState.scanStatus = ScanResult.Success;

      render(
        <TestWrapper>
          <Index />
        </TestWrapper>,
      );

      expect(screen.getByText("scan.statusSuccess")).toBeInTheDocument();
    });

    it("should show error status after failed scan", () => {
      mockScanOperationsState.scanStatus = ScanResult.Error;

      render(
        <TestWrapper>
          <Index />
        </TestWrapper>,
      );

      expect(screen.getByText("scan.statusError")).toBeInTheDocument();
    });
  });

  describe("Store State Integration", () => {
    it("should reflect playing state changes from store", () => {
      const { rerender } = render(
        <TestWrapper>
          <Index />
        </TestWrapper>,
      );

      // Initially no media playing
      expectIdleNowPlaying();

      // Update store
      act(() => {
        useStatusStore.getState().setPlaying({
          systemId: "snes",
          systemName: "Super Nintendo",
          mediaName: "Donkey Kong Country",
          mediaPath: "/games/dkc.sfc",
        });
      });

      rerender(
        <TestWrapper>
          <Index />
        </TestWrapper>,
      );

      expect(screen.getByText(/Donkey Kong Country/)).toBeInTheDocument();
      expect(screen.getByText(/Super Nintendo/)).toBeInTheDocument();
    });

    it("should reflect connection state changes from store", () => {
      const { rerender } = render(
        <TestWrapper>
          <Index />
        </TestWrapper>,
      );

      // Initially connected
      expect(
        screen.getByRole("button", { name: /scan.devicePill/ }),
      ).toBeInTheDocument();

      // Update store to disconnected
      act(() => {
        useStatusStore.setState({
          connected: false,
          connectionState: ConnectionState.DISCONNECTED,
        });
      });

      const disconnectedContext: ConnectionContextValue = {
        activeConnection: null,
        isConnected: false,
        hasData: false,
        showConnecting: false,
        showReconnecting: false,
        openPairingModal: () => {},
      };

      rerender(
        <TestWrapper connectionValue={disconnectedContext}>
          <Index />
        </TestWrapper>,
      );

      // Losing the device empties the reader strip, which is the page's
      // visible consequence now that the status card is gone.
      const readers = within(
        screen.getByRole("region", { name: "scan.readersHeading" }),
      );
      expect(readers.getByText("settings.notConnected")).toBeInTheDocument();
    });
  });

  describe("Keep screen awake", () => {
    it("should keep the screen awake while connected", async () => {
      render(
        <TestWrapper>
          <Index />
        </TestWrapper>,
      );

      await waitFor(() => {
        expect(KeepAwake.keepAwake).toHaveBeenCalledTimes(1);
      });
    });

    it("should let the screen sleep when the connection drops", async () => {
      render(
        <TestWrapper>
          <Index />
        </TestWrapper>,
      );
      await waitFor(() => {
        expect(KeepAwake.keepAwake).toHaveBeenCalledTimes(1);
      });

      act(() => {
        useStatusStore.setState({
          connected: false,
          connectionState: ConnectionState.DISCONNECTED,
        });
      });

      await waitFor(() => {
        expect(KeepAwake.allowSleep).toHaveBeenCalledTimes(1);
      });
    });

    it("should not keep the screen awake while disconnected", async () => {
      useStatusStore.setState({
        connected: false,
        connectionState: ConnectionState.DISCONNECTED,
      });

      render(
        <TestWrapper>
          <Index />
        </TestWrapper>,
      );
      await act(async () => {
        await import("@capacitor-community/keep-awake");
      });

      expect(KeepAwake.keepAwake).not.toHaveBeenCalled();
    });

    it("should not keep the screen awake when the preference is off", async () => {
      usePreferencesStore.setState({ keepScreenAwake: false });

      render(
        <TestWrapper>
          <Index />
        </TestWrapper>,
      );
      await act(async () => {
        await import("@capacitor-community/keep-awake");
      });

      expect(KeepAwake.keepAwake).not.toHaveBeenCalled();
    });
  });

  describe("Accessibility", () => {
    it("should have sr-only heading for screen readers", () => {
      render(
        <TestWrapper>
          <Index />
        </TestWrapper>,
      );

      const heading = screen.getByRole("heading", { name: "Zaparoo" });
      expect(heading).toHaveClass("sr-only");
    });

    it("should have accessible history button with aria-label", () => {
      render(
        <TestWrapper>
          <Index />
        </TestWrapper>,
      );

      const historyButton = screen.getByRole("button", {
        name: /scan.historyTitle/i,
      });
      expect(historyButton).toHaveAttribute("aria-label");
    });
  });

  describe("A11y Page Announcements", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("should not announce on non-native platform", async () => {
      mockIsNativePlatform.mockReturnValue(false);

      render(
        <TestWrapper>
          <Index />
        </TestWrapper>,
      );

      // Advance past the announcement delay
      act(() => {
        vi.advanceTimersByTime(600);
      });

      // Should not call announce on non-native platform
      expect(mockAnnounce).not.toHaveBeenCalled();
    });

    it("should announce the tap action when NFC is available", async () => {
      usePreferencesStore.setState({
        nfcAvailable: true,
        cameraAvailable: true,
      });

      render(
        <TestWrapper>
          <Index />
        </TestWrapper>,
      );

      // Advance past the announcement delay
      act(() => {
        vi.advanceTimersByTime(600);
      });

      // Names the action the page leads with
      expect(mockAnnounce).toHaveBeenCalledWith("scan.tapTag");
    });

    it("should announce camera option when NFC is not available but camera is", async () => {
      usePreferencesStore.setState({
        nfcAvailable: false,
        cameraAvailable: true,
      });

      render(
        <TestWrapper>
          <Index />
        </TestWrapper>,
      );

      // Advance past the announcement delay
      act(() => {
        vi.advanceTimersByTime(600);
      });

      // Should announce camera option
      expect(mockAnnounce).toHaveBeenCalledWith("scan.scanCode");
    });

    it("should announce page name when neither NFC nor camera is available", async () => {
      usePreferencesStore.setState({
        nfcAvailable: false,
        cameraAvailable: false,
      });

      render(
        <TestWrapper>
          <Index />
        </TestWrapper>,
      );

      // Advance past the announcement delay
      act(() => {
        vi.advanceTimersByTime(600);
      });

      // Should announce page name
      expect(mockAnnounce).toHaveBeenCalledWith("nav.index");
    });

    it("should only announce once on mount", async () => {
      render(
        <TestWrapper>
          <Index />
        </TestWrapper>,
      );

      // Advance past the announcement delay
      act(() => {
        vi.advanceTimersByTime(600);
      });

      expect(mockAnnounce).toHaveBeenCalledTimes(1);

      // Advance more time - should not announce again
      act(() => {
        vi.advanceTimersByTime(1000);
      });

      expect(mockAnnounce).toHaveBeenCalledTimes(1);
    });
  });

  describe("Modal Timing", () => {
    it("should close pro purchase modal when history is clicked while it's open", async () => {
      const user = userEvent.setup();
      mockProPurchaseState.proPurchaseModalOpen = true;
      mockHistoryQueryState.data = { entries: [] };

      render(
        <TestWrapper>
          <Index />
        </TestWrapper>,
      );

      const historyButton = screen.getByRole("button", {
        name: /scan.historyTitle/i,
      });

      // Click history button while pro modal is open
      await user.click(historyButton);

      // Should close pro purchase modal first
      expect(mockSetProPurchaseModalOpen).toHaveBeenCalledWith(false);
    });

    it("should open history modal normally when pro purchase modal is not open", async () => {
      const user = userEvent.setup();
      mockProPurchaseState.proPurchaseModalOpen = false;
      mockHistoryQueryState.data = { entries: [] };

      render(
        <TestWrapper>
          <Index />
        </TestWrapper>,
      );

      const historyButton = screen.getByRole("button", {
        name: /scan.historyTitle/i,
      });

      // Click history button
      await user.click(historyButton);

      // Should open history modal
      await waitFor(() => {
        const dialog = screen.getByRole("dialog");
        expect(dialog).toHaveAttribute("aria-hidden", "false");
      });

      // Should not have interacted with pro purchase modal at all
      expect(mockSetProPurchaseModalOpen).not.toHaveBeenCalled();
    });
  });
});
