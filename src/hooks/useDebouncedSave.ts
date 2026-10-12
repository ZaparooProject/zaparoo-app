import { useCallback, useEffect, useRef, useState } from "react";

interface DebouncedSaveOptions<T> {
  /** The saved value in draft form; undefined until it has loaded. */
  saved: T | undefined;
  /** Normalised identity of a value, used to tell a real change from a retype. */
  serialize: (value: T) => string;
  /** Return false for input that must not be written, such as an empty field. */
  canSave?: (draft: T) => boolean;
  /** Writes the draft. Reject to report failure; the draft then reverts. */
  save: (draft: T) => Promise<unknown>;
  enabled?: boolean;
  delayMs?: number;
}

// Never equal to a serialized value, so the next render adopts `saved` again.
const RESYNC = Symbol("resync");

/**
 * An editable draft of a saved value that writes itself after a pause.
 *
 * - Input rejected by `canSave` is never written.
 * - A pending write is flushed, not dropped, when the owner unmounts.
 * - A saved value arriving while the user is typing does not replace the draft.
 * - After a write settles the draft follows the saved value again, so a failed
 *   or normalised write never leaves an unsaved value on screen.
 */
export function useDebouncedSave<T>(
  options: DebouncedSaveOptions<T>,
): [T | undefined, (next: T) => void] {
  const { saved, serialize } = options;
  const savedKey = saved === undefined ? undefined : serialize(saved);

  const [draft, setDraftState] = useState<T | undefined>(saved);
  const [dirty, setDirty] = useState(false);
  const [syncedKey, setSyncedKey] = useState<string | symbol | undefined>(
    savedKey,
  );

  if (savedKey !== syncedKey) {
    setSyncedKey(savedKey);
    if (!dirty || (draft !== undefined && serialize(draft) === savedKey)) {
      setDraftState(saved);
      setDirty(false);
    }
  }

  const optionsRef = useRef(options);
  useEffect(() => {
    optionsRef.current = options;
  });

  const mountedRef = useRef(true);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRef = useRef<T | undefined>(undefined);
  const latestKeyRef = useRef<string | undefined>(undefined);

  const flush = useCallback(() => {
    if (timerRef.current === null) return;
    clearTimeout(timerRef.current);
    timerRef.current = null;

    const pending = pendingRef.current as T;
    const { save, serialize: serializePending } = optionsRef.current;
    const key = serializePending(pending);
    const settle = () => {
      // Newer typing owns the draft; only the latest write releases it.
      if (!mountedRef.current || latestKeyRef.current !== key) return;
      setDirty(false);
      setSyncedKey(RESYNC);
    };
    // Started synchronously so a flush during unmount is not lost. The saver
    // reports its own failure.
    let write: Promise<unknown>;
    try {
      write = Promise.resolve(save(pending));
    } catch (error) {
      write = Promise.reject(error);
    }
    write.then(settle, settle);
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      flush();
    };
  }, [flush]);

  const setDraft = useCallback(
    (next: T) => {
      const current = optionsRef.current;
      const key = current.serialize(next);
      latestKeyRef.current = key;
      setDraftState(next);

      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }

      const currentSavedKey =
        current.saved === undefined
          ? undefined
          : current.serialize(current.saved);
      if (key === currentSavedKey) {
        setDirty(false);
        return;
      }

      setDirty(true);
      if (
        current.enabled === false ||
        current.saved === undefined ||
        (current.canSave && !current.canSave(next))
      ) {
        return;
      }

      pendingRef.current = next;
      timerRef.current = setTimeout(flush, current.delayMs ?? 500);
    },
    [flush],
  );

  return [draft, setDraft];
}
