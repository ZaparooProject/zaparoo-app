/**
 * Tests for CoreAPI queuing behavior.
 *
 * These tests verify that CoreAPI properly queues requests when disconnected
 * and flushes them when connected.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { CoreAPI } from "../../../lib/coreApi";
import { Method } from "../../../lib/models";

describe("CoreAPI queuing", () => {
  let mockTransport: {
    send: ReturnType<typeof vi.fn>;
    isConnected: boolean;
    currentState: string;
  };

  beforeEach(() => {
    vi.useFakeTimers();

    // Create a mock transport that simulates disconnected state
    mockTransport = {
      send: vi.fn(),
      isConnected: false,
      currentState: "disconnected",
    };

    CoreAPI.setWsInstance(mockTransport as any);
  });

  afterEach(() => {
    // Use real timers - CoreAPI.reset() is called globally in test-setup.ts
    vi.useRealTimers();
  });

  describe("when disconnected", () => {
    it("should queue requests instead of sending immediately", async () => {
      mockTransport.isConnected = false;

      // Start a request - it should be queued
      const promise = CoreAPI.version();

      // Send should not have been called
      expect(mockTransport.send).not.toHaveBeenCalled();

      // Clean up - reject the queued request
      CoreAPI.reset();

      await expect(promise).rejects.toThrow("Request cancelled");
    });

    it("should queue multiple requests", async () => {
      mockTransport.isConnected = false;

      const promise1 = CoreAPI.version();
      const promise2 = CoreAPI.media();
      const promise3 = CoreAPI.tokens();

      // None should have been sent
      expect(mockTransport.send).not.toHaveBeenCalled();

      // Clean up
      CoreAPI.reset();

      await expect(promise1).rejects.toThrow("Request cancelled");
      await expect(promise2).rejects.toThrow("Request cancelled");
      await expect(promise3).rejects.toThrow("Request cancelled");
    });
  });

  describe("when connected", () => {
    it("should send requests immediately", async () => {
      mockTransport.isConnected = true;

      // Start the request - we'll need to clean it up after
      const promise = CoreAPI.version();

      expect(mockTransport.send).toHaveBeenCalledTimes(1);
      expect(mockTransport.send).toHaveBeenCalledWith(
        expect.stringContaining(Method.Version),
      );

      // Clean up the pending request - reset will reject it
      CoreAPI.reset();
      await expect(promise).rejects.toThrow("Request cancelled");
    });
  });

  describe("flushQueue", () => {
    it("should send queued requests when connection is established", async () => {
      // Queue requests while disconnected
      mockTransport.isConnected = false;

      const promise1 = CoreAPI.version();
      const promise2 = CoreAPI.media();

      expect(mockTransport.send).not.toHaveBeenCalled();

      // Simulate connection established
      mockTransport.isConnected = true;
      CoreAPI.flushQueue();

      // Both requests should now be sent
      expect(mockTransport.send).toHaveBeenCalledTimes(2);

      // Clean up
      CoreAPI.reset();
      await expect(promise1).rejects.toThrow();
      await expect(promise2).rejects.toThrow();
    });

    it("should drop stale requests older than 10 seconds", async () => {
      mockTransport.isConnected = false;

      const promise = CoreAPI.version();

      expect(mockTransport.send).not.toHaveBeenCalled();

      // Advance time past staleness threshold (10 seconds)
      vi.advanceTimersByTime(11000);

      // Connect and flush
      mockTransport.isConnected = true;
      CoreAPI.flushQueue();

      // Stale request should have been dropped, not sent
      expect(mockTransport.send).not.toHaveBeenCalled();

      // Promise should resolve with cancelled status
      const result = await promise;
      expect(result).toEqual({ cancelled: true });
    });

    it("should send fresh requests but drop stale ones", async () => {
      mockTransport.isConnected = false;

      const promise1 = CoreAPI.version();

      // Advance 8 seconds (still fresh)
      vi.advanceTimersByTime(8000);

      const promise2 = CoreAPI.media();

      // Advance 3 more seconds (first request now stale at 11s, second still fresh at 3s)
      vi.advanceTimersByTime(3000);

      // Connect and flush
      mockTransport.isConnected = true;
      CoreAPI.flushQueue();

      // Only the fresh request should be sent
      expect(mockTransport.send).toHaveBeenCalledTimes(1);
      expect(mockTransport.send).toHaveBeenCalledWith(
        expect.stringContaining(Method.Media),
      );

      // First promise should resolve with cancelled
      const result1 = await promise1;
      expect(result1).toEqual({ cancelled: true });

      // Clean up second promise
      CoreAPI.reset();
      await expect(promise2).rejects.toThrow();
    });
  });

  describe("reset", () => {
    it("should reject all queued requests on reset", async () => {
      mockTransport.isConnected = false;

      const promise1 = CoreAPI.version();
      const promise2 = CoreAPI.media();

      CoreAPI.reset();

      await expect(promise1).rejects.toThrow(
        "Request cancelled: connection reset",
      );
      await expect(promise2).rejects.toThrow(
        "Request cancelled: connection reset",
      );
    });

    it("should reject all pending responses on reset", async () => {
      mockTransport.isConnected = true;

      // Send a request (creates a pending response)
      const promise = CoreAPI.version();

      expect(mockTransport.send).toHaveBeenCalledTimes(1);

      // Reset before response arrives
      CoreAPI.reset();

      await expect(promise).rejects.toThrow(
        "Request cancelled: connection reset",
      );
    });
  });

  describe("abort signal handling", () => {
    it("should return cancelled immediately if signal already aborted before request", async () => {
      // When signal is already aborted before making the request,
      // the request should return cancelled immediately
      mockTransport.isConnected = true;

      const controller = new AbortController();
      controller.abort(); // Abort before making request

      const result = await CoreAPI.mediaSearch(
        { query: "test", systems: [] },
        controller.signal,
      );

      expect(result).toEqual({ cancelled: true });
      expect(mockTransport.send).not.toHaveBeenCalled();
    });

    it("should respect abort signal for queued requests aborted before flush", async () => {
      // When a request is queued and then aborted before flush,
      // it should resolve with cancelled when flushed
      mockTransport.isConnected = false;

      const controller = new AbortController();
      const promise = CoreAPI.mediaSearch(
        { query: "test", systems: [] },
        controller.signal,
      );

      // Abort while still queued
      controller.abort();

      // Connect and flush
      mockTransport.isConnected = true;
      CoreAPI.flushQueue();

      // Request should not be sent because it was aborted
      const result = await promise;
      expect(result).toEqual({ cancelled: true });
      expect(mockTransport.send).not.toHaveBeenCalled();
    });
  });

  describe("transport send error handling", () => {
    it("should reject if transport.send throws", async () => {
      mockTransport.isConnected = true;
      mockTransport.send.mockImplementation(() => {
        throw new Error("WebSocket not open");
      });

      const promise = CoreAPI.version();

      await expect(promise).rejects.toThrow("Failed to send request");
    });
  });
});
