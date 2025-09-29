import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useStatusStore, ConnectionState } from "../../../lib/store";
import { CoreApiWebSocket } from "../../../components/CoreApiWebSocket";

// Mock the coreApi functions
const { mockGetDeviceAddress, mockGetWsUrl } = vi.hoisted(() => ({
  mockGetDeviceAddress: vi.fn(() => "192.168.1.100:7497"),
  mockGetWsUrl: vi.fn(() => "ws://192.168.1.100:7497")
}));

// Mock WebSocket
const mockWebSocket = {
  onerror: vi.fn(),
  onopen: vi.fn(),
  onclose: vi.fn(),
  onmessage: vi.fn(),
  send: vi.fn(),
  close: vi.fn()
};

vi.mock("websocket-heartbeat-js", () => ({
  default: vi.fn().mockImplementation(() => mockWebSocket)
}));

// Mock WebSocketManager
const mockWebSocketManager = {
  connect: vi.fn(),
  destroy: vi.fn(),
  send: vi.fn(),
  callbacks: {} as import("../../../lib/websocketManager").WebSocketManagerCallbacks
};

vi.mock("../../../lib/websocketManager", () => ({
  WebSocketManager: vi.fn().mockImplementation((_, callbacks) => {
    // Store callbacks for testing
    mockWebSocketManager.callbacks = callbacks;

    // Update connect mock to trigger onStateChange
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
    DISCONNECTED: "DISCONNECTED"
  }
}));

vi.mock("../../../lib/coreApi", () => ({
  getDeviceAddress: mockGetDeviceAddress,
  getWsUrl: mockGetWsUrl,
  CoreAPI: {
    setSend: vi.fn(),
    setWsInstance: vi.fn(),
    flushQueue: vi.fn(),
    processReceived: vi.fn().mockResolvedValue(null),
    media: vi.fn().mockResolvedValue({ database: {}, active: [] }),
    tokens: vi.fn().mockResolvedValue({ last: null })
  }
}));

// Mock Preferences
vi.mock("@capacitor/preferences", () => ({
  Preferences: {
    get: vi.fn().mockResolvedValue({ value: null })
  }
}));

// Mock react-hot-toast
vi.mock("react-hot-toast", () => ({
  default: {
    error: vi.fn()
  }
}));

// Mock i18next
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key
  })
}));

// Mock the store
vi.mock("../../../lib/store", () => ({
  useStatusStore: vi.fn(),
  ConnectionState: {
    IDLE: "IDLE",
    CONNECTING: "CONNECTING",
    CONNECTED: "CONNECTED",
    RECONNECTING: "RECONNECTING",
    ERROR: "ERROR",
    DISCONNECTED: "DISCONNECTED"
  }
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
  ...overrides
});

// Helper to render CoreApiWebSocket with QueryClient
const renderWithQueryClient = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } }
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <CoreApiWebSocket />
    </QueryClientProvider>
  );
};

describe("CoreApiWebSocket Grace Period", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    // Reset WebSocket mock handlers
    mockWebSocket.onerror = vi.fn();
    mockWebSocket.onopen = vi.fn();
    mockWebSocket.onclose = vi.fn();
    mockWebSocket.onmessage = vi.fn();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllTimers();
  });

  it("should use grace period for onclose events", () => {
    const mockSetConnectionStateWithGracePeriod = vi.fn();
    const mockClearGracePeriod = vi.fn();

    const mockState = createMockStoreState({
      setConnectionStateWithGracePeriod: mockSetConnectionStateWithGracePeriod,
      clearGracePeriod: mockClearGracePeriod
    });

    vi.mocked(useStatusStore).mockImplementation((selector: any) =>
      selector(mockState)
    );

    renderWithQueryClient();

    // Simulate WebSocket close event via WebSocketManager callback
    if (mockWebSocketManager.callbacks && mockWebSocketManager.callbacks.onClose) {
      mockWebSocketManager.callbacks.onClose();
    }

    expect(mockSetConnectionStateWithGracePeriod).toHaveBeenCalledWith(ConnectionState.RECONNECTING);
    expect(mockClearGracePeriod).not.toHaveBeenCalled();
  });

  it("should clear grace period on successful connection", () => {
    const mockSetConnectionStateWithGracePeriod = vi.fn();
    const mockClearGracePeriod = vi.fn();
    const mockSetConnectionError = vi.fn();

    const mockState = createMockStoreState({
      setConnectionStateWithGracePeriod: mockSetConnectionStateWithGracePeriod,
      clearGracePeriod: mockClearGracePeriod,
      setConnectionError: mockSetConnectionError
    });

    vi.mocked(useStatusStore).mockImplementation((selector: any) =>
      selector(mockState)
    );

    renderWithQueryClient();

    // Simulate WebSocket open event via WebSocketManager callback
    if (mockWebSocketManager.callbacks && mockWebSocketManager.callbacks.onOpen) {
      mockWebSocketManager.callbacks.onOpen();
    }

    expect(mockClearGracePeriod).toHaveBeenCalled();
    expect(mockSetConnectionStateWithGracePeriod).toHaveBeenCalledWith(ConnectionState.CONNECTED);
    expect(mockSetConnectionError).toHaveBeenCalledWith("");
  });

  it("should bypass grace period for error states", () => {
    const mockSetConnectionState = vi.fn();
    const mockSetConnectionError = vi.fn();

    const mockState = createMockStoreState({
      setConnectionState: mockSetConnectionState,
      setConnectionError: mockSetConnectionError
    });

    vi.mocked(useStatusStore).mockImplementation((selector: any) =>
      selector(mockState)
    );

    renderWithQueryClient();

    // Simulate WebSocket error event via WebSocketManager callback
    const errorEvent = new Event("error");
    if (mockWebSocketManager.callbacks && mockWebSocketManager.callbacks.onError) {
      mockWebSocketManager.callbacks.onError(errorEvent);
    }

    expect(mockSetConnectionState).toHaveBeenCalledWith(ConnectionState.ERROR);
    expect(mockSetConnectionError).toHaveBeenCalledWith(
      expect.stringContaining("Error communicating with server")
    );
  });

  it("should clear grace period on component cleanup", () => {
    const mockClearGracePeriod = vi.fn();
    const mockSetConnectionState = vi.fn();

    const mockState = createMockStoreState({
      clearGracePeriod: mockClearGracePeriod,
      setConnectionState: mockSetConnectionState
    });

    vi.mocked(useStatusStore).mockImplementation((selector: any) =>
      selector(mockState)
    );

    const { unmount } = renderWithQueryClient();

    unmount();

    expect(mockClearGracePeriod).toHaveBeenCalled();
    expect(mockSetConnectionState).toHaveBeenCalledWith(ConnectionState.DISCONNECTED);
  });

  it("should use regular setConnectionState for initial connecting state", () => {
    const mockSetConnectionState = vi.fn();

    const mockState = createMockStoreState({
      setConnectionState: mockSetConnectionState
    });

    vi.mocked(useStatusStore).mockImplementation((selector: any) =>
      selector(mockState)
    );

    renderWithQueryClient();

    expect(mockSetConnectionState).toHaveBeenCalledWith(ConnectionState.CONNECTING);
  });

  it("should use regular setConnectionState for configuration errors", () => {
    const mockSetConnectionState = vi.fn();
    const mockSetConnectionError = vi.fn();

    // Mock no device address configured
    mockGetDeviceAddress.mockReturnValueOnce("");

    const mockState = createMockStoreState({
      setConnectionState: mockSetConnectionState,
      setConnectionError: mockSetConnectionError
    });

    vi.mocked(useStatusStore).mockImplementation((selector: any) =>
      selector(mockState)
    );

    renderWithQueryClient();

    expect(mockSetConnectionState).toHaveBeenCalledWith(ConnectionState.ERROR);
    expect(mockSetConnectionError).toHaveBeenCalledWith("No device address configured");
  });
});