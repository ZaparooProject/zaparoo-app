import { useCallback, useEffect, useRef, useState } from "react";
import { CoreAPI, isHeldInputUnsupportedError } from "@/lib/coreApi";
import { ConnectionState, useStatusStore } from "@/lib/store";

// Matches Core's DefaultInputDelay between a tap's key down and key up, so a
// quick press still lasts long enough for frame-polled programs to see it.
const MIN_HOLD_MS = 40;

type HeldKey = {
  pointers: Set<number>;
  generation: number;
  pressedAt: number | null;
  tapped: boolean;
};

function holdName(keys: string): string {
  return /^\{(.+)\}$/.exec(keys)?.[1] ?? keys;
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Sends Controls remote input to Core. With held input, each key goes down when
 * its first pointer presses and up when its last pointer lifts, so several keys
 * can be held at once. Taps and holds share one queue to keep Core's order.
 */
export function useHeldRemoteInput(options: {
  heldInputAvailable: boolean;
  onDisconnected: () => void;
  onError: (error: unknown) => void;
}) {
  const { heldInputAvailable, onDisconnected, onError } = options;
  const connected = useStatusStore((state) => state.connected);
  const connectionState = useStatusStore((state) => state.connectionState);
  const [heldKeys, setHeldKeys] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const queueRef = useRef<Promise<void>>(Promise.resolve());
  const heldRef = useRef(new Map<string, HeldKey>());
  const pointerKeysRef = useRef(new Map<number, string>());
  const generationRef = useRef(0);
  const unsupportedRef = useRef(false);
  const previousConnectionStateRef = useRef(connectionState);
  const latestRef = useRef({ connected, onDisconnected, onError });

  useEffect(() => {
    latestRef.current = { connected, onDisconnected, onError };
  }, [connected, onDisconnected, onError]);

  const publish = useCallback(() => {
    setHeldKeys((current) =>
      current.size === 0 && heldRef.current.size === 0
        ? current
        : new Set(heldRef.current.keys()),
    );
  }, []);

  const enqueue = useCallback(
    (getKeys: () => Promise<string | null> | string | null) => {
      const run = queueRef.current.then(async () => {
        const keys = await getKeys();
        if (keys !== null) {
          await CoreAPI.inputKeyboard({ keys });
        }
      });
      queueRef.current = run.catch(() => undefined);
      return run;
    },
    [],
  );

  // Core releases everything a connection holds when an input request fails
  // or the socket closes, so local state is dropped without sending releases.
  const forgetHeldKeys = useCallback(() => {
    generationRef.current += 1;
    heldRef.current.clear();
    pointerKeysRef.current.clear();
    publish();
  }, [publish]);

  const sendTap = useCallback(
    (keys: string) => {
      if (!latestRef.current.connected) {
        latestRef.current.onDisconnected();
        return;
      }
      enqueue(() => keys).catch((error: unknown) => {
        latestRef.current.onError(error);
      });
    },
    [enqueue],
  );

  const press = useCallback(
    (keys: string, pointerId: number) => {
      if (!latestRef.current.connected) {
        latestRef.current.onDisconnected();
        return;
      }
      if (!heldInputAvailable || unsupportedRef.current) {
        sendTap(keys);
        return;
      }

      pointerKeysRef.current.set(pointerId, keys);
      const existing = heldRef.current.get(keys);
      if (existing) {
        existing.pointers.add(pointerId);
        return;
      }

      const held: HeldKey = {
        pointers: new Set([pointerId]),
        generation: generationRef.current,
        pressedAt: null,
        tapped: false,
      };
      heldRef.current.set(keys, held);
      publish();

      // Handlers attach to the request itself so they settle before a release
      // queued behind it reads `pressedAt`, `tapped` or the generation.
      enqueue(() => `{press:${holdName(keys)}}`).then(
        () => {
          held.pressedAt = Date.now();
        },
        (error: unknown) => {
          if (!isHeldInputUnsupportedError(error)) {
            forgetHeldKeys();
            latestRef.current.onError(error);
            return;
          }

          unsupportedRef.current = true;
          held.tapped = true;
          if (heldRef.current.get(keys) === held) {
            heldRef.current.delete(keys);
            held.pointers.forEach((id) => pointerKeysRef.current.delete(id));
            publish();
          }
          sendTap(keys);
        },
      );
    },
    [enqueue, forgetHeldKeys, heldInputAvailable, publish, sendTap],
  );

  const release = useCallback(
    (pointerId: number) => {
      const keys = pointerKeysRef.current.get(pointerId);
      if (keys === undefined) return;
      pointerKeysRef.current.delete(pointerId);

      const held = heldRef.current.get(keys);
      if (!held) return;
      held.pointers.delete(pointerId);
      if (held.pointers.size > 0) return;

      heldRef.current.delete(keys);
      publish();

      enqueue(async () => {
        if (held.tapped || held.generation !== generationRef.current) {
          return null;
        }
        if (held.pressedAt !== null) {
          const remaining = held.pressedAt + MIN_HOLD_MS - Date.now();
          if (remaining > 0) await wait(remaining);
        }
        return held.generation === generationRef.current
          ? `{release:${holdName(keys)}}`
          : null;
      }).catch((error: unknown) => {
        forgetHeldKeys();
        latestRef.current.onError(error);
      });
    },
    [enqueue, forgetHeldKeys, publish],
  );

  const releaseAll = useCallback(() => {
    if (!latestRef.current.connected) {
      forgetHeldKeys();
      return;
    }
    [...pointerKeysRef.current.keys()].forEach(release);
  }, [forgetHeldKeys, release]);

  useEffect(() => {
    const previous = previousConnectionStateRef.current;
    previousConnectionStateRef.current = connectionState;
    if (previous === connectionState) return;

    // A new socket starts with nothing held and may reach a different Core.
    unsupportedRef.current = false;
    if (previous === ConnectionState.CONNECTED) {
      forgetHeldKeys();
    }
  }, [connectionState, forgetHeldKeys]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") releaseAll();
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      releaseAll();
    };
  }, [releaseAll]);

  return { heldKeys, sendTap, press, release, releaseAll };
}
