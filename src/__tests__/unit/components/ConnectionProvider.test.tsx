/**
 * Unit tests for ConnectionProvider
 *
 * Tests the connection state management, device address initialization,
 * and connection lifecycle handling.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ConnectionProvider } from "../../../components/ConnectionProvider";
import { useConnection } from "../../../hooks/useConnection";
import { connectionManager } from "../../../lib/transport";
import type { TransportState } from "../../../lib/transport/types";

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
      setEventHandlers: vi.fn(),
      addDevice: vi.fn(() => mockTransport),
      removeDevice: vi.fn(),
      setActiveDevice: vi.fn(),
      getActiveDeviceId: vi.fn(() => "test-device"),
      getActiveConnection: vi.fn(() => null),
      pauseAll: vi.fn(),
      resumeAll: vi.fn(),
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

vi.mock("../../../lib/store", () => ({
  useStatusStore: vi.fn((selector) => {
    const state = {
      targetDeviceAddress: "192.168.1.100:7497",
      setTargetDeviceAddress: vi.fn(),
      setConnectionState: vi.fn(),
      setConnectionError: vi.fn(),
      setPlaying: vi.fn(),
      setGamesIndex: vi.fn(),
      setLastToken: vi.fn(),
      addDeviceHistory: vi.fn(),
      setDeviceHistory: vi.fn(),
    };
    return selector(state);
  }),
  ConnectionState: {
    IDLE: "idle",
    CONNECTING: "connecting",
    CONNECTED: "connected",
    RECONNECTING: "reconnecting",
    DISCONNECTED: "disconnected",
    ERROR: "error",
  },
}));

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

vi.mock("react-hot-toast", () => ({
  default: vi.fn(),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock("../../../components/A11yAnnouncer", () => ({
  useAnnouncer: () => ({
    announce: vi.fn(),
  }),
}));

// Custom render that provides necessary providers
const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: false },
    mutations: { retry: false },
  },
});

function renderWithProviders(ui: React.ReactElement) {
  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>,
  );
}

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
      renderWithProviders(
        <ConnectionProvider>
          <div data-testid="child">Child content</div>
        </ConnectionProvider>,
      );

      expect(screen.getByTestId("child")).toBeInTheDocument();
    });

    it("should provide connection context to children", () => {
      renderWithProviders(
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
      renderWithProviders(
        <ConnectionProvider>
          <div>Test</div>
        </ConnectionProvider>,
      );

      expect(connectionManager.setEventHandlers).toHaveBeenCalled();
    });

    it("should add device with correct config", () => {
      renderWithProviders(
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
      renderWithProviders(
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
      const { unmount } = renderWithProviders(
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
      renderWithProviders(
        <ConnectionProvider>
          <ConnectionConsumer />
        </ConnectionProvider>,
      );

      expect(screen.getByTestId("isConnected").textContent).toBe("false");
    });

    it("should provide hasData as false initially", () => {
      renderWithProviders(
        <ConnectionProvider>
          <ConnectionConsumer />
        </ConnectionProvider>,
      );

      expect(screen.getByTestId("hasData").textContent).toBe("false");
    });
  });
});

describe("useConnection hook", () => {
  it("should return connection context values", () => {
    renderWithProviders(
      <ConnectionProvider>
        <ConnectionConsumer />
      </ConnectionProvider>,
    );

    expect(screen.getByTestId("isConnected")).toBeInTheDocument();
    expect(screen.getByTestId("hasData")).toBeInTheDocument();
    expect(screen.getByTestId("showConnecting")).toBeInTheDocument();
    expect(screen.getByTestId("showReconnecting")).toBeInTheDocument();
  });
});
