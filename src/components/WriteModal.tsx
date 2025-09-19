import { useTranslation } from "react-i18next";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { useStatusStore } from "@/lib/store";
import { useSmartSwipe } from "../hooks/useSmartSwipe";
import { BackIcon } from "../lib/images";
import { ScanResult } from "../lib/models";
import { ScanSpinner } from "./ScanSpinner";

export function WriteModal(props: { isOpen: boolean; close: () => void }) {
  const { t } = useTranslation();

  const swipeHandlers = useSmartSwipe({
    onSwipeRight: () => props.close(),
    preventScrollOnSwipe: false
  });


  if (!props.isOpen) {
    return null;
  }

  return (
    <div
      className="z-30 flex h-screen w-screen items-center justify-center bg-[#111928] pb-[90px]"
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
        <div
          className="flex flex-row gap-2"
          onClick={() => props.close()}
          onKeyDown={(e) =>
            (e.key === "Enter" || e.key === " ") && props.close()
          }
          role="button"
          tabIndex={0}
        >
          <BackIcon size="24" />
        </div>
      </div>
      <div className="flex flex-col items-center gap-4">
        <ScanSpinner spinning={true} status={ScanResult.Default} write />
      </div>
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
