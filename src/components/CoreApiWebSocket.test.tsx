import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";
import { useStatusStore, ConnectionState } from "../lib/store";
import { CoreApiWebSocket } from "./CoreApiWebSocket";

// Mock the coreApi functions
const { mockGetDeviceAddress, mockGetWsUrl } = vi.hoisted(() => ({
  mockGetDeviceAddress: vi.fn(() => ""),
  mockGetWsUrl: vi.fn(() => "")
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

vi.mock("../lib/coreApi", () => ({
  getDeviceAddress: mockGetDeviceAddress,
  getWsUrl: mockGetWsUrl,
  CoreAPI: {
    setSend: vi.fn(),
    media: vi.fn().mockResolvedValue({ database: {}, active: [] }),
    tokens: vi.fn().mockResolvedValue({ last: null })
  }
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
    DISCONNECTED: "DISCONNECTED"
  }
}));

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
        setDeviceHistory: vi.fn()
      })
    );

    
    render(<CoreApiWebSocket />);

    expect(mockSetConnectionState).toHaveBeenCalledWith(ConnectionState.ERROR);
    expect(mockSetConnectionError).toHaveBeenCalledWith("No device address configured");
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
        setDeviceHistory: vi.fn()
      })
    );

    render(<CoreApiWebSocket />);

    expect(mockSetConnectionState).toHaveBeenCalledWith(ConnectionState.ERROR);
    expect(mockSetConnectionError).toHaveBeenCalledWith("Invalid WebSocket URL");
  });

  it("should set RECONNECTING state on connection close for automatic reconnection", () => {
    // Mock valid device address and WebSocket URL
    mockGetDeviceAddress.mockReturnValue("192.168.1.100");
    mockGetWsUrl.mockReturnValue("ws://192.168.1.100:7497/api");

    const mockSetConnectionState = vi.fn();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(useStatusStore).mockImplementation((selector: any) =>
      selector({
        retryCount: 0,
        setConnected: vi.fn(),
        setConnectionState: mockSetConnectionState,
        setConnectionError: vi.fn(),
        setPlaying: vi.fn(),
        setGamesIndex: vi.fn(),
        setLastToken: vi.fn(),
        runQueue: null,
        setRunQueue: vi.fn(),
        writeQueue: "",
        setWriteQueue: vi.fn(),
        addDeviceHistory: vi.fn(),
        setDeviceHistory: vi.fn()
      })
    );

    render(<CoreApiWebSocket />);

    // Simulate WebSocket close event
    if (mockWebSocket.onclose) {
      mockWebSocket.onclose();
    }

    // When websocket-heartbeat-js calls onclose, it should set RECONNECTING state
    // because the library will automatically attempt to reconnect
    expect(mockSetConnectionState).toHaveBeenCalledWith(ConnectionState.RECONNECTING);
  });
});