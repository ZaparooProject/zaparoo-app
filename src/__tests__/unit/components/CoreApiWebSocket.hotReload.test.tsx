import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useStatusStore } from "@/lib/store.ts";
import { CoreApiWebSocket } from "@/components/CoreApiWebSocket.tsx";

// Mock the coreApi functions
const mockGetDeviceAddress = vi.fn();
const mockGetWsUrl = vi.fn();

vi.mock("../../../lib/coreApi", () => {
  const mockCoreAPI = {
    setWsInstance: vi.fn(),
    media: vi.fn(() => Promise.resolve({ database: {}, active: [] })),
    tokens: vi.fn(() => Promise.resolve({ last: null })),
    processReceived: vi.fn(),
    flushQueue: vi.fn()
  };

  return {
    CoreAPI: mockCoreAPI,
    getDeviceAddress: () => mockGetDeviceAddress(),
    getWsUrl: () => mockGetWsUrl()
  };
});

// Mock WebSocketManager
const mockWebSocketManager = {
  connect: vi.fn(),
  destroy: vi.fn(),
  send: vi.fn(),
  callbacks: {} as any
};

vi.mock("../../../lib/websocketManager", () => ({
  WebSocketManager: vi.fn().mockImplementation((_config, callbacks) => {
    mockWebSocketManager.callbacks = callbacks;
    return mockWebSocketManager;
  }),
  WebSocketState: {
    IDLE: "idle",
    CONNECTING: "connecting",
    CONNECTED: "connected",
    RECONNECTING: "reconnecting",
    DISCONNECTED: "disconnected",
    ERROR: "error"
  }
}));

// Mock Preferences
vi.mock("@capacitor/preferences", () => ({
  Preferences: {
    get: vi.fn(() => Promise.resolve({ value: null })),
    set: vi.fn(() => Promise.resolve())
  }
}));

// Mock react-hot-toast
vi.mock("react-hot-toast", () => ({
  default: {
    success: vi.fn(),
    error: vi.fn()
  }
}));

// Mock i18next
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key
  })
}));

// Mock Zustand store
vi.mock("../../../lib/store", () => {
  const mockStore = {
    setConnectionState: vi.fn(),
    setConnectionStateWithGracePeriod: vi.fn(),
    clearGracePeriod: vi.fn(),
    setConnectionError: vi.fn(),
    setPlaying: vi.fn(),
    setGamesIndex: vi.fn(),
    setLastToken: vi.fn(),
    addDeviceHistory: vi.fn(),
    setDeviceHistory: vi.fn()
  };

  return {
    useStatusStore: vi.fn((selector: any) => selector(mockStore)),
    ConnectionState: {
      DISCONNECTED: "disconnected",
      CONNECTING: "connecting",
      CONNECTED: "connected",
      RECONNECTING: "reconnecting",
      ERROR: "error"
    }
  };
});

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

describe("CoreApiWebSocket Hot Reload", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should retry fetching device address when initially empty", async () => {
    // Simulate hot reload: localStorage empty on first calls, available after retry
    let callCount = 0;
    mockGetDeviceAddress.mockImplementation(() => {
      callCount++;
      // First call: useState initialization (empty)
      // Second call: first retry attempt (empty)
      // Third call: second retry attempt (now available)
      return callCount <= 2 ? "" : "192.168.1.100";
    });
    mockGetWsUrl.mockImplementation(() => {
      return callCount <= 2 ? "" : "ws://192.168.1.100:7497";
    });

    const mockSetConnectionError = vi.fn();
    const mockSetConnectionState = vi.fn();
    vi.mocked(useStatusStore).mockImplementation((selector: any) =>
      selector({
        setConnectionState: mockSetConnectionState,
        setConnectionStateWithGracePeriod: vi.fn(),
        clearGracePeriod: vi.fn(),
        setConnectionError: mockSetConnectionError,
        setPlaying: vi.fn(),
        setGamesIndex: vi.fn(),
        setLastToken: vi.fn(),
        addDeviceHistory: vi.fn(),
        setDeviceHistory: vi.fn()
      })
    );

    await act(async () => {
      renderWithQueryClient();
    });

    // Initially should have error
    expect(mockSetConnectionError).toHaveBeenCalledWith(
      "No device address configured"
    );

    // Advance timers to trigger retries
    await act(async () => {
      await vi.advanceTimersByTimeAsync(200);
    });

    // After retry, should have attempted to connect
    expect(mockWebSocketManager.connect).toHaveBeenCalled();
  });

  it("should stop retrying after max attempts", async () => {
    // Always return empty address
    mockGetDeviceAddress.mockReturnValue("");
    mockGetWsUrl.mockReturnValue("");

    const mockSetConnectionError = vi.fn();
    vi.mocked(useStatusStore).mockImplementation((selector: any) =>
      selector({
        setConnectionState: vi.fn(),
        setConnectionStateWithGracePeriod: vi.fn(),
        clearGracePeriod: vi.fn(),
        setConnectionError: mockSetConnectionError,
        setPlaying: vi.fn(),
        setGamesIndex: vi.fn(),
        setLastToken: vi.fn(),
        addDeviceHistory: vi.fn(),
        setDeviceHistory: vi.fn()
      })
    );

    renderWithQueryClient();

    // Fast-forward through all retry attempts (5 attempts * 100ms = 500ms)
    await vi.advanceTimersByTimeAsync(600);

    // Should have called: 1 (useState) + 5 (retry attempts) = 6 times
    expect(mockGetDeviceAddress).toHaveBeenCalledTimes(6);

    // Should never have attempted to connect
    expect(mockWebSocketManager.connect).not.toHaveBeenCalled();
  });

  it("should stop retrying once valid address is obtained", async () => {
    // Return empty first few times, then valid address
    let callCount = 0;
    mockGetDeviceAddress.mockImplementation(() => {
      callCount++;
      // First 3 calls: empty (useState + first retry attempts)
      // Fourth call onwards: valid
      return callCount <= 3 ? "" : "192.168.1.100";
    });
    mockGetWsUrl.mockImplementation(() => {
      return callCount <= 3 ? "" : "ws://192.168.1.100:7497";
    });

    vi.mocked(useStatusStore).mockImplementation((selector: any) =>
      selector({
        setConnectionState: vi.fn(),
        setConnectionStateWithGracePeriod: vi.fn(),
        clearGracePeriod: vi.fn(),
        setConnectionError: vi.fn(),
        setPlaying: vi.fn(),
        setGamesIndex: vi.fn(),
        setLastToken: vi.fn(),
        addDeviceHistory: vi.fn(),
        setDeviceHistory: vi.fn()
      })
    );

    await act(async () => {
      renderWithQueryClient();
    });

    // Advance through multiple retries until address becomes valid
    await act(async () => {
      await vi.advanceTimersByTimeAsync(400);
    });

    // Should have eventually connected since we got a valid address
    expect(mockWebSocketManager.connect).toHaveBeenCalled();

    // Should have called getDeviceAddress multiple times (but not all 5 maxAttempts)
    expect(mockGetDeviceAddress).toHaveBeenCalled();
    expect(mockGetDeviceAddress.mock.calls.length).toBeLessThan(6); // Less than maxAttempts + 1
  });

  it("should connect immediately if address is available on mount", () => {
    mockGetDeviceAddress.mockReturnValue("192.168.1.100");
    mockGetWsUrl.mockReturnValue("ws://192.168.1.100:7497");

    vi.mocked(useStatusStore).mockImplementation((selector: any) =>
      selector({
        setConnectionState: vi.fn(),
        setConnectionStateWithGracePeriod: vi.fn(),
        clearGracePeriod: vi.fn(),
        setConnectionError: vi.fn(),
        setPlaying: vi.fn(),
        setGamesIndex: vi.fn(),
        setLastToken: vi.fn(),
        addDeviceHistory: vi.fn(),
        setDeviceHistory: vi.fn()
      })
    );

    renderWithQueryClient();

    // Should have connected immediately without needing retries
    expect(mockWebSocketManager.connect).toHaveBeenCalled();
    // Only called once in useState, retry logic doesn't run since address is valid
    expect(mockGetDeviceAddress).toHaveBeenCalledTimes(1);
  });

  it("should cleanup retry timer on unmount", async () => {
    // Return empty to keep retrying
    mockGetDeviceAddress.mockReturnValue("");
    mockGetWsUrl.mockReturnValue("");

    vi.mocked(useStatusStore).mockImplementation((selector: any) =>
      selector({
        setConnectionState: vi.fn(),
        setConnectionStateWithGracePeriod: vi.fn(),
        clearGracePeriod: vi.fn(),
        setConnectionError: vi.fn(),
        setPlaying: vi.fn(),
        setGamesIndex: vi.fn(),
        setLastToken: vi.fn(),
        addDeviceHistory: vi.fn(),
        setDeviceHistory: vi.fn()
      })
    );

    const { unmount } = renderWithQueryClient();

    // Start retry cycle
    await vi.advanceTimersByTimeAsync(50);

    // Called once in useState, once in first retry attempt
    expect(mockGetDeviceAddress).toHaveBeenCalledTimes(2);

    // Unmount before next retry
    unmount();

    // Advance past when next retry would have happened
    await vi.advanceTimersByTimeAsync(100);

    // Should not have made additional calls after unmount
    expect(mockGetDeviceAddress).toHaveBeenCalledTimes(2);
  });
});
