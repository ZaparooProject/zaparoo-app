import { useRef, useCallback, ReactNode } from "react";
import {
  SlideModalContext,
  SlideModalManager,
  type SlideModalRegistrationOptions,
} from "@/hooks/useSlideModalManager";

export const SlideModalProvider = ({ children }: { children: ReactNode }) => {
  const modals = useRef<
    Map<string, { closeFunction: () => void; blocking: boolean }>
  >(new Map());

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
    },
    [],
  );

  const unregisterModal = useCallback((id: string) => {
    modals.current.delete(id);
  }, []);

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

  const manager: SlideModalManager = {
    registerModal,
    unregisterModal,
    closeAllExcept,
  };

  return (
    <SlideModalContext.Provider value={manager}>
      {children}
    </SlideModalContext.Provider>
  );
};
