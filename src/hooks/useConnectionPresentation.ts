import { useEffect, useState } from "react";
import { useConnection } from "@/hooks/useConnection";
import { useStatusStore } from "@/lib/store";

export const CONNECTION_STATUS_REVEAL_MS = 1_000;
export const CONNECTION_UNAVAILABLE_MS = 10_000;
export const CONNECTION_RESTORED_MS = 3_000;

export type ConnectionPresentationKind =
  | "hidden"
  | "connecting"
  | "reconnecting"
  | "unavailable"
  | "networkUnavailable";

interface ConnectionPresentation {
  kind: ConnectionPresentationKind;
  visible: boolean;
}

export function useConnectionPresentation(options?: {
  immediate?: boolean;
}): ConnectionPresentation {
  const { activeConnection, showReconnecting } = useConnection();
  const connectionIssueStartedAt = useStatusStore(
    (state) => state.connectionIssueStartedAt,
  );
  const networkAvailable = useStatusStore((state) => state.networkAvailable);
  const pairingRequired = useStatusStore((state) => state.pairingRequired);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (connectionIssueStartedAt == null) return;

    const elapsed = Date.now() - connectionIssueStartedAt;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const scheduleUpdate = (threshold: number) => {
      const delay = Math.max(0, threshold - elapsed);
      timers.push(setTimeout(() => setNow(Date.now()), delay));
    };

    scheduleUpdate(CONNECTION_STATUS_REVEAL_MS);
    scheduleUpdate(CONNECTION_UNAVAILABLE_MS);

    return () => timers.forEach(clearTimeout);
  }, [connectionIssueStartedAt]);

  if (connectionIssueStartedAt == null || pairingRequired) {
    return { kind: "hidden", visible: false };
  }

  if (networkAvailable === false) {
    return { kind: "networkUnavailable", visible: true };
  }

  const elapsed = now - connectionIssueStartedAt;
  if (elapsed >= CONNECTION_UNAVAILABLE_MS) {
    return { kind: "unavailable", visible: true };
  }

  const reconnecting =
    showReconnecting ||
    (activeConnection?.state !== "connected" &&
      (activeConnection?.hasConnectedBefore === true ||
        activeConnection?.hasData === true));
  const kind = reconnecting ? "reconnecting" : "connecting";

  if (options?.immediate || elapsed >= CONNECTION_STATUS_REVEAL_MS) {
    return { kind, visible: true };
  }

  return { kind: "hidden", visible: false };
}
