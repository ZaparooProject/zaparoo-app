import { useRef, useCallback, useMemo, ReactNode } from "react";
import {
  SlideModalContext,
  SlideModalManager,
  type SlideModalRegistrationOptions,
} from "@/hooks/useSlideModalManager";

export const SlideModalProvider = ({ children }: { children: ReactNode }) => {
  const modals = useRef<
    Map<string, { closeFunction: () => void; blocking: boolean }>
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
    </SlideModalContext.Provider>
  );
};
