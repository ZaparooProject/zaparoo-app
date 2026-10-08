import { createContext, useContext, useState } from "react";

interface DeviceSheetController {
  isOpen: boolean;
  setOpen: (open: boolean) => void;
}

export const DeviceSheetContext = createContext<DeviceSheetController | null>(
  null,
);

/** Standalone feature screens retain their local sheet outside the app shell. */
export function useDeviceSheetController() {
  const shared = useContext(DeviceSheetContext);
  const [isOpen, setOpen] = useState(false);
  return { ...(shared ?? { isOpen, setOpen }), shared: shared !== null };
}
