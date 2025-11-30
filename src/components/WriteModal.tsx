import { useTranslation } from "react-i18next";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { useStatusStore } from "@/lib/store";
import { useSmartSwipe } from "../hooks/useSmartSwipe";
import { useBackButtonHandler } from "../hooks/useBackButtonHandler";
import { ScanResult } from "../lib/models";
import { ScanSpinner } from "./ScanSpinner";
import { Button } from "./wui/Button";

export function WriteModal(props: { isOpen: boolean; close: () => void }) {
  const { t } = useTranslation();

  const swipeHandlers = useSmartSwipe({
    onSwipeRight: () => props.close(),
    preventScrollOnSwipe: false,
  });

  // Handle Android back button
  useBackButtonHandler(
    "write-modal",
    () => {
      if (props.isOpen) {
        props.close();
        return true; // Consume the event
      }
      return false; // Let other handlers process it
    },
    100, // High priority
    props.isOpen, // Only active when modal is open
  );

  if (!props.isOpen) {
    return null;
  }

  return (
    <div
      className="z-30 flex h-screen w-screen items-center justify-center bg-[#111928] pb-[90px]"
      style={{ position: "fixed", left: 0, top: 0 }}
      {...swipeHandlers}
    >
      <div className="flex flex-col items-center gap-8">
        <div
          onClick={() => props.close()}
          onKeyDown={(e) =>
            (e.key === "Enter" || e.key === " ") && props.close()
          }
          role="button"
          tabIndex={0}
        >
          <ScanSpinner spinning={true} status={ScanResult.Default} write />
        </div>
        <Button
          variant="outline"
          onClick={() => props.close()}
          label={t("nav.cancel")}
        />
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
