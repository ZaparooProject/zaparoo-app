import { vi } from "vitest";

type NetworkStatusChangeCallback = (status: {
  connected: boolean;
  connectionType: string;
}) => void;

const listeners: Map<string, Set<NetworkStatusChangeCallback>> = new Map();

export const Network = {
  addListener: vi
    .fn()
    .mockImplementation(
      async (
        eventName: string,
        callback: NetworkStatusChangeCallback,
      ): Promise<{ remove: () => Promise<void> }> => {
        if (!listeners.has(eventName)) {
          listeners.set(eventName, new Set());
        }
        listeners.get(eventName)!.add(callback);
        return {
          remove: vi.fn().mockImplementation(async () => {
            listeners.get(eventName)?.delete(callback);
          }),
        };
      },
    ),
  removeAllListeners: vi.fn().mockImplementation(async () => {
    listeners.clear();
  }),
  getStatus: vi.fn().mockResolvedValue({
    connected: true,
    connectionType: "wifi",
  }),
};

/**
 * Test helper to simulate network status changes
 */
export const __simulateNetworkChange = (status: {
  connected: boolean;
  connectionType: string;
}) => {
  listeners.get("networkStatusChange")?.forEach((callback) => callback(status));
};

/**
 * Test helper to reset all listeners
 */
export const __resetNetworkListeners = () => {
  listeners.clear();
};
