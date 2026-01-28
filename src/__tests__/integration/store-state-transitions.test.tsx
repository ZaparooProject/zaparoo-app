import { describe, it, expect, beforeEach } from "vitest";
import { ConnectionState, useStatusStore } from "../../lib/store";

describe("Store State Transitions", () => {
  beforeEach(() => {
    // Reset store state before each test
    useStatusStore.setState({
      connectionState: ConnectionState.IDLE,
      connected: false,
    });
  });

  it("should initialize with proper connection state for optimized startup", () => {
    // Test that the store can be set to CONNECTING state instead of DISCONNECTED
    // This simulates the optimized cold start where we show "Connecting" immediately

    const initialState = useStatusStore.getState();
    expect(initialState.connectionState).toBe(ConnectionState.IDLE);
    expect(initialState.connected).toBe(false);

    // Simulate WebSocket service setting connection state to CONNECTING on startup
    useStatusStore.getState().setConnectionState(ConnectionState.CONNECTING);

    const connectingState = useStatusStore.getState();
    expect(connectingState.connectionState).toBe(ConnectionState.CONNECTING);
    expect(connectingState.connected).toBe(false); // Still false until actually connected

    // Verify that when connection is established, both states are updated
    useStatusStore.getState().setConnectionState(ConnectionState.CONNECTED);

    const connectedState = useStatusStore.getState();
    expect(connectedState.connectionState).toBe(ConnectionState.CONNECTED);
    expect(connectedState.connected).toBe(true); // Auto-synced by store
  });

  it("should handle disconnection state transitions correctly", () => {
    // Start from connected state
    useStatusStore.getState().setConnectionState(ConnectionState.CONNECTED);
    expect(useStatusStore.getState().connected).toBe(true);

    // Simulate disconnection
    useStatusStore.getState().setConnectionState(ConnectionState.DISCONNECTED);

    const disconnectedState = useStatusStore.getState();
    expect(disconnectedState.connectionState).toBe(
      ConnectionState.DISCONNECTED,
    );
    expect(disconnectedState.connected).toBe(false);
  });

  it("should handle reconnecting state correctly", () => {
    // Start from connected state
    useStatusStore.getState().setConnectionState(ConnectionState.CONNECTED);

    // Simulate reconnection attempt
    useStatusStore.getState().setConnectionState(ConnectionState.RECONNECTING);

    const reconnectingState = useStatusStore.getState();
    expect(reconnectingState.connectionState).toBe(
      ConnectionState.RECONNECTING,
    );
    // RECONNECTING is treated as "connected enough" to show cached data and enable UI
    expect(reconnectingState.connected).toBe(true);
  });
});
