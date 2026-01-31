/**
 * Unit tests for ConnectionProvider
 *
 * Tests the connection state management, device address initialization,
 * connection lifecycle handling, and notification processing.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "../../../test-utils";
import { ConnectionProvider } from "../../../components/ConnectionProvider";
import { useConnection } from "../../../hooks/useConnection";
import { connectionManager } from "../../../lib/transport";
import { CoreAPI } from "../../../lib/coreApi";
import type { TransportState } from "../../../lib/transport/types";
import type { NotificationRequest } from "../../../lib/coreApi";

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
  },
  getDeviceAddress: vi.fn(() => "192.168.1.100:7497"),
  getWsUrl: vi.fn(() => "ws://192.168.1.100:7497"),
}));

// Use vi.hoisted to define mock functions that can be used in vi.mock
const { mockSetPlaying, mockSetLastToken, mockSetGamesIndex } = vi.hoisted(
  () => ({
    mockSetPlaying: vi.fn(),
    mockSetLastToken: vi.fn(),
    mockSetGamesIndex: vi.fn(),
  }),
);

vi.mock("../../../lib/store", () => {
  // Track gamesIndex state for change detection
  const mockGamesIndexState = {
    indexing: false,
    optimizing: false,
    exists: false,
    totalMedia: 0,
  };

  return {
    useStatusStore: Object.assign(
      vi.fn((selector) => {
        const state = {
          targetDeviceAddress: "192.168.1.100:7497",
          setTargetDeviceAddress: vi.fn(),
          setConnectionState: vi.fn(),
          setConnectionError: vi.fn(),
          setPlaying: mockSetPlaying,
          setGamesIndex: mockSetGamesIndex,
          setLastToken: mockSetLastToken,
          addDeviceHistory: vi.fn(),
          setDeviceHistory: vi.fn(),
          gamesIndex: mockGamesIndexState,
        };
        return selector(state);
      }),
      {
        getState: () => ({
          gamesIndex: mockGamesIndexState,
        }),
      },
    ),
    ConnectionState: {
      IDLE: "idle",
      CONNECTING: "connecting",
      CONNECTED: "connected",
      RECONNECTING: "reconnecting",
      DISCONNECTED: "disconnected",
      ERROR: "error",
    },
  };
});

vi.mock("@capacitor/preferences", () => ({
  Preferences: {
    get: vi.fn().mockResolvedValue({ value: null }),
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

// Use vi.hoisted for toast mock
const { mockToast } = vi.hoisted(() => ({
  mockToast: vi.fn(),
}));

vi.mock("react-hot-toast", () => ({
  default: Object.assign(mockToast, {
    error: vi.fn(),
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

describe("ConnectionProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
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

      expect(connectionManager.addDevice).toHaveBeenCalledWith({
        deviceId: "192.168.1.100:7497",
        type: "websocket",
        address: "ws://192.168.1.100:7497",
      });
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
    // Clear hoisted mocks explicitly
    mockSetPlaying.mockClear();
    mockSetLastToken.mockClear();
    mockSetGamesIndex.mockClear();
    mockToast.mockClear();
    mockAnnounce.mockClear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("media.started", () => {
    it("should update playing state when media starts", async () => {
      const mediaStartedNotification: NotificationRequest = {
        method: "media.started",
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
        expect(mockSetPlaying).toHaveBeenCalledWith({
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
        method: "media.stopped",
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
        expect(mockSetPlaying).toHaveBeenCalledWith({
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
        method: "tokens.added",
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
        expect(mockSetLastToken).toHaveBeenCalledWith({
          uid: "ABC123",
          text: "**launch:snes/mario.sfc",
          data: "launch data",
          scanTime: "2024-01-15T12:00:00Z",
        });
      });
    });
  });

  describe("playtime notifications", () => {
    it("should show toast and announce when daily playtime limit reached", async () => {
      const playtimeLimitReachedNotification: NotificationRequest = {
        method: "playtime.limit.reached",
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
        method: "playtime.limit.reached",
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
        method: "media.indexing",
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
        expect(mockSetGamesIndex).toHaveBeenCalledWith({
          indexing: true,
          optimizing: false,
          exists: true,
          totalMedia: 150,
        });
      });
    });
  });

  describe("error handling", () => {
    it("should not update state when processReceived returns null", async () => {
      vi.mocked(CoreAPI.processReceived).mockResolvedValueOnce(null);

      render(
        <ConnectionProvider>
          <div>Test</div>
        </ConnectionProvider>,
      );

      expect(capturedEventHandlers.onMessage).toBeDefined();
      await capturedEventHandlers.onMessage!("test-device", {});

      // Handler completes synchronously after await, so we can assert immediately
      expect(mockSetPlaying).not.toHaveBeenCalled();
      expect(mockSetLastToken).not.toHaveBeenCalled();
    });
  });
});
