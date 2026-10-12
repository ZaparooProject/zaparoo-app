import { useCallback, useState } from "react";
import { useMetadataDetailsReturn } from "@/hooks/useMetadataDetailsReturn";
import type { MediaBrowseEntry } from "@/lib/models";

/**
 * Selection for a page-owned game details surface. Reopens the details that
 * metadata exploration left from when Back returns to this history entry.
 */
export function useReturnableMediaDetails(owner: string, deviceKey: string) {
  const { entry: returnedEntry, forget } = useMetadataDetailsReturn(
    owner,
    deviceKey,
  );
  const [entry, setEntry] = useState<MediaBrowseEntry | null>(
    () => returnedEntry,
  );
  const select = useCallback(
    (next: MediaBrowseEntry | null) => {
      forget();
      setEntry(next);
    },
    [forget],
  );
  return { entry, select };
}
