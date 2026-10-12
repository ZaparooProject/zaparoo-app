import { useRef } from "react";
import { useTranslation } from "react-i18next";
import { useDeviceConnectionFlow } from "@/components/home/useDeviceConnectionFlow";

/** The connection flow as an in-page section of the Devices page. */
export function DeviceConnectionPanel({ isOpen }: { isOpen: boolean }) {
  const { t } = useTranslation();
  const panelRef = useRef<HTMLElement>(null);
  const flow = useDeviceConnectionFlow({
    isOpen,
    // There is no sheet to close, so focus returns to the section itself.
    onSettled: () => panelRef.current?.focus({ preventScroll: true }),
  });
  return (
    <section
      ref={panelRef}
      tabIndex={-1}
      aria-label={t("scan.deviceSheetTitle")}
      className="min-w-0 outline-none"
    >
      {flow.content}
      {flow.footer}
    </section>
  );
}
