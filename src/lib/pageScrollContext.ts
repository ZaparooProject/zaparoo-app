import { createContext, useContext } from "react";

export const InitialPageScrollOffsetContext = createContext(0);

export function useInitialPageScrollOffset() {
  return useContext(InitialPageScrollOffsetContext);
}
