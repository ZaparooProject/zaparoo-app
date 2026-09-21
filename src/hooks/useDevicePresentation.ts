import { useTranslation } from "react-i18next";
import { useConnection } from "@/hooks/useConnection";
import { useConnectionPresentation } from "@/hooks/useConnectionPresentation";
import { satisfies as versionSatisfies } from "@/lib/coreVersion";
import {
  activeAddressOf,
  useDeviceRegistry,
  type DeviceRegistrySnapshot,
} from "@/lib/devices/deviceRegistry";
import { useStatusStore } from "@/lib/store";

const selectRegistryHydrated = (snapshot: DeviceRegistrySnapshot) =>
  snapshot.hydrated;

function activeRecordName(state: DeviceRegistrySnapshot): string | undefined {
  const record = state.activeRecordId
    ? state.records[state.activeRecordId]
    : undefined;
  return record?.name;
}

export type ConnectionUIState =
  | "connecting"
  | "reconnecting"
  | "connected"
  | "unavailable"
  | "networkUnavailable"
  | "error"
  | "disconnected"
  | "pairingRequired";

/**
 * The single reading of how the connection is doing. Shared so the home page's
 * device pill and the settings device card can never disagree about it.
 */
export function useConnectionUiState(connectionError?: string) {
  const { isConnected, showConnecting, showReconnecting } = useConnection();
  const connectionPresentation = useConnectionPresentation({ immediate: true });
  const encryptionState = useStatusStore((s) => s.encryptionState);
  const pairingRequired = useStatusStore((s) => s.pairingRequired);
  const savedAddress = useDeviceRegistry(activeAddressOf);
  const registryHydrated = useDeviceRegistry(selectRegistryHydrated);

  const derive = (): ConnectionUIState => {
    // Devices are read from storage asynchronously, so on a cold start there is
    // a moment where a user who has a saved device looks like one who has none.
    // Hold the spinner rather than flashing the "enter an address" placeholder
    // and snatching it back.
    if (!registryHydrated) return "connecting";
    if (!savedAddress) return "disconnected";
    // Pairing-required outranks reconnecting/error so the user sees the real
    // blocker instead of a generic "Reconnecting..." spinner that won't resolve
    // without their action.
    if (pairingRequired) return "pairingRequired";
    // Confirmed network and prolonged Core outages outrank optimistic transport
    // state, including the open-but-unverified handshake window.
    if (connectionPresentation.kind === "networkUnavailable") {
      return "networkUnavailable";
    }
    if (connectionPresentation.kind === "unavailable") return "unavailable";
    // Initial transport failures remain actionable even if the socket briefly
    // opened. Routine reconnect errors stay behind reconnecting presentation.
    if (connectionError && !showReconnecting) return "error";
    // The transport flips to "connected" when the WebSocket opens, before the
    // server has confirmed the encryption mode. Hold the UI in connecting/
    // reconnecting until the consumer learns the mode.
    if (isConnected && encryptionState === "unknown") {
      return showReconnecting ? "reconnecting" : "connecting";
    }
    if (isConnected) return "connected";
    if (showReconnecting) return "reconnecting";
    if (showConnecting) return "connecting";
    return "disconnected";
  };

  return {
    uiState: derive(),
    savedAddress,
    registryHydrated,
    encryptionState,
  };
}

export interface ActiveDeviceSummary {
  /** The name the user gave this device, when they gave it one. */
  name: string | null;
  address: string;
  versionLabel?: string;
  deviceDetails?: string;
  clientRoleLabel?: string;
}

/** Identity of the device currently selected, as shown to the user. */
export function useActiveDeviceSummary(): ActiveDeviceSummary {
  const { t } = useTranslation();
  const address = useDeviceRegistry(activeAddressOf);
  const name = useDeviceRegistry(activeRecordName);
  const coreVersion = useStatusStore((state) => state.coreVersion);
  const corePlatform = useStatusStore((state) => state.corePlatform);
  const currentClient = useStatusStore((state) => state.currentClient);

  const versionLabel =
    coreVersion !== null
      ? `${/^\d+\.\d+\.\d+/.test(coreVersion) ? "v" : ""}${coreVersion}`
      : undefined;
  const deviceDetails = versionLabel
    ? corePlatform
      ? `${corePlatform} (${versionLabel})`
      : versionLabel
    : undefined;
  const clientRole =
    coreVersion !== null && versionSatisfies(coreVersion, "2.16.0")
      ? currentClient?.role
      : null;
  const clientRoleLabel =
    clientRole === "admin"
      ? t("connection.clientRoleAdmin")
      : clientRole === "member"
        ? t("connection.clientRoleMember")
        : undefined;

  return {
    name: name ?? null,
    address,
    versionLabel,
    deviceDetails,
    clientRoleLabel,
  };
}
