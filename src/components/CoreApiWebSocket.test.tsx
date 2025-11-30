import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";
import { useStatusStore, ConnectionState } from "../lib/store";
import { CoreApiWebSocket } from "./CoreApiWebSocket";

// Mock the coreApi functions
const { mockGetDeviceAddress, mockGetWsUrl } = vi.hoisted(() => ({
  mockGetDeviceAddress: vi.fn(() => ""),
  mockGetWsUrl: vi.fn(() => ""),
}));

// Mock WebSocket
const mockWebSocket = {
  onerror: vi.fn(),
  onopen: vi.fn(),
  onclose: vi.fn(),
  onmessage: vi.fn(),
  send: vi.fn(),
  close: vi.fn(),
};

// Mock WebSocketManager
const mockWebSocketManager = {
  connect: vi.fn(),
  destroy: vi.fn(),
  send: vi.fn(),
  callbacks: {} as import("../lib/websocketManager").WebSocketManagerCallbacks,
};

vi.mock("../lib/websocketManager", () => ({
  WebSocketManager: vi.fn().mockImplementation((_, callbacks) => {
    // Store callbacks for testing
    mockWebSocketManager.callbacks = callbacks;
    // Auto-trigger state changes when connect is called
    mockWebSocketManager.connect.mockImplementation(() => {
      if (callbacks.onStateChange) {
        callbacks.onStateChange("CONNECTING");
      }
    });
    return mockWebSocketManager;
  }),
  WebSocketState: {
    CONNECTING: "CONNECTING",
    CONNECTED: "CONNECTED",
    RECONNECTING: "RECONNECTING",
    ERROR: "ERROR",
    DISCONNECTED: "DISCONNECTED",
  },
}));

vi.mock("websocket-heartbeat-js", () => ({
  default: vi.fn().mockImplementation(() => mockWebSocket),
}));

vi.mock("../lib/coreApi", () => ({
  getDeviceAddress: mockGetDeviceAddress,
  getWsUrl: mockGetWsUrl,
  CoreAPI: {
    setSend: vi.fn(),
    setWsInstance: vi.fn(),
    flushQueue: vi.fn(),
    processReceived: vi.fn().mockResolvedValue(null),
    media: vi.fn().mockResolvedValue({ database: {}, active: [] }),
    tokens: vi.fn().mockResolvedValue({ last: null }),
  },
}));

// Mock Capacitor Preferences
vi.mock("@capacitor/preferences", () => ({
  Preferences: {
    get: vi.fn().mockResolvedValue({ value: null }),
    set: vi.fn().mockResolvedValue(undefined),
    remove: vi.fn().mockResolvedValue(undefined),
  },
}));

// Mock react-hot-toast
vi.mock("react-hot-toast", () => ({
  default: {
    error: vi.fn(),
  },
}));

// Mock react-i18next
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: { msg?: string }) => options?.msg || key,
  }),
}));

// Mock the store
vi.mock("../lib/store", () => ({
  useStatusStore: vi.fn(),
  ConnectionState: {
    IDLE: "IDLE",
    CONNECTING: "CONNECTING",
    CONNECTED: "CONNECTED",
    RECONNECTING: "RECONNECTING",
    ERROR: "ERROR",
    DISCONNECTED: "DISCONNECTED",
  },
}));

// Test helper factory for creating mock store state
const createMockStoreState = (overrides = {}) => ({
  retryCount: 0,
  setConnected: vi.fn(),
  setConnectionState: vi.fn(),
  setConnectionStateWithGracePeriod: vi.fn(),
  clearGracePeriod: vi.fn(),
  setConnectionError: vi.fn(),
  setPlaying: vi.fn(),
  setGamesIndex: vi.fn(),
  setLastToken: vi.fn(),
  runQueue: null,
  setRunQueue: vi.fn(),
  writeQueue: "",
  setWriteQueue: vi.fn(),
  addDeviceHistory: vi.fn(),
  setDeviceHistory: vi.fn(),
  ...overrides,
});

describe("CoreApiWebSocket", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset to default behavior
    mockGetDeviceAddress.mockReturnValue("");
    mockGetWsUrl.mockReturnValue("");
    // Reset WebSocket mock handlers
    mockWebSocket.onerror = vi.fn();
    mockWebSocket.onopen = vi.fn();
    mockWebSocket.onclose = vi.fn();
    mockWebSocket.onmessage = vi.fn();
  });

  it("should use setConnectionState instead of setConnected for connection errors", () => {
    const mockSetConnectionState = vi.fn();
    const mockSetConnectionError = vi.fn();

    const mockState = createMockStoreState({
      setConnectionState: mockSetConnectionState,
      setConnectionError: mockSetConnectionError,
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(useStatusStore).mockImplementation((selector: any) =>
      selector(mockState),
    );

    render(<CoreApiWebSocket />);

    expect(mockSetConnectionState).toHaveBeenCalledWith(ConnectionState.ERROR);
    expect(mockSetConnectionError).toHaveBeenCalledWith(
      "No device address configured",
    );
  });

  it("should use setConnectionState for WebSocket URL errors", () => {
    // Set up mocks for this test
    mockGetDeviceAddress.mockReturnValue("192.168.1.100");
    mockGetWsUrl.mockReturnValue(""); // Empty URL to trigger error

    const mockSetConnectionState = vi.fn();
    const mockSetConnectionError = vi.fn();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(useStatusStore).mockImplementation((selector: any) =>
      selector({
        retryCount: 0,
        setConnected: vi.fn(),
        setConnectionState: mockSetConnectionState,
        setConnectionError: mockSetConnectionError,
        setPlaying: vi.fn(),
        setGamesIndex: vi.fn(),
        setLastToken: vi.fn(),
        runQueue: null,
        setRunQueue: vi.fn(),
        writeQueue: "",
        setWriteQueue: vi.fn(),
        addDeviceHistory: vi.fn(),
        setDeviceHistory: vi.fn(),
      }),
    );

    render(<CoreApiWebSocket />);

    expect(mockSetConnectionState).toHaveBeenCalledWith(ConnectionState.ERROR);
    expect(mockSetConnectionError).toHaveBeenCalledWith(
      "Invalid WebSocket URL",
    );
  });

  it("should set RECONNECTING state on connection close for automatic reconnection", () => {
    // Mock valid device address and WebSocket URL
    mockGetDeviceAddress.mockReturnValue("192.168.1.100");
    mockGetWsUrl.mockReturnValue("ws://192.168.1.100:7497/api");

    const mockSetConnectionStateWithGracePeriod = vi.fn();
    const mockState = createMockStoreState({
      setConnectionStateWithGracePeriod: mockSetConnectionStateWithGracePeriod,
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(useStatusStore).mockImplementation((selector: any) =>
      selector(mockState),
    );

    render(<CoreApiWebSocket />);

    // Simulate WebSocket close event via callbacks
    if (
      mockWebSocketManager.callbacks &&
      mockWebSocketManager.callbacks.onClose
    ) {
      mockWebSocketManager.callbacks.onClose();
    }

    // When WebSocketManager calls onClose, it should use grace period for RECONNECTING state
    expect(mockSetConnectionStateWithGracePeriod).toHaveBeenCalledWith(
      ConnectionState.RECONNECTING,
    );
  });

  it("should set CONNECTING state when WebSocket connection is initiated", () => {
    // Mock valid device address and WebSocket URL
    mockGetDeviceAddress.mockReturnValue("192.168.1.100");
    mockGetWsUrl.mockReturnValue("ws://192.168.1.100:7497/api");

    const mockSetConnectionState = vi.fn();
    const mockState = createMockStoreState({
      setConnectionState: mockSetConnectionState,
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(useStatusStore).mockImplementation((selector: any) =>
      selector(mockState),
    );

    render(<CoreApiWebSocket />);

    // Should call setConnectionState with CONNECTING when initiating connection
    expect(mockSetConnectionState).toHaveBeenCalledWith(
      ConnectionState.CONNECTING,
    );
  });
});
