import { vi, type MockInstance } from "vitest";

// Helper to wait for async operations
export const waitFor = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms));

// WebSocket readyState constants
export const WebSocketState = {
  CONNECTING: 0,
  OPEN: 1,
  CLOSING: 2,
  CLOSED: 3,
} as const;

// Helper to create a mock WebSocket that can be controlled in tests
export const createMockWebSocket = () => {
  const mockWs: {
    CONNECTING: 0;
    OPEN: 1;
    CLOSING: 2;
    CLOSED: 3;
    send: ReturnType<typeof vi.fn>;
    close: ReturnType<typeof vi.fn>;
    addEventListener: ReturnType<typeof vi.fn>;
    removeEventListener: ReturnType<typeof vi.fn>;
    readyState: 0 | 1 | 2 | 3;
    url: string;
    onopen: ((event: Event) => void) | null;
    onclose: ((event: CloseEvent) => void) | null;
    onmessage: ((event: MessageEvent) => void) | null;
    onerror: ((event: Event) => void) | null;
  } = {
    // Static constants matching WebSocket spec
    CONNECTING: WebSocketState.CONNECTING,
    OPEN: WebSocketState.OPEN,
    CLOSING: WebSocketState.CLOSING,
    CLOSED: WebSocketState.CLOSED,
    // Instance properties
    send: vi.fn(),
    close: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    readyState: WebSocketState.OPEN,
    url: "ws://test:7497/api/v0.1",
    onopen: null,
    onclose: null,
    onmessage: null,
    onerror: null,
  };

  // Helper methods to simulate events
  const simulateOpen = () => {
    mockWs.readyState = WebSocketState.OPEN;
    if (mockWs.onopen) mockWs.onopen(new Event("open"));
  };

  const simulateMessage = (data: string) => {
    if (mockWs.onmessage)
      mockWs.onmessage(new MessageEvent("message", { data }));
  };

  const simulateClose = (code = 1000, reason = "") => {
    mockWs.readyState = WebSocketState.CLOSED;
    if (mockWs.onclose)
      mockWs.onclose(new CloseEvent("close", { code, reason }));
  };

  const simulateError = () => {
    if (mockWs.onerror) mockWs.onerror(new Event("error"));
  };

  return {
    mockWs,
    simulateOpen,
    simulateMessage,
    simulateClose,
    simulateError,
  };
};

// Helper to mock console methods using vi.spyOn for proper restoration
export const mockConsole = () => {
  const spies: {
    log: MockInstance;
    error: MockInstance;
    warn: MockInstance;
    debug: MockInstance;
    info: MockInstance;
  } = {
    log: vi.spyOn(console, "log").mockImplementation(() => {}),
    error: vi.spyOn(console, "error").mockImplementation(() => {}),
    warn: vi.spyOn(console, "warn").mockImplementation(() => {}),
    debug: vi.spyOn(console, "debug").mockImplementation(() => {}),
    info: vi.spyOn(console, "info").mockImplementation(() => {}),
  };

  const restore = () => {
    spies.log.mockRestore();
    spies.error.mockRestore();
    spies.warn.mockRestore();
    spies.debug.mockRestore();
    spies.info.mockRestore();
  };

  return { ...spies, restore };
};
