import { useState, type ReactNode } from "react";
import { DeviceSheet } from "@/components/home/DeviceSheet";
import { DeviceSheetContext } from "@/hooks/useDeviceSheetController";

/** One sheet follows the shell rather than any individual destination. */
export function DeviceSheetProvider({ children }: { children: ReactNode }) {
  const [isOpen, setOpen] = useState(false);
  return (
    <DeviceSheetContext.Provider value={{ isOpen, setOpen }}>
      {children}
      <DeviceSheet isOpen={isOpen} close={() => setOpen(false)} />
    </DeviceSheetContext.Provider>
  );
}
