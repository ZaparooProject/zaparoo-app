import { describe, it, expect } from "vitest";
import { useStatusStore, ConnectionState } from "./store";

describe("Store ConnectionState Integration", () => {
  it("should update connected boolean when connectionState is set to CONNECTED", () => {
    const { setConnectionState } = useStatusStore.getState();

    setConnectionState(ConnectionState.CONNECTED);

    const newState = useStatusStore.getState();
    expect(newState.connectionState).toBe(ConnectionState.CONNECTED);
    expect(newState.connected).toBe(true);
  });

  it("should treat RECONNECTING as connected for UI purposes", () => {
    const { setConnectionState } = useStatusStore.getState();

    setConnectionState(ConnectionState.RECONNECTING);

    const newState = useStatusStore.getState();
    expect(newState.connectionState).toBe(ConnectionState.RECONNECTING);
    expect(newState.connected).toBe(true);
  });
});
