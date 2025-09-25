import { createContext, useContext } from "react";

export interface SlideModalManager {
  registerModal: (id: string, closeFunction: () => void) => void;
  unregisterModal: (id: string) => void;
  closeAllExcept: (exceptId: string) => void;
}

export const SlideModalContext = createContext<SlideModalManager | null>(null);

export const useSlideModalManager = (): SlideModalManager => {
  const context = useContext(SlideModalContext);
  if (!context) {
    throw new Error("useSlideModalManager must be used within a SlideModalProvider");
  }
  return context;
};