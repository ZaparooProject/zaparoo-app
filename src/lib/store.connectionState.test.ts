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

  it("should increment retryCount when retryConnection is called", () => {
    const initialState = useStatusStore.getState();
    const initialRetryCount = initialState.retryCount;

    const { retryConnection } = useStatusStore.getState();
    retryConnection();

    const newState = useStatusStore.getState();
    expect(newState.retryCount).toBe(initialRetryCount + 1);
  });
});
