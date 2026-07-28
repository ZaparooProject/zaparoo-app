import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useSmartSwipe } from "@/hooks/useSmartSwipe";
import { useBackButtonHandler } from "@/hooks/useBackButtonHandler";
import { ScanResult } from "@/lib/models";
import type { WriteNfcHook } from "@/lib/writeNfcHook";
import { ScanSpinner } from "./ScanSpinner";
import { Button } from "./wui/Button";
import { useAnnouncer } from "./A11yAnnouncer";

export function isWriteModalOpen(
  writeIntent: boolean,
  writer: Pick<WriteNfcHook, "status" | "verifyError">,
): boolean {
  return writeIntent && (writer.status === null || writer.verifyError !== null);
}

export function WriteModal(props: {
  isOpen: boolean;
  close: () => void;
  verifyError?: boolean;
  retry?: () => void;
}) {
  const { t } = useTranslation();
  const { announce } = useAnnouncer();
  const cancelButtonRef = useRef<HTMLButtonElement>(null);
  const retryButtonRef = useRef<HTMLButtonElement>(null);
  const verifyError = props.verifyError ?? false;

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

  // Announce and focus when modal opens
  useEffect(() => {
    if (props.isOpen && !verifyError) {
      // Announce the modal
      announce(t("spinner.holdTag"), "assertive");
      // Focus the cancel button after a short delay
      const timer = setTimeout(() => {
        cancelButtonRef.current?.focus();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [props.isOpen, verifyError, announce, t]);

  // Announce and focus the retry action when verification fails
  useEffect(() => {
    if (props.isOpen && verifyError) {
      announce(t("spinner.verifyFailedRetry"), "assertive");
      const timer = setTimeout(() => {
        retryButtonRef.current?.focus();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [props.isOpen, verifyError, announce, t]);

  if (!props.isOpen) {
    return null;
  }

  return (
    <div
      className="z-30 flex h-screen w-screen items-center justify-center bg-[#111928] pb-[90px]"
      style={{ position: "fixed", left: 0, top: 0 }}
      role="dialog"
      aria-modal="true"
      aria-label={
        verifyError ? t("spinner.verifyFailedRetry") : t("spinner.holdTag")
      }
      {...swipeHandlers}
    >
      <div className="flex flex-col items-center gap-8">
        <div aria-hidden="true">
          <ScanSpinner
            spinning={!verifyError}
            status={verifyError ? ScanResult.Error : ScanResult.Default}
            write
          />
        </div>
        {verifyError ? (
          <>
            <p className="text-error px-8 text-center">
              {t("spinner.verifyFailedRetry")}
            </p>
            <div className="flex w-full gap-3 px-8">
              <Button
                ref={retryButtonRef}
                className="flex-1"
                onClick={() => props.retry?.()}
                label={t("scan.retry")}
              />
              <Button
                ref={cancelButtonRef}
                className="flex-1"
                variant="outline"
                onClick={() => props.close()}
                label={t("nav.cancel")}
              />
            </div>
          </>
        ) : (
          <Button
            ref={cancelButtonRef}
            variant="outline"
            onClick={() => props.close()}
            label={t("nav.cancel")}
          />
        )}
      </div>
    </div>
  );
}
