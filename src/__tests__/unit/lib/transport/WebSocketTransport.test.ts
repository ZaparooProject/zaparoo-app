/**
 * Unit tests for WebSocketTransport
 *
 * These tests verify the WebSocketTransport class behavior by testing
 * the public API and state transitions without mocking the WebSocket itself.
 *
 * See WebSocketTransport.lifecycle.test.ts for MockWebSocket tests that
 * verify WebSocket event handling (onopen, onclose, onmessage, onerror).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { WebSocketTransport } from "../../../../lib/transport/WebSocketTransport";
import type { TransportState } from "../../../../lib/transport/types";

describe("WebSocketTransport", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("initial state", () => {
    it("should start in disconnected state", () => {
      const transport = new WebSocketTransport({
        deviceId: "test-device",
        url: "ws://localhost:7497",
      });

      expect(transport.state).toBe("disconnected");
      expect(transport.isConnected).toBe(false);
      expect(transport.hasEverConnected).toBe(false);
    });

    it("should have correct deviceId", () => {
      const transport = new WebSocketTransport({
        deviceId: "my-device-123",
        url: "ws://localhost:7497",
      });

      expect(transport.deviceId).toBe("my-device-123");
    });
  });

  describe("connect", () => {
    it("should transition to connecting state on connect()", () => {
      const transport = new WebSocketTransport({
        deviceId: "test-device",
        url: "ws://localhost:7497",
      });

      const stateChanges: TransportState[] = [];
      transport.setEventHandlers({
        onStateChange: (state) => stateChanges.push(state),
      });

      transport.connect();

      expect(transport.state).toBe("connecting");
      expect(stateChanges).toContain("connecting");

      transport.destroy();
    });

    it("should not connect if already connecting", () => {
      const transport = new WebSocketTransport({
        deviceId: "test-device",
        url: "ws://localhost:7497",
      });

      const stateChanges: TransportState[] = [];
      transport.setEventHandlers({
        onStateChange: (state) => stateChanges.push(state),
      });

      transport.connect();
      transport.connect(); // Second call should be ignored

      // Should only have one "connecting" state change
      expect(stateChanges.filter((s) => s === "connecting").length).toBe(1);

      transport.destroy();
    });

    it("should not connect after destroy", () => {
      const transport = new WebSocketTransport({
        deviceId: "test-device",
        url: "ws://localhost:7497",
      });

      transport.destroy();

      const stateChanges: TransportState[] = [];
      transport.setEventHandlers({
        onStateChange: (state) => stateChanges.push(state),
      });

      transport.connect();

      expect(transport.state).toBe("disconnected");
      expect(stateChanges).not.toContain("connecting");
    });

    it("should provide user-friendly error for invalid URL (e.g., invalid IP address)", () => {
      // Mock WebSocket class that throws DOMException for invalid URL (simulating browser behavior)
      const mockError = new DOMException(
        "The string did not match the expected pattern.",
        "SyntaxError",
      );

      class MockWebSocketThatThrows {
        constructor() {
          throw mockError;
        }
      }
      vi.stubGlobal("WebSocket", MockWebSocketThatThrows);

      try {
        const transport = new WebSocketTransport({
          deviceId: "192.168.1.286",
          url: "ws://192.168.1.286:7497/api/v0.1",
        });

        const onError = vi.fn();
        // Set handlers BEFORE connecting
        transport.setEventHandlers({ onError });

        transport.connect();

        // Should call onError with user-friendly message
        expect(onError).toHaveBeenCalledWith(
          expect.objectContaining({
            message: "Invalid device address format",
          }),
        );

        transport.destroy();
      } finally {
        // Always restore the original WebSocket
        vi.unstubAllGlobals();
      }
    });
  });

  describe("disconnect and destroy", () => {
    it("should transition to disconnected state on disconnect()", () => {
      const transport = new WebSocketTransport({
        deviceId: "test-device",
        url: "ws://localhost:7497",
      });

      transport.connect();
      expect(transport.state).toBe("connecting");

      transport.disconnect();
      expect(transport.state).toBe("disconnected");
    });

    it("should transition to disconnected state on destroy()", () => {
      const transport = new WebSocketTransport({
        deviceId: "test-device",
        url: "ws://localhost:7497",
      });

      transport.connect();
      transport.destroy();

      expect(transport.state).toBe("disconnected");
    });
  });

  describe("send behavior", () => {
    it("should throw when not connected", () => {
      const transport = new WebSocketTransport({
        deviceId: "test-device",
        url: "ws://localhost:7497",
      });

      // Send before connecting - should throw (no queuing at transport level)
      expect(() => transport.send('{"method": "test"}')).toThrow(
        "Cannot send message: WebSocket not open",
      );

      transport.destroy();
    });
  });

  describe("hasEverConnected flag", () => {
    it("should be false initially", () => {
      const transport = new WebSocketTransport({
        deviceId: "test-device",
        url: "ws://localhost:7497",
      });

      expect(transport.hasEverConnected).toBe(false);

      transport.destroy();
    });

    it("should remain false during connecting state", () => {
      const transport = new WebSocketTransport({
        deviceId: "test-device",
        url: "ws://localhost:7497",
      });

      transport.connect();
      expect(transport.state).toBe("connecting");
      expect(transport.hasEverConnected).toBe(false);

      transport.destroy();
    });
  });

  describe("immediateReconnect", () => {
    it("should not reconnect if destroyed", () => {
      const transport = new WebSocketTransport({
        deviceId: "test-device",
        url: "ws://localhost:7497",
      });

      transport.destroy();

      const stateChanges: TransportState[] = [];
      transport.setEventHandlers({
        onStateChange: (state) => stateChanges.push(state),
      });

      transport.immediateReconnect();

      expect(stateChanges).not.toContain("connecting");
    });
  });

  describe("pauseHeartbeat and resumeHeartbeat", () => {
    it("should not throw when called", () => {
      const transport = new WebSocketTransport({
        deviceId: "test-device",
        url: "ws://localhost:7497",
      });

      expect(() => transport.pauseHeartbeat()).not.toThrow();
      expect(() => transport.resumeHeartbeat()).not.toThrow();

      transport.destroy();
    });
  });

  describe("event handlers", () => {
    it("should accept event handlers", () => {
      const transport = new WebSocketTransport({
        deviceId: "test-device",
        url: "ws://localhost:7497",
      });

      const handlers = {
        onOpen: vi.fn(),
        onClose: vi.fn(),
        onError: vi.fn(),
        onMessage: vi.fn(),
        onStateChange: vi.fn(),
      };

      expect(() => transport.setEventHandlers(handlers)).not.toThrow();

      transport.destroy();
    });

    it("should call onStateChange when state changes", () => {
      const transport = new WebSocketTransport({
        deviceId: "test-device",
        url: "ws://localhost:7497",
      });

      const onStateChange = vi.fn();
      transport.setEventHandlers({ onStateChange });

      transport.connect();

      expect(onStateChange).toHaveBeenCalledWith("connecting");

      transport.destroy();
    });
  });
});
