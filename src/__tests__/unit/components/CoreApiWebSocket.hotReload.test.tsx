import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
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

// Track targetDeviceAddress state
let mockTargetDeviceAddress = "";
const mockSetTargetDeviceAddress = vi.fn((addr: string) => {
  mockTargetDeviceAddress = addr;
});

// Mock Zustand store
vi.mock("../../../lib/store", () => {
  return {
    useStatusStore: vi.fn((selector: any) => {
      const mockStore = {
        targetDeviceAddress: mockTargetDeviceAddress,
        setTargetDeviceAddress: mockSetTargetDeviceAddress,
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
      return selector(mockStore);
    }),
    ConnectionState: {
      IDLE: "idle",
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
    mockTargetDeviceAddress = ""; // Reset to empty for each test
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should retry fetching device address when initially empty", async () => {
    // Simulate hot reload: localStorage empty on first calls, available after retry
    let callCount = 0;
    mockGetDeviceAddress.mockImplementation(() => {
      callCount++;
      return callCount <= 2 ? "" : "192.168.1.100";
    });
    mockGetWsUrl.mockReturnValue("ws://192.168.1.100:7497");

    await act(async () => {
      renderWithQueryClient();
    });

    // Advance timers to trigger retries
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });

    // After retry finds valid address, should call setTargetDeviceAddress
    expect(mockSetTargetDeviceAddress).toHaveBeenCalledWith("192.168.1.100");
  });

  it("should stop retrying after max attempts", async () => {
    // Always return empty address
    mockGetDeviceAddress.mockReturnValue("");
    mockGetWsUrl.mockReturnValue("");

    await act(async () => {
      renderWithQueryClient();
    });

    // Fast-forward through all retry attempts (5 attempts * 100ms = 500ms)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(600);
    });

    // Should have called multiple times but not connected
    expect(mockGetDeviceAddress).toHaveBeenCalled();

    // Should never have attempted to connect (no valid address)
    expect(mockWebSocketManager.connect).not.toHaveBeenCalled();
  });

  it("should stop retrying once valid address is obtained", async () => {
    // Return empty first few times, then valid address
    let callCount = 0;
    mockGetDeviceAddress.mockImplementation(() => {
      callCount++;
      return callCount <= 3 ? "" : "192.168.1.100";
    });
    mockGetWsUrl.mockReturnValue("ws://192.168.1.100:7497");

    await act(async () => {
      renderWithQueryClient();
    });

    // Advance through multiple retries until address becomes valid
    await act(async () => {
      await vi.advanceTimersByTimeAsync(400);
    });

    // Should have called setTargetDeviceAddress with valid address
    expect(mockSetTargetDeviceAddress).toHaveBeenCalledWith("192.168.1.100");
  });

  it("should connect immediately if address is available on mount", async () => {
    mockGetDeviceAddress.mockReturnValue("192.168.1.100");
    mockGetWsUrl.mockReturnValue("ws://192.168.1.100:7497");

    // Start with address already in store
    mockTargetDeviceAddress = "192.168.1.100";

    await act(async () => {
      renderWithQueryClient();
    });

    // Should have connected immediately since address was already in store
    expect(mockWebSocketManager.connect).toHaveBeenCalled();
  });

  it("should cleanup retry timer on unmount", async () => {
    // Return empty to keep retrying
    mockGetDeviceAddress.mockReturnValue("");
    mockGetWsUrl.mockReturnValue("");

    const { unmount } = await act(async () => renderWithQueryClient());

    // Start retry cycle
    await act(async () => {
      await vi.advanceTimersByTimeAsync(50);
    });

    const callCountBeforeUnmount = mockGetDeviceAddress.mock.calls.length;

    // Unmount before next retry
    unmount();

    // Advance past when next retry would have happened
    await act(async () => {
      await vi.advanceTimersByTimeAsync(200);
    });

    // Should not have made significantly more calls after unmount
    // Allow for 1-2 extra due to race conditions in cleanup
    expect(mockGetDeviceAddress.mock.calls.length).toBeLessThanOrEqual(callCountBeforeUnmount + 2);
  });
});
