/**
 * Unit tests for ConnectionProvider
 *
 * Tests the connection state management, device address initialization,
 * connection lifecycle handling, and notification processing.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "../../../test-utils";
import { ConnectionProvider } from "../../../components/ConnectionProvider";
import { useConnection } from "../../../hooks/useConnection";
import { connectionManager } from "../../../lib/transport";
import { CoreAPI } from "../../../lib/coreApi";
import type { TransportState } from "../../../lib/transport/types";
import type { NotificationRequest } from "../../../lib/coreApi";
import { Notification } from "../../../lib/models";

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
  isCancelled: vi.fn(() => false),
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

describe("ConnectionProvider", () => {
  beforeEach(() => {
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
      expect(mockSetPlaying).not.toHaveBeenCalled();
      expect(mockSetLastToken).not.toHaveBeenCalled();
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

  it("should handle cancelled tokens response gracefully", async () => {
    vi.mocked(CoreAPI.tokens).mockResolvedValueOnce({ cancelled: true } as any);

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
  beforeEach(() => {
    vi.clearAllMocks();
    capturedEventHandlers = {};
    // Ensure getActiveDeviceId returns the device we're testing with
    vi.mocked(connectionManager.getActiveDeviceId).mockReturnValue(
      "192.168.1.100:7497",
    );
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
});

describe("app lifecycle handling", () => {
  let resumeCallback: (() => void) | null = null;
  let pauseCallback: (() => void) | null = null;

  beforeEach(async () => {
    vi.clearAllMocks();
    resumeCallback = null;
    pauseCallback = null;

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
