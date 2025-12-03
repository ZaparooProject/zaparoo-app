import { describe, it, expect } from "vitest";
import { ConnectionState, useStatusStore } from "../../lib/store";

describe("Cold Start Behavior", () => {
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

  it("should integrate with useDataCache for immediate data loading", () => {
    // Test that App.tsx integration with useDataCache works
    const { readFileSync } = require("fs");
    const { resolve } = require("path");

    const appPath = resolve(__dirname, "../../App.tsx");
    const appSource = readFileSync(appPath, "utf-8");

    // Verify App component imports and calls useDataCache
    expect(appSource).toContain("useDataCache");
    expect(appSource).toMatch(/useDataCache\(\)/);
  });
});
