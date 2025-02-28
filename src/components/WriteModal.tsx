import { useSwipeable } from "react-swipeable";
import { BackIcon } from "../lib/images";
import { ScanResult } from "../lib/models";
import { ScanSpinner } from "./ScanSpinner";

import { Dialog, DialogContent } from "@/components/ui/dialog";
import { useStatusStore } from "@/lib/store";

export function WriteModal(props: { isOpen: boolean; close: () => void }) {
  const swipeHandlers = useSwipeable({
    onSwipedRight: () => props.close()
  });

  if (!props.isOpen) {
    return null;
  }

  return (
    <div
      className="z-30 flex h-screen w-screen items-center justify-center bg-background pb-[90px]"
      style={{ position: "fixed", left: 0, top: 0 }}
      {...swipeHandlers}
    >
      <div
        style={{
          position: "fixed",
          top: "22px",
          left: "18px"
        }}
      >
        <div className="flex flex-row gap-2" onClick={() => props.close()}>
          <BackIcon size="24" />
        </div>
      </div>
      <ScanSpinner spinning={true} status={ScanResult.Default} write />
    </div>
  );
}

export function NFCModal() {
  const nfcModalOpen = useStatusStore((state) => state.nfcModalOpen);
  const setNfcModalOpen = useStatusStore((state) => state.setNfcModalOpen);

  return (
    <Dialog open={nfcModalOpen} onOpenChange={setNfcModalOpen}>
      <DialogContent>
        <ScanSpinner spinning={true} status={ScanResult.Default} write />
      </DialogContent>
    </Dialog>
  );
}
