import { useQuery } from "@tanstack/react-query";
import { CoreAPI } from "@/lib/coreApi";
import { usePreferencesStore } from "@/lib/preferencesStore";
import { useStatusStore } from "@/lib/store";

/**
 * Whether a token can be written from here: on-device NFC, or a write-capable
 * reader on the connected Core. Core is only asked while `enabled`.
 */
export function useNfcWriteAvailable(
  deviceKey: string,
  enabled: boolean,
): boolean {
  const nfcAvailable = usePreferencesStore((state) => state.nfcAvailable);
  const connected = useStatusStore((state) => state.connected);
  const writeCapabilityQuery = useQuery({
    queryKey: ["nfcWriteCapability", deviceKey],
    queryFn: () => CoreAPI.hasWriteCapableReader(),
    enabled: enabled && connected && !nfcAvailable,
    staleTime: 60 * 1000,
    retry: false,
  });
  return nfcAvailable || writeCapabilityQuery.data === true;
}
