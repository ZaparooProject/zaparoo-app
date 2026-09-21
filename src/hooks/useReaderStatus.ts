import { useQuery } from "@tanstack/react-query";
import { CoreAPI } from "@/lib/coreApi";
import { useCoreFeature } from "@/hooks/useCoreFeature";
import { useStatusStore } from "@/lib/store";
import type { ReaderInfo } from "@/lib/models";

export interface ReaderStatus {
  readers: ReaderInfo[];
  /** Reader responsible for the running media, where Core reports one. */
  holdOwnerReaderId?: string;
  isPending: boolean;
  available: boolean;
}

/**
 * Reader state for the home strip. Unlike reader settings this does not poll:
 * home is the screen most likely to sit open for hours, and Core pushes reader
 * connect and disconnect, which already invalidates this query.
 */
export function useReaderStatus(): ReaderStatus {
  const connected = useStatusStore((state) => state.connected);
  const readersFeature = useCoreFeature("readers");

  const query = useQuery({
    queryKey: ["readers"],
    queryFn: () => CoreAPI.readers(),
    enabled: connected && readersFeature.available,
    staleTime: 30_000,
  });

  return {
    readers: query.data?.readers ?? [],
    holdOwnerReaderId: query.data?.holdOwnerReaderId,
    isPending: query.isPending,
    available: readersFeature.available,
  };
}
