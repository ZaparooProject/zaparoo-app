/**
 * Unit tests for ConnectionProvider
 *
 * Tests the connection state management, device address initialization,
 * connection lifecycle handling, and notification processing.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { Preferences } from "@capacitor/preferences";
import { render, screen, waitFor } from "../../../test-utils";
import { ConnectionProvider } from "../../../components/ConnectionProvider";
import { useConnection } from "../../../hooks/useConnection";
import { connectionManager } from "../../../lib/transport";
import { CoreAPI } from "../../../lib/coreApi";
import { ConnectionState, useStatusStore } from "@/lib/store";
import type { TransportState } from "../../../lib/transport/types";
import type { NotificationRequest } from "../../../lib/coreApi";
import { InboxSeverity, Notification } from "../../../lib/models";

// Capture event handlers for notification testing
let capturedEventHandlers: {
  onConnectionChange?: (deviceId: string, connection: unknown) => void;
  onMessage?: (deviceId: string, event: unknown) => void;
  onError?: (deviceId: string, error: Error) => void;
} = {};

// Mock dependencies
vi.mock("../../../lib/transport", () => {
  const mockTransport = {
    deviceId: "test-device",
    state: "disconnected" as TransportState,
    isConnected: false,
    hasEverConnected: false,
    send: vi.fn(),
    connect: vi.fn(),
    disconnect: vi.fn(),
    destroy: vi.fn(),
    immediateReconnect: vi.fn(),
    pauseHeartbeat: vi.fn(),
    resumeHeartbeat: vi.fn(),
    setEventHandlers: vi.fn(),
  };

  return {
    connectionManager: {
      setEventHandlers: vi.fn((handlers) => {
        capturedEventHandlers = handlers;
      }),
      addDevice: vi.fn(() => mockTransport),
      removeDevice: vi.fn(),
      setActiveDevice: vi.fn(),
      getActiveDeviceId: vi.fn(() => "test-device"),
      getActiveConnection: vi.fn(() => null),
      pauseAll: vi.fn(),
      resumeAll: vi.fn(),
      immediateReconnectActive: vi.fn(),
    },
  };
});

vi.mock("../../../lib/coreApi", () => ({
  CoreAPI: {
    setWsInstance: vi.fn(),
    flushQueue: vi.fn(),
    reset: vi.fn(),
    processReceived: vi.fn().mockResolvedValue(null),
    media: vi.fn().mockResolvedValue({ database: {}, active: [] }),
    tokens: vi.fn().mockResolvedValue({ last: null }),
    version: vi.fn().mockResolvedValue({ version: "2.5.0", platform: "test" }),
    inbox: vi.fn().mockResolvedValue({ messages: [] }),
    mediaScrapeStatus: vi.fn().mockResolvedValue({
      processed: 0,
      total: 0,
      matched: 0,
      skipped: 0,
      totalScraped: 0,
      scraping: false,
      done: false,
      paused: false,
    }),
  },
  getDeviceAddress: vi.fn(() => "192.168.1.100:7497"),
  getWsUrl: vi.fn(() => "ws://192.168.1.100:7497"),
  isCancelled: vi.fn(() => false),
}));

vi.mock("@capacitor/preferences", () => ({
  Preferences: {
    get: vi.fn().mockResolvedValue({ value: null }),
    set: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock("@capacitor/app", () => ({
  App: {
    addListener: vi.fn().mockResolvedValue({ remove: vi.fn() }),
  },
}));

vi.mock("@capacitor/core", () => ({
  Capacitor: {
    isNativePlatform: vi.fn(() => false),
  },
}));

vi.mock("@capacitor/network", () => ({
  Network: {
    addListener: vi.fn().mockResolvedValue({ remove: vi.fn() }),
  },
}));

// Use vi.hoisted for toast mock
const { mockToast, mockToastError } = vi.hoisted(() => ({
  mockToast: vi.fn(),
  mockToastError: vi.fn(),
}));

vi.mock("react-hot-toast", () => ({
  default: Object.assign(mockToast, {
    error: mockToastError,
    dismiss: vi.fn(),
  }),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

// Use vi.hoisted for announce mock
const { mockAnnounce } = vi.hoisted(() => ({
  mockAnnounce: vi.fn(),
}));

vi.mock("../../../components/A11yAnnouncer", () => ({
  useAnnouncer: () => ({
    announce: mockAnnounce,
  }),
  A11yAnnouncerProvider: ({ children }: { children: React.ReactNode }) =>
    children,
}));

// test-utils already provides QueryClientProvider, so we use render directly

// Test component that uses the connection context
function ConnectionConsumer() {
  const { isConnected, hasData, showConnecting, showReconnecting } =
    useConnection();
  return (
    <div>
      <span data-testid="isConnected">{String(isConnected)}</span>
      <span data-testid="hasData">{String(hasData)}</span>
      <span data-testid="showConnecting">{String(showConnecting)}</span>
      <span data-testid="showReconnecting">{String(showReconnecting)}</span>
    </div>
  );
}

// Pre-set targetDeviceAddress to skip the async polling initialization
function resetStore() {
  useStatusStore.setState({
    ...useStatusStore.getInitialState(),
    targetDeviceAddress: "192.168.1.100:7497",
  });
}

describe("ConnectionProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetStore();
  });

  describe("rendering", () => {
    it("should render children", () => {
      render(
        <ConnectionProvider>
          <div data-testid="child">Child content</div>
        </ConnectionProvider>,
      );

      expect(screen.getByTestId("child")).toBeInTheDocument();
    });

    it("should provide connection context to children", () => {
      render(
        <ConnectionProvider>
          <ConnectionConsumer />
        </ConnectionProvider>,
      );

      expect(screen.getByTestId("isConnected")).toBeInTheDocument();
      expect(screen.getByTestId("hasData")).toBeInTheDocument();
    });
  });

  describe("connection initialization", () => {
    it("should set up connection manager event handlers", () => {
      render(
        <ConnectionProvider>
          <div>Test</div>
        </ConnectionProvider>,
      );

      expect(connectionManager.setEventHandlers).toHaveBeenCalled();
    });

    it("should add device with correct config", () => {
      render(
        <ConnectionProvider>
          <div>Test</div>
        </ConnectionProvider>,
      );

      expect(connectionManager.addDevice).toHaveBeenCalledWith(
        expect.objectContaining({
          deviceId: "192.168.1.100:7497",
          type: "websocket",
          address: "ws://192.168.1.100:7497",
          encryption: expect.objectContaining({
            getCredentials: expect.any(Function),
          }),
        }),
      );
    });

    it("should set active device after adding", () => {
      render(
        <ConnectionProvider>
          <div>Test</div>
        </ConnectionProvider>,
      );

      expect(connectionManager.setActiveDevice).toHaveBeenCalledWith(
        "192.168.1.100:7497",
      );
    });
  });

  describe("cleanup", () => {
    it("should remove device on unmount", () => {
      const { unmount } = render(
        <ConnectionProvider>
          <div>Test</div>
        </ConnectionProvider>,
      );

      unmount();

      expect(connectionManager.removeDevice).toHaveBeenCalledWith(
        "192.168.1.100:7497",
      );
    });
  });

  describe("context values", () => {
    it("should provide default disconnected state", () => {
      render(
        <ConnectionProvider>
          <ConnectionConsumer />
        </ConnectionProvider>,
      );

      expect(screen.getByTestId("isConnected")).toHaveTextContent("false");
    });

    it("should provide hasData as false initially", () => {
      render(
        <ConnectionProvider>
          <ConnectionConsumer />
        </ConnectionProvider>,
      );

      expect(screen.getByTestId("hasData")).toHaveTextContent("false");
    });
  });
});

describe("useConnection hook", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetStore();
  });

  it("should return connection context values with expected initial state", () => {
    render(
      <ConnectionProvider>
        <ConnectionConsumer />
      </ConnectionProvider>,
    );

    // Verify connection state values are rendered correctly
    // On initial render with a target address but no connection:
    // - isConnected: false (not connected yet)
    // - hasData: false (no data received)
    // - showConnecting: true (have target address, attempting initial connection)
    // - showReconnecting: false (haven't connected before, so not reconnecting)
    expect(screen.getByTestId("isConnected")).toHaveTextContent("false");
    expect(screen.getByTestId("hasData")).toHaveTextContent("false");
    expect(screen.getByTestId("showConnecting")).toHaveTextContent("true");
    expect(screen.getByTestId("showReconnecting")).toHaveTextContent("false");
  });
});

describe("notification processing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedEventHandlers = {};
    resetStore();
    mockToast.mockClear();
    mockAnnounce.mockClear();
  });

  describe("media.started", () => {
    it("should update playing state when media starts", async () => {
      const mediaStartedNotification: NotificationRequest = {
        method: Notification.MediaStarted,
        params: {
          systemId: "snes",
          systemName: "Super Nintendo",
          mediaPath: "/games/mario.sfc",
          mediaName: "Super Mario World",
        },
      };

      vi.mocked(CoreAPI.processReceived).mockResolvedValueOnce(
        mediaStartedNotification,
      );

      render(
        <ConnectionProvider>
          <div>Test</div>
        </ConnectionProvider>,
      );

      // Simulate receiving a message
      expect(capturedEventHandlers.onMessage).toBeDefined();
      await capturedEventHandlers.onMessage!("test-device", {});

      await waitFor(() => {
        expect(useStatusStore.getState().playing).toEqual({
          systemId: "snes",
          systemName: "Super Nintendo",
          mediaPath: "/games/mario.sfc",
          mediaName: "Super Mario World",
        });
      });
    });
  });

  describe("media.stopped", () => {
    it("should clear playing state when media stops", async () => {
      const mediaStoppedNotification: NotificationRequest = {
        method: Notification.MediaStopped,
        params: {},
      };

      vi.mocked(CoreAPI.processReceived).mockResolvedValueOnce(
        mediaStoppedNotification,
      );

      render(
        <ConnectionProvider>
          <div>Test</div>
        </ConnectionProvider>,
      );

      expect(capturedEventHandlers.onMessage).toBeDefined();
      await capturedEventHandlers.onMessage!("test-device", {});

      await waitFor(() => {
        expect(useStatusStore.getState().playing).toEqual({
          systemId: "",
          systemName: "",
          mediaPath: "",
          mediaName: "",
        });
      });
    });
  });

  describe("tokens.added", () => {
    it("should update last token state", async () => {
      const tokenScannedNotification: NotificationRequest = {
        method: Notification.TokensScanned,
        params: {
          uid: "ABC123",
          text: "**launch:snes/mario.sfc",
          data: "launch data",
          scanTime: "2024-01-15T12:00:00Z",
        },
      };

      vi.mocked(CoreAPI.processReceived).mockResolvedValueOnce(
        tokenScannedNotification,
      );

      render(
        <ConnectionProvider>
          <div>Test</div>
        </ConnectionProvider>,
      );

      expect(capturedEventHandlers.onMessage).toBeDefined();
      await capturedEventHandlers.onMessage!("test-device", {});

      await waitFor(() => {
        expect(useStatusStore.getState().lastToken).toEqual({
          uid: "ABC123",
          text: "**launch:snes/mario.sfc",
          data: "launch data",
          scanTime: "2024-01-15T12:00:00Z",
        });
      });
    });
  });

  describe("inbox.added", () => {
    it("should add inbox message when the feature gate is available", async () => {
      useStatusStore.setState({ coreVersion: "2.8.0" });
      const inboxNotification: NotificationRequest = {
        method: Notification.InboxAdded,
        params: {
          id: 11,
          title: "New warning",
          severity: InboxSeverity.Info,
          createdAt: "2026-05-19T10:00:00.000Z",
        },
      };

      vi.mocked(CoreAPI.processReceived).mockResolvedValueOnce(
        inboxNotification,
      );

      render(
        <ConnectionProvider>
          <div>Test</div>
        </ConnectionProvider>,
      );

      expect(capturedEventHandlers.onMessage).toBeDefined();
      await capturedEventHandlers.onMessage!("test-device", {});

      await waitFor(() => {
        expect(useStatusStore.getState().inboxMessages).toEqual([
          inboxNotification.params,
        ]);
      });
    });

    it("should ignore inbox message when the feature gate is unavailable", async () => {
      useStatusStore.setState({ coreVersion: "2.7.0" });
      const inboxNotification: NotificationRequest = {
        method: Notification.InboxAdded,
        params: {
          id: 12,
          title: "Unsupported message",
          severity: InboxSeverity.Warning,
          createdAt: "2026-05-19T10:00:00.000Z",
        },
      };

      vi.mocked(CoreAPI.processReceived).mockResolvedValueOnce(
        inboxNotification,
      );

      render(
        <ConnectionProvider>
          <div>Test</div>
        </ConnectionProvider>,
      );

      expect(capturedEventHandlers.onMessage).toBeDefined();
      await capturedEventHandlers.onMessage!("test-device", {});

      expect(useStatusStore.getState().inboxMessages).toEqual([]);
      expect(mockToast).not.toHaveBeenCalled();
    });

    it("should show warning toast that opens the inbox", async () => {
      useStatusStore.setState({ coreVersion: "2.8.0" });
      const inboxNotification: NotificationRequest = {
        method: Notification.InboxAdded,
        params: {
          id: 13,
          title: "Action needed",
          severity: InboxSeverity.Warning,
          createdAt: "2026-05-19T10:00:00.000Z",
        },
      };

      vi.mocked(CoreAPI.processReceived).mockResolvedValueOnce(
        inboxNotification,
      );

      render(
        <ConnectionProvider>
          <div>Test</div>
        </ConnectionProvider>,
      );

      expect(capturedEventHandlers.onMessage).toBeDefined();
      await capturedEventHandlers.onMessage!("test-device", {});

      await waitFor(() => {
        expect(mockToast).toHaveBeenCalled();
      });

      const toastRenderer = mockToast.mock.calls[0]![0] as (to: {
        id: string;
      }) => React.ReactNode;
      render(<>{toastRenderer({ id: "toast-1" })}</>);
      screen.getByRole("button", { name: "Action needed" }).click();

      expect(useStatusStore.getState().inboxModalOpen).toBe(true);
    });
  });

  describe("playtime notifications", () => {
    it("should show toast and announce when daily playtime limit reached", async () => {
      const playtimeLimitReachedNotification: NotificationRequest = {
        method: Notification.PlaytimeLimitReached,
        params: {
          reason: "daily",
        },
      };

      vi.mocked(CoreAPI.processReceived).mockResolvedValueOnce(
        playtimeLimitReachedNotification,
      );

      render(
        <ConnectionProvider>
          <div>Test</div>
        </ConnectionProvider>,
      );

      expect(capturedEventHandlers.onMessage).toBeDefined();
      await capturedEventHandlers.onMessage!("test-device", {});

      await waitFor(() => {
        expect(mockAnnounce).toHaveBeenCalled();
        expect(mockToast).toHaveBeenCalled();
      });
    });

    it("should show session limit message when session limit reached", async () => {
      const playtimeLimitReachedNotification: NotificationRequest = {
        method: Notification.PlaytimeLimitReached,
        params: {
          reason: "session",
        },
      };

      vi.mocked(CoreAPI.processReceived).mockResolvedValueOnce(
        playtimeLimitReachedNotification,
      );

      render(
        <ConnectionProvider>
          <div>Test</div>
        </ConnectionProvider>,
      );

      expect(capturedEventHandlers.onMessage).toBeDefined();
      await capturedEventHandlers.onMessage!("test-device", {});

      await waitFor(() => {
        expect(mockAnnounce).toHaveBeenCalled();
        expect(mockToast).toHaveBeenCalled();
      });
    });
  });

  describe("media.indexing", () => {
    it("should update games index state", async () => {
      const mediaIndexingNotification: NotificationRequest = {
        method: Notification.MediaIndexing,
        params: {
          indexing: true,
          optimizing: false,
          exists: true,
          totalMedia: 150,
        },
      };

      vi.mocked(CoreAPI.processReceived).mockResolvedValueOnce(
        mediaIndexingNotification,
      );

      render(
        <ConnectionProvider>
          <div>Test</div>
        </ConnectionProvider>,
      );

      expect(capturedEventHandlers.onMessage).toBeDefined();
      await capturedEventHandlers.onMessage!("test-device", {});

      await waitFor(() => {
        expect(useStatusStore.getState().gamesIndex).toMatchObject({
          indexing: true,
          optimizing: false,
          exists: true,
          totalMedia: 150,
        });
      });
    });
  });

  describe("media.scraping", () => {
    it("should update scraper status state", async () => {
      const mediaScrapingNotification: NotificationRequest = {
        method: Notification.MediaScraping,
        params: {
          scraperId: "gamelist.xml",
          systemId: "snes",
          processed: 42,
          total: 100,
          matched: 38,
          skipped: 4,
          totalScraped: 1200,
          scraping: true,
          done: false,
          paused: true,
        },
      };

      vi.mocked(CoreAPI.processReceived).mockResolvedValueOnce(
        mediaScrapingNotification,
      );

      render(
        <ConnectionProvider>
          <div>Test</div>
        </ConnectionProvider>,
      );

      expect(capturedEventHandlers.onMessage).toBeDefined();
      await capturedEventHandlers.onMessage!("test-device", {});

      await waitFor(() => {
        expect(useStatusStore.getState().scrapingStatus).toMatchObject({
          scraperId: "gamelist.xml",
          systemId: "snes",
          processed: 42,
          total: 100,
          matched: 38,
          skipped: 4,
          totalScraped: 1200,
          scraping: true,
          done: false,
          paused: true,
        });
      });
    });
  });

  describe("error handling", () => {
    it("should not update state when processReceived returns null", async () => {
      vi.mocked(CoreAPI.processReceived).mockResolvedValueOnce(null);

      const initialState = useStatusStore.getInitialState();

      render(
        <ConnectionProvider>
          <div>Test</div>
        </ConnectionProvider>,
      );

      expect(capturedEventHandlers.onMessage).toBeDefined();
      await capturedEventHandlers.onMessage!("test-device", {});

      // State should remain at initial values
      expect(useStatusStore.getState().playing).toEqual(initialState.playing);
      expect(useStatusStore.getState().lastToken).toEqual(
        initialState.lastToken,
      );
    });

    it("should handle unknown notification method gracefully", async () => {
      const unknownNotification: NotificationRequest = {
        method: "unknown.method" as any,
        params: {},
      };

      vi.mocked(CoreAPI.processReceived).mockResolvedValueOnce(
        unknownNotification,
      );

      render(
        <ConnectionProvider>
          <div>Test</div>
        </ConnectionProvider>,
      );

      expect(capturedEventHandlers.onMessage).toBeDefined();
      // Should not throw
      await capturedEventHandlers.onMessage!("test-device", {});

      // State should not be updated for unknown notifications
      const initialState = useStatusStore.getInitialState();
      expect(useStatusStore.getState().playing).toEqual(initialState.playing);
      expect(useStatusStore.getState().lastToken).toEqual(
        initialState.lastToken,
      );
    });

    it("should show toast when processReceived throws an error", async () => {
      vi.mocked(CoreAPI.processReceived).mockRejectedValueOnce(
        new Error("Parse error"),
      );

      render(
        <ConnectionProvider>
          <div>Test</div>
        </ConnectionProvider>,
      );

      expect(capturedEventHandlers.onMessage).toBeDefined();
      await capturedEventHandlers.onMessage!("test-device", {});

      // Should not crash and should continue functioning
      await waitFor(() => {
        expect(screen.getByText("Test")).toBeInTheDocument();
      });
    });
  });

  describe("playtimeLimitWarning", () => {
    it("should show toast and announce when playtime warning is received", async () => {
      const playtimeLimitWarningNotification: NotificationRequest = {
        method: Notification.PlaytimeLimitWarning,
        params: {
          interval: "1m",
          remaining: "5m", // 5 minutes as string duration
        },
      };

      vi.mocked(CoreAPI.processReceived).mockResolvedValueOnce(
        playtimeLimitWarningNotification,
      );

      render(
        <ConnectionProvider>
          <div>Test</div>
        </ConnectionProvider>,
      );

      expect(capturedEventHandlers.onMessage).toBeDefined();
      await capturedEventHandlers.onMessage!("test-device", {});

      await waitFor(() => {
        expect(mockAnnounce).toHaveBeenCalled();
        expect(mockToast).toHaveBeenCalled();
      });
    });
  });
});

describe("connection event handling", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedEventHandlers = {};
    resetStore();
    // Re-setup mock after clearAllMocks - use the address from store mock
    vi.mocked(connectionManager.getActiveDeviceId).mockReturnValue(
      "192.168.1.100:7497",
    );
  });

  it("should call handleConnectionOpen when connection state becomes connected", async () => {
    render(
      <ConnectionProvider>
        <ConnectionConsumer />
      </ConnectionProvider>,
    );

    expect(capturedEventHandlers.onConnectionChange).toBeDefined();

    // Simulate connection becoming connected using the correct device ID
    capturedEventHandlers.onConnectionChange!("192.168.1.100:7497", {
      state: "connected",
      hasData: false,
      hasConnectedBefore: false,
    });

    await waitFor(() => {
      expect(CoreAPI.flushQueue).toHaveBeenCalled();
      expect(CoreAPI.media).toHaveBeenCalled();
      expect(CoreAPI.tokens).toHaveBeenCalled();
      expect(CoreAPI.version).toHaveBeenCalled();
      expect(useStatusStore.getState().coreVersion).toBe("2.5.0");
      expect(useStatusStore.getState().corePlatform).toBe("test");
      expect(useStatusStore.getState().coreVersionPending).toBe(false);
    });
  });

  it("should fetch inbox messages when connected Core supports inbox", async () => {
    const messages = [
      {
        id: 21,
        title: "Fetched message",
        severity: InboxSeverity.Info,
        createdAt: "2026-05-19T10:00:00.000Z",
      },
    ];
    vi.mocked(CoreAPI.version).mockResolvedValueOnce({
      version: "2.8.0",
      platform: "test",
    });
    vi.mocked(CoreAPI.inbox).mockResolvedValueOnce({ messages });

    render(
      <ConnectionProvider>
        <ConnectionConsumer />
      </ConnectionProvider>,
    );

    expect(capturedEventHandlers.onConnectionChange).toBeDefined();
    capturedEventHandlers.onConnectionChange!("192.168.1.100:7497", {
      state: "connected",
      hasData: false,
      hasConnectedBefore: false,
    });

    await waitFor(() => {
      expect(CoreAPI.inbox).toHaveBeenCalled();
      expect(useStatusStore.getState().inboxMessages).toEqual(messages);
    });
  });

  it("should clear stale inbox state when connected Core does not support inbox", async () => {
    useStatusStore.setState({
      inboxMessages: [
        {
          id: 22,
          title: "Stale message",
          severity: InboxSeverity.Warning,
          createdAt: "2026-05-19T10:00:00.000Z",
        },
      ],
      inboxModalOpen: true,
    });
    vi.mocked(CoreAPI.version).mockResolvedValueOnce({
      version: "2.7.0",
      platform: "test",
    });

    render(
      <ConnectionProvider>
        <ConnectionConsumer />
      </ConnectionProvider>,
    );

    expect(capturedEventHandlers.onConnectionChange).toBeDefined();
    capturedEventHandlers.onConnectionChange!("192.168.1.100:7497", {
      state: "connected",
      hasData: false,
      hasConnectedBefore: false,
    });

    await waitFor(() => {
      expect(useStatusStore.getState().coreVersion).toBe("2.7.0");
      expect(CoreAPI.inbox).not.toHaveBeenCalled();
      expect(useStatusStore.getState().inboxMessages).toEqual([]);
      expect(useStatusStore.getState().inboxModalOpen).toBe(false);
    });
  });

  it("should fetch scraper status when connected Core supports media scrapers", async () => {
    vi.mocked(CoreAPI.version).mockResolvedValueOnce({
      version: "2.12.0",
      platform: "test",
    });
    vi.mocked(CoreAPI.mediaScrapeStatus).mockResolvedValueOnce({
      scraperId: "gamelist.xml",
      processed: 1,
      total: 2,
      matched: 1,
      skipped: 0,
      totalScraped: 12,
      scraping: true,
      done: false,
      paused: false,
    });

    render(
      <ConnectionProvider>
        <ConnectionConsumer />
      </ConnectionProvider>,
    );

    expect(capturedEventHandlers.onConnectionChange).toBeDefined();
    capturedEventHandlers.onConnectionChange!("192.168.1.100:7497", {
      state: "connected",
      hasData: false,
      hasConnectedBefore: false,
    });

    await waitFor(() => {
      expect(CoreAPI.mediaScrapeStatus).toHaveBeenCalled();
      expect(useStatusStore.getState().scrapingStatus).toMatchObject({
        scraperId: "gamelist.xml",
        scraping: true,
        totalScraped: 12,
      });
    });
  });

  it("should not fetch scraper status when connected Core is below media scraper gate", async () => {
    vi.mocked(CoreAPI.version).mockResolvedValueOnce({
      version: "2.11.9",
      platform: "test",
    });

    render(
      <ConnectionProvider>
        <ConnectionConsumer />
      </ConnectionProvider>,
    );

    expect(capturedEventHandlers.onConnectionChange).toBeDefined();
    capturedEventHandlers.onConnectionChange!("192.168.1.100:7497", {
      state: "connected",
      hasData: false,
      hasConnectedBefore: false,
    });

    await waitFor(() => {
      expect(useStatusStore.getState().coreVersion).toBe("2.11.9");
      expect(CoreAPI.mediaScrapeStatus).not.toHaveBeenCalled();
    });
  });

  it("should merge platform, version, and lastConnectedAt into deviceHistory entry", async () => {
    render(
      <ConnectionProvider>
        <ConnectionConsumer />
      </ConnectionProvider>,
    );

    expect(capturedEventHandlers.onConnectionChange).toBeDefined();

    const before = Date.now();
    capturedEventHandlers.onConnectionChange!("192.168.1.100:7497", {
      state: "connected",
      hasData: false,
      hasConnectedBefore: false,
    });

    await waitFor(() => {
      const entry = useStatusStore
        .getState()
        .deviceHistory.find((e) => e.address === "192.168.1.100:7497");
      expect(entry).toBeDefined();
      expect(entry!.platform).toBe("test");
      expect(entry!.version).toBe("2.5.0");
      expect(typeof entry!.lastConnectedAt).toBe("number");
      expect(entry!.lastConnectedAt!).toBeGreaterThanOrEqual(before);
    });
  });

  it("should preserve fresh metadata when stored deviceHistory hydrates from Preferences", async () => {
    // Pre-existing history on disk has no metadata. The fix sequences the two
    // chains so the version() merge runs after Preferences.get hydrates state
    // — this test guards against regressing back to a parallel race where the
    // stored hydrate would clobber the merged metadata.
    const stored = JSON.stringify([
      { address: "192.168.1.100:7497", name: "Old Name" },
      { address: "10.0.0.1:7497" },
    ]);
    vi.mocked(Preferences.get).mockResolvedValueOnce({ value: stored });

    render(
      <ConnectionProvider>
        <ConnectionConsumer />
      </ConnectionProvider>,
    );

    expect(capturedEventHandlers.onConnectionChange).toBeDefined();

    const before = Date.now();
    capturedEventHandlers.onConnectionChange!("192.168.1.100:7497", {
      state: "connected",
      hasData: false,
      hasConnectedBefore: false,
    });

    await waitFor(() => {
      const history = useStatusStore.getState().deviceHistory;
      const entry = history.find((e) => e.address === "192.168.1.100:7497");
      // Stored entry is preserved (name retained), AND fresh metadata merged.
      expect(entry?.name).toBe("Old Name");
      expect(entry?.platform).toBe("test");
      expect(entry?.version).toBe("2.5.0");
      expect(typeof entry?.lastConnectedAt).toBe("number");
      expect(entry!.lastConnectedAt!).toBeGreaterThanOrEqual(before);
      // Other stored entries are not lost.
      expect(history.find((e) => e.address === "10.0.0.1:7497")).toBeDefined();
    });
  });

  it("should set coreVersion to null when version fetch fails", async () => {
    vi.mocked(CoreAPI.version).mockRejectedValueOnce(
      new Error("Network error"),
    );

    render(
      <ConnectionProvider>
        <ConnectionConsumer />
      </ConnectionProvider>,
    );

    capturedEventHandlers.onConnectionChange!("192.168.1.100:7497", {
      state: "connected",
      hasData: false,
      hasConnectedBefore: false,
    });

    await waitFor(() => {
      expect(useStatusStore.getState().coreVersion).toBeNull();
      expect(useStatusStore.getState().corePlatform).toBeNull();
      expect(useStatusStore.getState().coreVersionPending).toBe(false);
    });
  });

  it("should handle error event without crashing", async () => {
    vi.mocked(connectionManager.getActiveDeviceId).mockReturnValue(
      "test-device",
    );

    render(
      <ConnectionProvider>
        <div>Test</div>
      </ConnectionProvider>,
    );

    expect(capturedEventHandlers.onError).toBeDefined();

    // Simulate error - should not throw or crash the component
    capturedEventHandlers.onError!(
      "test-device",
      new Error("Connection refused"),
    );

    // Component should still be rendered and functional
    expect(screen.getByText("Test")).toBeInTheDocument();
  });

  it("should ignore events from inactive devices", async () => {
    vi.mocked(connectionManager.getActiveDeviceId).mockReturnValue(
      "other-device",
    );

    render(
      <ConnectionProvider>
        <ConnectionConsumer />
      </ConnectionProvider>,
    );

    expect(capturedEventHandlers.onConnectionChange).toBeDefined();

    // Simulate event from different device
    capturedEventHandlers.onConnectionChange!("test-device", {
      state: "connected",
      hasData: false,
      hasConnectedBefore: false,
    });

    // Should not trigger data fetch since it's not the active device
    // The initial render already calls these, so we check they weren't called again
    const initialCallCount = vi.mocked(CoreAPI.media).mock.calls.length;

    // Verify no additional calls were made (event was ignored)
    expect(vi.mocked(CoreAPI.media).mock.calls.length).toBe(initialCallCount);
  });
});

describe("cancelled request handling", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedEventHandlers = {};
    resetStore();
    // Ensure getActiveDeviceId returns the device we're testing with
    vi.mocked(connectionManager.getActiveDeviceId).mockReturnValue(
      "192.168.1.100:7497",
    );
  });

  it("should handle cancelled media response gracefully", async () => {
    vi.mocked(CoreAPI.media).mockResolvedValueOnce({ cancelled: true } as any);

    render(
      <ConnectionProvider>
        <div>Test</div>
      </ConnectionProvider>,
    );

    // Trigger connection open with the deviceId that matches our mock
    capturedEventHandlers.onConnectionChange!("192.168.1.100:7497", {
      state: "connected",
      hasData: false,
      hasConnectedBefore: false,
    });

    await waitFor(() => {
      expect(CoreAPI.media).toHaveBeenCalled();
    });

    // Component should handle cancelled response without crashing
    expect(screen.getByText("Test")).toBeInTheDocument();
  });

  it("should retry media() once after a cancelled response on initial connect", async () => {
    // Reconnect can race with the transport coming back up; the first call may
    // resolve as cancelled (request reset). We schedule one delayed retry —
    // without it the settings card and store stay stale until the next
    // notification arrives.
    const { isCancelled } = await import("../../../lib/coreApi");
    vi.mocked(isCancelled)
      .mockReturnValueOnce(true) // first call: cancelled, schedules retry
      .mockReturnValue(false); // retry: not cancelled, processed normally
    vi.mocked(CoreAPI.media)
      .mockResolvedValueOnce({ cancelled: true } as any)
      .mockResolvedValueOnce({
        database: { exists: true, indexing: false },
        active: [],
      } as any);

    vi.useFakeTimers({ shouldAdvanceTime: true });

    try {
      render(
        <ConnectionProvider>
          <div>Test</div>
        </ConnectionProvider>,
      );

      capturedEventHandlers.onConnectionChange!("192.168.1.100:7497", {
        state: "connected",
        hasData: false,
        hasConnectedBefore: false,
      });

      await waitFor(() => {
        expect(CoreAPI.media).toHaveBeenCalledTimes(1);
      });

      // Advance past the 500ms scheduled retry.
      await vi.advanceTimersByTimeAsync(600);

      await waitFor(() => {
        expect(CoreAPI.media).toHaveBeenCalledTimes(2);
      });
    } finally {
      vi.useRealTimers();
      vi.mocked(isCancelled).mockReturnValue(false);
    }
  });

  it("should clear a pending media retry timer on unmount", async () => {
    // If the user switches devices while a retry is pending the timer must
    // not fire and write stale data into the new connection's store.
    const { isCancelled } = await import("../../../lib/coreApi");
    vi.mocked(isCancelled).mockReturnValueOnce(true);
    vi.mocked(CoreAPI.media).mockResolvedValueOnce({ cancelled: true } as any);

    vi.useFakeTimers({ shouldAdvanceTime: true });

    try {
      const { unmount } = render(
        <ConnectionProvider>
          <div>Test</div>
        </ConnectionProvider>,
      );

      capturedEventHandlers.onConnectionChange!("192.168.1.100:7497", {
        state: "connected",
        hasData: false,
        hasConnectedBefore: false,
      });

      await waitFor(() => {
        expect(CoreAPI.media).toHaveBeenCalledTimes(1);
      });

      unmount();

      // Even after the retry window, no second call — the cleanup cleared it.
      await vi.advanceTimersByTimeAsync(1000);
      expect(CoreAPI.media).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
      vi.mocked(isCancelled).mockReturnValue(false);
    }
  });

  it("should handle cancelled tokens response gracefully", async () => {
    vi.mocked(CoreAPI.tokens).mockResolvedValueOnce({
      cancelled: true,
    } as any);

    render(
      <ConnectionProvider>
        <div>Test</div>
      </ConnectionProvider>,
    );

    // Trigger connection open with the deviceId that matches our mock
    capturedEventHandlers.onConnectionChange!("192.168.1.100:7497", {
      state: "connected",
      hasData: false,
      hasConnectedBefore: false,
    });

    await waitFor(() => {
      expect(CoreAPI.tokens).toHaveBeenCalled();
    });

    // Should not crash
    expect(screen.getByText("Test")).toBeInTheDocument();
  });
});

describe("API error handling", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    capturedEventHandlers = {};
    resetStore();
    // Ensure getActiveDeviceId returns the device we're testing with
    vi.mocked(connectionManager.getActiveDeviceId).mockReturnValue(
      "192.168.1.100:7497",
    );
    // Reset rate limiter so toast assertions aren't masked by inter-test cooldown.
    const { resetToastRateLimiter } = await import("@/lib/toastUtils");
    resetToastRateLimiter();
  });

  it("should handle media API failure gracefully", async () => {
    vi.mocked(CoreAPI.media).mockRejectedValueOnce(new Error("Network error"));

    render(
      <ConnectionProvider>
        <div>Test</div>
      </ConnectionProvider>,
    );

    // Trigger connection open with the deviceId that matches our mock
    capturedEventHandlers.onConnectionChange!("192.168.1.100:7497", {
      state: "connected",
      hasData: false,
      hasConnectedBefore: false,
    });

    await waitFor(() => {
      expect(CoreAPI.media).toHaveBeenCalled();
    });

    // Should not crash
    expect(screen.getByText("Test")).toBeInTheDocument();
  });

  it("should handle tokens API failure gracefully", async () => {
    vi.mocked(CoreAPI.tokens).mockRejectedValueOnce(new Error("Network error"));

    render(
      <ConnectionProvider>
        <div>Test</div>
      </ConnectionProvider>,
    );

    // Trigger connection open with the deviceId that matches our mock
    capturedEventHandlers.onConnectionChange!("192.168.1.100:7497", {
      state: "connected",
      hasData: false,
      hasConnectedBefore: false,
    });

    await waitFor(() => {
      expect(CoreAPI.tokens).toHaveBeenCalled();
    });

    // Should not crash
    expect(screen.getByText("Test")).toBeInTheDocument();
  });

  it("should show error toast when media fetch fails while CONNECTED", async () => {
    vi.mocked(CoreAPI.media).mockRejectedValueOnce(new Error("Network error"));

    render(
      <ConnectionProvider>
        <div>Test</div>
      </ConnectionProvider>,
    );

    capturedEventHandlers.onConnectionChange!("192.168.1.100:7497", {
      state: "connected",
      hasData: false,
      hasConnectedBefore: false,
    });

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith(expect.any(String));
    });
  });

  it("should suppress error toast when media fetch fails after RECONNECTING", async () => {
    // Reject after we flip to RECONNECTING — simulates a transport flap that
    // rejects pending requests via CoreAPI.reset() while reconnect is in flight.
    let rejectMedia: (e: Error) => void = () => {};
    vi.mocked(CoreAPI.media).mockReturnValueOnce(
      new Promise<never>((_, rej) => {
        rejectMedia = rej;
      }),
    );

    render(
      <ConnectionProvider>
        <div>Test</div>
      </ConnectionProvider>,
    );

    capturedEventHandlers.onConnectionChange!("192.168.1.100:7497", {
      state: "connected",
      hasData: false,
      hasConnectedBefore: false,
    });

    await waitFor(() => {
      expect(CoreAPI.media).toHaveBeenCalled();
    });

    // Flip the store to RECONNECTING before resolving the rejection.
    useStatusStore.setState({
      connectionState: ConnectionState.RECONNECTING,
      connected: true,
    });
    rejectMedia(new Error("Request cancelled: connection reset"));

    // Give the catch handler a chance to run.
    await Promise.resolve();
    await Promise.resolve();

    expect(mockToastError).not.toHaveBeenCalled();
  });

  it("should suppress error toast when tokens fetch fails after RECONNECTING", async () => {
    let rejectTokens: (e: Error) => void = () => {};
    vi.mocked(CoreAPI.tokens).mockReturnValueOnce(
      new Promise<never>((_, rej) => {
        rejectTokens = rej;
      }),
    );

    render(
      <ConnectionProvider>
        <div>Test</div>
      </ConnectionProvider>,
    );

    capturedEventHandlers.onConnectionChange!("192.168.1.100:7497", {
      state: "connected",
      hasData: false,
      hasConnectedBefore: false,
    });

    await waitFor(() => {
      expect(CoreAPI.tokens).toHaveBeenCalled();
    });

    useStatusStore.setState({
      connectionState: ConnectionState.RECONNECTING,
      connected: true,
    });
    rejectTokens(new Error("Request cancelled: connection reset"));

    await Promise.resolve();
    await Promise.resolve();

    expect(mockToastError).not.toHaveBeenCalled();
  });
});

describe("app lifecycle handling", () => {
  let resumeCallback: (() => void) | null = null;
  let pauseCallback: (() => void) | null = null;

  beforeEach(async () => {
    vi.clearAllMocks();
    resumeCallback = null;
    pauseCallback = null;
    resetStore();

    // Capture the callbacks passed to App.addListener
    const { App } = await import("@capacitor/app");
    vi.mocked(App.addListener).mockImplementation(
      async (eventName: any, callback: any) => {
        if (eventName === "resume") {
          resumeCallback = callback;
        } else if (eventName === "pause") {
          pauseCallback = callback;
        }
        return { remove: vi.fn() };
      },
    );
  });

  it("should call connectionManager.resumeAll when app resumes", async () => {
    render(
      <ConnectionProvider>
        <div>Test</div>
      </ConnectionProvider>,
    );

    // Wait for listeners to be set up
    await waitFor(() => {
      expect(resumeCallback).not.toBeNull();
    });

    // Simulate app resume
    resumeCallback!();

    expect(connectionManager.resumeAll).toHaveBeenCalled();
  });

  it("should call connectionManager.pauseAll when app pauses", async () => {
    render(
      <ConnectionProvider>
        <div>Test</div>
      </ConnectionProvider>,
    );

    // Wait for listeners to be set up
    await waitFor(() => {
      expect(pauseCallback).not.toBeNull();
    });

    // Simulate app pause
    pauseCallback!();

    expect(connectionManager.pauseAll).toHaveBeenCalled();
  });

  it("should clean up app lifecycle listeners on unmount", async () => {
    const removeResume = vi.fn();
    const removePause = vi.fn();

    const { App } = await import("@capacitor/app");
    vi.mocked(App.addListener).mockImplementation(async (eventName: string) => {
      if (eventName === "resume") {
        return { remove: removeResume };
      } else if (eventName === "pause") {
        return { remove: removePause };
      }
      return { remove: vi.fn() };
    });

    const { unmount } = render(
      <ConnectionProvider>
        <div>Test</div>
      </ConnectionProvider>,
    );

    // Allow listeners to be registered
    await waitFor(() => {
      expect(App.addListener).toHaveBeenCalledWith(
        "resume",
        expect.any(Function),
      );
    });
    expect(App.addListener).toHaveBeenCalledWith("pause", expect.any(Function));

    unmount();

    // Cleanup should be called
    await waitFor(() => {
      expect(removeResume).toHaveBeenCalled();
    });
    expect(removePause).toHaveBeenCalled();
  });
});

describe("browser visibility handling (web platform)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetStore();
  });

  it("should call connectionManager.resumeAll when tab becomes visible", async () => {
    render(
      <ConnectionProvider>
        <div>Test</div>
      </ConnectionProvider>,
    );

    // Simulate visibility change to visible
    Object.defineProperty(document, "visibilityState", {
      value: "visible",
      writable: true,
    });
    document.dispatchEvent(new Event("visibilitychange"));

    await waitFor(() => {
      expect(connectionManager.resumeAll).toHaveBeenCalled();
    });
  });

  it("should call connectionManager.pauseAll when tab becomes hidden", async () => {
    render(
      <ConnectionProvider>
        <div>Test</div>
      </ConnectionProvider>,
    );

    // Simulate visibility change to hidden
    Object.defineProperty(document, "visibilityState", {
      value: "hidden",
      writable: true,
    });
    document.dispatchEvent(new Event("visibilitychange"));

    await waitFor(() => {
      expect(connectionManager.pauseAll).toHaveBeenCalled();
    });
  });

  it("should clean up visibility listener on unmount", async () => {
    const removeEventListenerSpy = vi.spyOn(document, "removeEventListener");

    const { unmount } = render(
      <ConnectionProvider>
        <div>Test</div>
      </ConnectionProvider>,
    );

    unmount();

    expect(removeEventListenerSpy).toHaveBeenCalledWith(
      "visibilitychange",
      expect.any(Function),
    );
  });
});

describe("edge cases", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedEventHandlers = {};
    resetStore();
  });

  describe("stale connection events", () => {
    it("should ignore connection events from non-active devices", async () => {
      vi.mocked(connectionManager.getActiveDeviceId).mockReturnValue(
        "other-device-address",
      );

      render(
        <ConnectionProvider>
          <ConnectionConsumer />
        </ConnectionProvider>,
      );

      expect(capturedEventHandlers.onConnectionChange).toBeDefined();

      // Simulate event from a different device (not the active one)
      capturedEventHandlers.onConnectionChange!("stale-device", {
        state: "connected",
        hasData: true,
        hasConnectedBefore: true,
      });

      // Should not trigger any data fetch since it's not from active device
      // Initial render may call these once, but they shouldn't be called again
      const callCountAfterEvent = vi.mocked(CoreAPI.media).mock.calls.length;

      // Simulate another event from wrong device
      capturedEventHandlers.onConnectionChange!("another-stale-device", {
        state: "connected",
        hasData: false,
        hasConnectedBefore: false,
      });

      // Call count should remain the same
      expect(vi.mocked(CoreAPI.media).mock.calls.length).toBe(
        callCountAfterEvent,
      );
    });
  });
});

describe("network status handling (native platform)", () => {
  let networkListener: { remove: () => Promise<void> } | null = null;

  beforeEach(async () => {
    vi.clearAllMocks();
    networkListener = null;
    resetStore();

    // Mock Capacitor as native platform
    const { Capacitor } = await import("@capacitor/core");
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);

    // Capture the network status listener
    const { Network } = await import("@capacitor/network");
    vi.mocked(Network.addListener).mockImplementation(async () => {
      networkListener = { remove: vi.fn().mockResolvedValue(undefined) };
      return networkListener;
    });
  });

  it("should set up network listener on native platform", async () => {
    const { Network } = await import("@capacitor/network");

    render(
      <ConnectionProvider>
        <div>Test</div>
      </ConnectionProvider>,
    );

    await waitFor(() => {
      expect(Network.addListener).toHaveBeenCalledWith(
        "networkStatusChange",
        expect.any(Function),
      );
    });
  });

  it("should clean up network listener on unmount", async () => {
    const { Network } = await import("@capacitor/network");
    const removeListener = vi.fn();
    vi.mocked(Network.addListener).mockResolvedValue({
      remove: removeListener,
    });

    const { unmount } = render(
      <ConnectionProvider>
        <div>Test</div>
      </ConnectionProvider>,
    );

    await waitFor(() => {
      expect(Network.addListener).toHaveBeenCalled();
    });

    unmount();

    await waitFor(() => {
      expect(removeListener).toHaveBeenCalled();
    });
  });

  it("should trigger immediate reconnect when network reconnects", async () => {
    const { Network } = await import("@capacitor/network");
    let networkCallback:
      | ((status: { connected: boolean; connectionType: string }) => void)
      | null = null;

    vi.mocked(Network.addListener).mockImplementation(
      async (_eventName: any, callback: any) => {
        networkCallback = callback;
        return { remove: vi.fn() };
      },
    );

    render(
      <ConnectionProvider>
        <div>Test</div>
      </ConnectionProvider>,
    );

    await waitFor(() => {
      expect(networkCallback).not.toBeNull();
    });

    // Simulate network reconnection
    networkCallback!({ connected: true, connectionType: "wifi" });

    expect(connectionManager.immediateReconnectActive).toHaveBeenCalled();
  });

  it("should not trigger reconnect when network disconnects", async () => {
    const { Network } = await import("@capacitor/network");
    let networkCallback:
      | ((status: { connected: boolean; connectionType: string }) => void)
      | null = null;

    vi.mocked(Network.addListener).mockImplementation(
      async (_eventName: any, callback: any) => {
        networkCallback = callback;
        return { remove: vi.fn() };
      },
    );

    render(
      <ConnectionProvider>
        <div>Test</div>
      </ConnectionProvider>,
    );

    await waitFor(() => {
      expect(networkCallback).not.toBeNull();
    });

    // Clear previous calls
    vi.mocked(connectionManager.immediateReconnectActive).mockClear();

    // Simulate network disconnection
    networkCallback!({ connected: false, connectionType: "none" });

    expect(connectionManager.immediateReconnectActive).not.toHaveBeenCalled();
  });
});

describe("processNotification error handling", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    capturedEventHandlers = {};
    resetStore();
    mockToast.mockClear();
    mockToastError.mockClear();
    // Reset toast rate limiter to ensure toast shows
    const { resetToastRateLimiter } = await import("@/lib/toastUtils");
    resetToastRateLimiter();
  });

  it("should show error toast when message processing throws", async () => {
    // Make processReceived throw to trigger error handling
    vi.mocked(CoreAPI.processReceived).mockRejectedValue(
      new Error("Processing failed"),
    );

    render(
      <ConnectionProvider>
        <div>Test</div>
      </ConnectionProvider>,
    );

    expect(capturedEventHandlers.onMessage).toBeDefined();
    await capturedEventHandlers.onMessage!("test-device", {});

    // Should show error toast (toast.error is called by showRateLimitedErrorToast)
    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalled();
    });

    // Component should not crash
    expect(screen.getByText("Test")).toBeInTheDocument();
  });
});
