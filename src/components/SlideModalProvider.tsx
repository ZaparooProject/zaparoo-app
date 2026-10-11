import {
  useRef,
  useCallback,
  useMemo,
  useSyncExternalStore,
  ReactNode,
} from "react";
import {
  SlideModalContext,
  SlideModalManager,
  type SlideModalRegistrationOptions,
} from "@/hooks/useSlideModalManager";

export const SlideModalProvider = ({ children }: { children: ReactNode }) => {
  const modals = useRef<
    Map<
      string,
      { closeFunction: () => void; blocking: boolean; overlay: boolean }
    >
  >(new Map());

  const listeners = useRef(new Set<() => void>());
  const notify = useCallback(() => {
    listeners.current.forEach((listener) => listener());
  }, []);
  const subscribe = useCallback((listener: () => void) => {
    listeners.current.add(listener);
    return () => {
      listeners.current.delete(listener);
    };
  }, []);
  const getOverlayOwnerId = useCallback(() => {
    let ownerId: string | null = null;
    modals.current.forEach((modal, id) => {
      if (modal.overlay) ownerId = id;
    });
    return ownerId;
  }, []);
  const activeModalId = useSyncExternalStore(
    subscribe,
    getOverlayOwnerId,
    () => null,
  );
  const hasOpenModalExcept = useCallback(
    (exceptId: string) =>
      Array.from(modals.current.keys()).some((id) => id !== exceptId),
    [],
  );

  const registerModal = useCallback(
    (
      id: string,
      closeFunction: () => void,
      options?: SlideModalRegistrationOptions,
    ) => {
      modals.current.set(id, {
        closeFunction,
        blocking: options?.blocking === true,
        overlay: options?.overlay === true,
      });
      notify();
    },
    [notify],
  );

  const unregisterModal = useCallback(
    (id: string) => {
      if (modals.current.delete(id)) notify();
    },
    [notify],
  );

  const closeAllExcept = useCallback((exceptId: string): boolean => {
    const blocked = Array.from(modals.current.entries()).some(
      ([id, modal]) => id !== exceptId && modal.blocking,
    );
    if (blocked) return false;

    modals.current.forEach((modal, id) => {
      if (id !== exceptId) modal.closeFunction();
    });
    return true;
  }, []);

  const manager: SlideModalManager = useMemo(
    () => ({
      ownsOverlay: true,
      registerModal,
      unregisterModal,
      closeAllExcept,
      hasOpenModalExcept,
      subscribe,
    }),
    [
      registerModal,
      unregisterModal,
      closeAllExcept,
      hasOpenModalExcept,
      subscribe,
    ],
  );

  return (
    <SlideModalContext.Provider value={manager}>
      {children}
      <div
        data-testid="modal-overlay"
        data-focus-trap-exempt
        className="fixed inset-0 z-40 bg-black/60 transition-opacity duration-200 ease-in-out"
        style={{
          opacity: activeModalId === null ? 0 : 1,
          pointerEvents: activeModalId === null ? "none" : "auto",
        }}
        onClick={() => {
          const ownerId = getOverlayOwnerId();
          const owner =
            ownerId === null ? undefined : modals.current.get(ownerId);
          if (owner && !owner.blocking) owner.closeFunction();
        }}
        aria-hidden="true"
      />
    </SlideModalContext.Provider>
  );
};
