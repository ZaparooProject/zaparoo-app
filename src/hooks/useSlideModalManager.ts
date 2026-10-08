import { createContext, useContext } from "react";

export interface SlideModalRegistrationOptions {
  blocking?: boolean;
}

export interface SlideModalManager {
  registerModal: (
    id: string,
    closeFunction: () => void,
    options?: SlideModalRegistrationOptions,
  ) => void;
  unregisterModal: (id: string) => void;
  /** Closes existing modals, or rejects opening when another modal is blocking. */
  closeAllExcept: (exceptId: string) => boolean;
  /** Supporting surfaces defer becoming modal while another task owns focus. */
  hasOpenModalExcept?: (exceptId: string) => boolean;
  subscribe?: (listener: () => void) => () => void;
}

export const SlideModalContext = createContext<SlideModalManager | null>(null);

export const useSlideModalManager = (): SlideModalManager => {
  const context = useContext(SlideModalContext);
  if (!context) {
    throw new Error(
      "useSlideModalManager must be used within a SlideModalProvider",
    );
  }
  return context;
};
