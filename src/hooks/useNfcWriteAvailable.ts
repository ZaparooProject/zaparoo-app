import { useQuery } from "@tanstack/react-query";
import { CoreAPI } from "@/lib/coreApi";
import { usePreferencesStore } from "@/lib/preferencesStore";
import { ConnectionState, useStatusStore } from "@/lib/store";

/**
 * Whether a token can be written from here: on-device NFC, or a write-capable
 * reader on the live-connected Core. Core is only asked while `enabled`.
 */
export function useNfcWriteAvailable(
  deviceKey: string,
  enabled: boolean,
): boolean {
  const nfcAvailable = usePreferencesStore((state) => state.nfcAvailable);
  // A cached remote result must not keep writing enabled while Core is
  // reconnecting or gone; the write queue cannot reach its reader then.
  const liveConnected = useStatusStore(
    (state) => state.connectionState === ConnectionState.CONNECTED,
  );
  const writeCapabilityQuery = useQuery({
    queryKey: ["nfcWriteCapability", deviceKey],
    queryFn: () => CoreAPI.hasWriteCapableReader(),
    enabled: enabled && liveConnected && !nfcAvailable,
    staleTime: 60 * 1000,
    retry: false,
  });
  return nfcAvailable || (liveConnected && writeCapabilityQuery.data === true);
}
