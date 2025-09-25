import { createContext, useContext, useRef, useCallback, ReactNode } from "react";

interface SlideModalManager {
  registerModal: (id: string, closeFunction: () => void) => void;
  unregisterModal: (id: string) => void;
  closeAllExcept: (exceptId: string) => void;
}

const SlideModalContext = createContext<SlideModalManager | null>(null);

export const useSlideModalManager = (): SlideModalManager => {
  const context = useContext(SlideModalContext);
  if (!context) {
    throw new Error("useSlideModalManager must be used within a SlideModalProvider");
  }
  return context;
};

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