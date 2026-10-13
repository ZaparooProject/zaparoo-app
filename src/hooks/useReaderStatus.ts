import { useQuery } from "@tanstack/react-query";
import { CoreAPI } from "@/lib/coreApi";
import { useActiveDeviceKey } from "@/hooks/useActiveDeviceKey";
import { useCoreFeature } from "@/hooks/useCoreFeature";
import { useStatusStore } from "@/lib/store";
import type { ReaderInfo } from "@/lib/models";
import { sortReaders } from "@/lib/readers";

export interface ReaderStatus {
  readers: ReaderInfo[];
  /** Reader responsible for the running media, where Core reports one. */
  holdOwnerReaderId?: string;
  isPending: boolean;
}

/**
 * Reader state for the home strip. Unlike reader settings this does not poll:
 * home is the screen most likely to sit open for hours, and Core pushes reader
 * connect and disconnect, which already invalidates this query.
 */
export function useReaderStatus(): ReaderStatus {
  const connected = useStatusStore((state) => state.connected);
  const deviceKey = useActiveDeviceKey();
  const readersFeature = useCoreFeature("readers");

  const query = useQuery({
    // Device-scoped: another Core's readers must never show for this one.
    queryKey: ["readers", deviceKey],
    queryFn: () => CoreAPI.readers(),
    enabled: connected && readersFeature.available,
    staleTime: 30_000,
  });

  return {
    readers: sortReaders(query.data?.readers ?? []),
    holdOwnerReaderId: query.data?.holdOwnerReaderId,
    isPending: query.isPending,
  };
}
