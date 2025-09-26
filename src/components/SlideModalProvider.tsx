import { useRef, useCallback, ReactNode } from "react";
import { SlideModalContext, SlideModalManager } from "../hooks/useSlideModalManager";

export const SlideModalProvider = ({ children }: { children: ReactNode }) => {
  const modals = useRef<Map<string, () => void>>(new Map());

  const registerModal = useCallback((id: string, closeFunction: () => void) => {
    modals.current.set(id, closeFunction);
  }, []);

  const unregisterModal = useCallback((id: string) => {
    modals.current.delete(id);
  }, []);

  const closeAllExcept = useCallback((exceptId: string) => {
    modals.current.forEach((closeFunction, id) => {
      if (id !== exceptId) {
        closeFunction();
      }
    });
  }, []);

  const manager: SlideModalManager = {
    registerModal,
    unregisterModal,
    closeAllExcept
  };

  return (
    <SlideModalContext.Provider value={manager}>
      {children}
    </SlideModalContext.Provider>
  );
};