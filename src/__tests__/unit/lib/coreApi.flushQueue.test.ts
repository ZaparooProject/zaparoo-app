/**
 * Unit tests for CoreAPI flushQueue TTL functionality
 *
 * Tests that stale requests are dropped during queue flush
 * to prevent zombie requests from old connections.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { CoreAPI } from "../../../lib/coreApi";
import { Method } from "../../../lib/models";

// Mock logger
vi.mock("../../../lib/logger", () => ({
  logger: {
    log: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

describe("CoreAPI flushQueue TTL", () => {
  const mockSend = vi.fn();
  const mockTransport = {
    send: mockSend,
    isConnected: false,
    currentState: "disconnected",
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    CoreAPI.reset();
  });

  afterEach(() => {
    vi.useRealTimers();
    CoreAPI.reset();
  });

  it("should drop requests older than 10 seconds during flush", async () => {
    // Set up transport that's not connected yet
    mockTransport.isConnected = false;
    CoreAPI.setWsInstance(mockTransport as never);

    // Queue a request
    const promise1 = CoreAPI.call(Method.Media);

    // Advance time by 11 seconds (past the 10s TTL)
    vi.advanceTimersByTime(11000);

    // Now connect and flush
    mockTransport.isConnected = true;
    CoreAPI.flushQueue();

    // The stale request should resolve with cancelled status
    const result = await promise1;
    expect(result).toEqual({ cancelled: true });

    // Send should not have been called for stale request
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("should process fresh requests during flush", async () => {
    // Set up transport that's not connected yet
    mockTransport.isConnected = false;
    CoreAPI.setWsInstance(mockTransport as never);

    // Queue a request
    CoreAPI.call(Method.Media);

    // Advance time by only 5 seconds (within TTL)
    vi.advanceTimersByTime(5000);

    // Now connect and flush
    mockTransport.isConnected = true;
    CoreAPI.flushQueue();

    // Send should have been called for fresh request
    expect(mockSend).toHaveBeenCalledTimes(1);
  });

  it("should handle mixed fresh and stale requests", async () => {
    // Set up transport that's not connected yet
    mockTransport.isConnected = false;
    CoreAPI.setWsInstance(mockTransport as never);

    // Queue first request
    const stalePromise = CoreAPI.call(Method.Media);

    // Advance time by 11 seconds
    vi.advanceTimersByTime(11000);

    // Queue second request (fresh)
    CoreAPI.call(Method.Tokens);

    // Now connect and flush
    mockTransport.isConnected = true;
    CoreAPI.flushQueue();

    // Stale request should be cancelled
    const staleResult = await stalePromise;
    expect(staleResult).toEqual({ cancelled: true });

    // Only fresh request should have been sent
    expect(mockSend).toHaveBeenCalledTimes(1);
    expect(mockSend).toHaveBeenCalledWith(
      expect.stringContaining('"method":"tokens"'),
    );
  });

  it("should not call send when all requests are stale", async () => {
    // Set up transport that's not connected yet
    mockTransport.isConnected = false;
    CoreAPI.setWsInstance(mockTransport as never);

    // Queue multiple requests
    CoreAPI.call(Method.Media);
    CoreAPI.call(Method.Tokens);
    CoreAPI.call(Method.Version);

    // Advance time past TTL
    vi.advanceTimersByTime(15000);

    // Now connect and flush
    mockTransport.isConnected = true;
    CoreAPI.flushQueue();

    // No requests should have been sent
    expect(mockSend).not.toHaveBeenCalled();
  });
});
