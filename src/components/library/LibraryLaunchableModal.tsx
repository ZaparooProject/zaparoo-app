import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronRightIcon } from "lucide-react";
import { CoreAPI, logRunFailure } from "@/lib/coreApi";
import type { System } from "@/lib/models";
import { ConnectionState, useStatusStore } from "@/lib/store";
import { showRateLimitedErrorToast } from "@/lib/toastUtils";
import { useNfcWriteAvailable } from "@/hooks/useNfcWriteAvailable";
import { useContextualNfcWrite } from "@/hooks/useContextualNfcWrite";
import {
  ReaderActivityAction,
  ReaderActivityStatus,
} from "@/components/ReaderActivityAction";
import { SlideModal } from "@/components/SlideModal";
import { Button } from "@/components/wui/Button";
import { ModalActionRail } from "@/components/wui/ModalActionRail";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { PlayIcon } from "@/lib/images";
import { DetailRow } from "@/components/library/LibraryMediaDetailsModal";

/**
 * Actions for a Core virtual system. It has no media to browse, so the Library
 * offers its ZapScript directly for launching or writing to a token.
 */
export function LibraryLaunchableModal(props: {
  isOpen: boolean;
  close: () => void;
  system: System | null;
  deviceKey: string;
}) {
  const { t } = useTranslation();
  // `connected` stays true while reconnecting so cached data remains usable.
  // Launching needs a live socket, or it would sit out the request timeout.
  const liveConnected = useStatusStore(
    (state) => state.connectionState === ConnectionState.CONNECTED,
  );
  const writeAvailable = useNfcWriteAvailable(props.deviceKey, props.isOpen);
  const writeActivity = useContextualNfcWrite(
    JSON.stringify([props.deviceKey, props.system?.id]),
    props.isOpen,
  );
  const [launching, setLaunching] = useState(false);
  const zapScript = props.system?.zapScript?.trim() ?? "";

  const launch = async () => {
    if (!zapScript || launching || writeActivity.active || !liveConnected)
      return;
    setLaunching(true);
    try {
      await CoreAPI.run({ text: zapScript });
    } catch (error) {
      logRunFailure("Failed to launch virtual system from Library", error, {
        action: "launchLibraryLaunchable",
      });
      showRateLimitedErrorToast(t("library.launchSystemError"));
    } finally {
      setLaunching(false);
    }
  };

  const write = () => {
    if (!zapScript || launching || !writeAvailable) return;
    void writeActivity.start(zapScript);
  };

  const footer = props.system ? (
    <ModalActionRail
      aria-label={t("library.mediaActions")}
      readerAction
      status={
        writeActivity.state === "attention" ||
        writeActivity.state === "error" ? (
          <ReaderActivityStatus
            state={writeActivity.state}
            onCancel={() => void writeActivity.cancel()}
          />
        ) : undefined
      }
      actions={
        <ReaderActivityAction
          state={writeActivity.state}
          label={t("library.writeAction")}
          idleAriaLabel={t("library.write")}
          busy={launching}
          disabled={
            !zapScript ||
            !writeAvailable ||
            launching ||
            writeActivity.externalWriteActive
          }
          onStart={write}
          onCancel={() => void writeActivity.cancel()}
          onRetry={() => void writeActivity.retry()}
        />
      }
      primaryAction={
        <Button
          label={t("library.launch")}
          aria-label={launching ? t("library.launching") : t("library.launch")}
          icon={
            launching ? (
              <LoadingSpinner size={20} decorative />
            ) : (
              <PlayIcon size="20" />
            )
          }
          intent="primary"
          disabled={
            !zapScript || !liveConnected || launching || writeActivity.active
          }
          disabledAppearance={
            launching || writeActivity.active ? "busy" : "unavailable"
          }
          onClick={() => void launch()}
        />
      }
    />
  ) : undefined;

  return (
    <SlideModal
      isOpen={props.isOpen}
      close={() => {
        void writeActivity.cancel();
        props.close();
      }}
      title={props.system?.name ?? ""}
      footer={footer}
    >
      {props.system && (
        <div className="flex flex-col gap-4 py-2">
          {props.system.category && (
            <p className="text-muted-foreground text-center text-sm">
              {props.system.category}
            </p>
          )}
          <details className="group border-border border-t pt-2">
            <summary className="focus-visible:ring-ring flex min-h-12 cursor-pointer list-none items-center justify-between rounded-md px-1 focus-visible:ring-2 focus-visible:outline-none [&::-webkit-details-marker]:hidden">
              <span className="font-medium">
                {t("library.technicalDetails")}
              </span>
              <ChevronRightIcon
                size={20}
                className="text-muted-foreground transition-transform group-open:rotate-90"
                aria-hidden="true"
              />
            </summary>
            <div className="flex flex-col gap-3 px-1 pt-2">
              <DetailRow
                label={t("library.zapScript")}
                value={zapScript}
                mono
              />
            </div>
          </details>
        </div>
      )}
    </SlideModal>
  );
}
