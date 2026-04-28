/**
 * Connection context and hook for accessing connection state.
 *
 * Separated from ConnectionProvider to allow Fast Refresh to work properly
 * (React Fast Refresh only works when files export only components).
 */

import { createContext, useContext } from "react";
import type { DeviceConnection } from "@/lib/transport";

/**
 * Context value for connection state.
 */
export interface ConnectionContextValue {
  /** Active connection info */
  activeConnection: DeviceConnection | null;
  /** Whether the active device is connected */
  isConnected: boolean;
  /** Whether we have cached data and can show optimistic UI */
  hasData: boolean;
  /** Whether to show "Connecting..." indicator (initial connection to new device) */
  showConnecting: boolean;
  /** Whether to show "Reconnecting..." indicator (had prior successful connection) */
  showReconnecting: boolean;
  /** Open the pairing modal for the current device */
  openPairingModal: () => void;
}

export const ConnectionContext = createContext<ConnectionContextValue>({
  activeConnection: null,
  isConnected: false,
  hasData: false,
  showConnecting: false,
  showReconnecting: false,
  openPairingModal: () => {},
});

/**
 * Hook to access connection state from ConnectionProvider.
 */
export function useConnection() {
  return useContext(ConnectionContext);
}
