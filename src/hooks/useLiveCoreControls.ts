import { useEffect, useRef } from "react";
import { useActiveDeviceKey } from "@/hooks/useActiveDeviceKey";
import { CoreAPI } from "@/lib/coreApi";
import { deviceRegistry } from "@/lib/devices/deviceRegistry";
import { ConnectionState, useStatusStore } from "@/lib/store";
import { connectionManager, type Transport } from "@/lib/transport";

export interface LiveCoreTarget {
  device: string;
  endpoint: string;
  transport: Transport | null;
  generation: number;
}

function currentDevice() {
  const registry = deviceRegistry.getSnapshot();
  const device = registry.activeRecordId ?? "";
  return {
    device,
    endpoint: registry.records[device]?.preferredEndpointId ?? "",
  };
}

function hasLiveTransport(device: string) {
  const status = useStatusStore.getState();
  const transport = connectionManager.getActiveTransport();
  return (
    device !== "" &&
    status.connected &&
    status.connectionState === ConnectionState.CONNECTED &&
    CoreAPI.isConnected() &&
    (!transport || (transport.deviceId === device && transport.isConnected))
  );
}

/** Cached media may remain visible, but user commands belong to a live session. */
export function useLiveCoreControls(onInvalidated?: () => void) {
  const deviceKey = useActiveDeviceKey();
  const connected = useStatusStore((state) => state.connected);
  const connectionState = useStatusStore((state) => state.connectionState);
  const generation = useRef(0);
  const invalidateCallback = useRef(onInvalidated);

  useEffect(() => {
    invalidateCallback.current = onInvalidated;
  }, [onInvalidated]);

  useEffect(() => {
    const invalidate = () => {
      generation.current += 1;
      invalidateCallback.current?.();
    };
    // Subscribe synchronously: even a disconnect/reconnect inside one React
    // batch invalidates commands already waiting behind an in-flight request.
    const unsubscribeStatus = useStatusStore.subscribe((state, previous) => {
      if (
        state.connected !== previous.connected ||
        state.connectionState !== previous.connectionState
      ) {
        invalidate();
      }
    });
    let previous = currentDevice();
    const unsubscribeDevice = deviceRegistry.subscribe(() => {
      const next = currentDevice();
      if (
        next.device !== previous.device ||
        next.endpoint !== previous.endpoint
      ) {
        previous = next;
        invalidate();
      }
    });
    return () => {
      generation.current += 1;
      unsubscribeStatus();
      unsubscribeDevice();
    };
  }, []);

  const captureTarget = (): LiveCoreTarget | null => {
    const { device, endpoint } = currentDevice();
    if (!hasLiveTransport(device)) return null;
    return {
      device,
      endpoint,
      transport: connectionManager.getActiveTransport(),
      generation: generation.current,
    };
  };
  const isCurrentTarget = (target: LiveCoreTarget | null): boolean => {
    if (!target || generation.current !== target.generation) return false;
    const current = currentDevice();
    return (
      current.device === target.device &&
      current.endpoint === target.endpoint &&
      connectionManager.getActiveTransport() === target.transport &&
      hasLiveTransport(current.device)
    );
  };

  return {
    available:
      connected &&
      connectionState === ConnectionState.CONNECTED &&
      hasLiveTransport(deviceKey),
    captureTarget,
    isCurrentTarget,
  };
}
