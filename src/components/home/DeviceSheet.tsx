import { SlideModal } from "@/components/SlideModal";
import { useDeviceConnectionFlow } from "@/components/home/useDeviceConnectionFlow";

/** The connection flow as the sheet shared by Zap and Settings. */
export function DeviceSheet({
  isOpen,
  close,
}: {
  isOpen: boolean;
  close: () => void;
}) {
  const flow = useDeviceConnectionFlow({ isOpen, close });
  return (
    <SlideModal
      isOpen={isOpen}
      close={close}
      title={flow.title}
      footer={flow.footer}
    >
      {flow.content}
    </SlideModal>
  );
}
