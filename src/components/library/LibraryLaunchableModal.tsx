import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronRightIcon, PlayIcon } from "lucide-react";
import { CoreAPI, logRunFailure } from "@/lib/coreApi";
import type { System } from "@/lib/models";
import { ConnectionState, useStatusStore } from "@/lib/store";
import { showRateLimitedErrorToast } from "@/lib/toastUtils";
import { useNfcWriteAvailable } from "@/hooks/useNfcWriteAvailable";
import { SlideModal } from "@/components/SlideModal";
import { Button } from "@/components/wui/Button";
import { ModalActionRail } from "@/components/wui/ModalActionRail";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { CreateIcon } from "@/lib/images";
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
  const setWriteQueue = useStatusStore((state) => state.setWriteQueue);
  const writeAvailable = useNfcWriteAvailable(props.deviceKey, props.isOpen);
  const [launching, setLaunching] = useState(false);
  const zapScript = props.system?.zapScript?.trim() ?? "";

  const launch = async () => {
    if (!zapScript || launching || !liveConnected) return;
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
    props.close();
    setWriteQueue(zapScript);
  };

  const footer = props.system ? (
    <ModalActionRail
      aria-label={t("library.mediaActions")}
      actions={
        <Button
          label={t("library.writeAction")}
          aria-label={t("library.write")}
          icon={<CreateIcon size="20" />}
          layout="responsive"
          variant="text"
          className="whitespace-nowrap"
          disabled={!zapScript || !writeAvailable || launching}
          onClick={write}
        />
      }
      primaryAction={
        <Button
          label={launching ? t("library.launching") : t("library.launch")}
          icon={
            launching ? (
              <LoadingSpinner size={20} decorative />
            ) : (
              <PlayIcon size={20} />
            )
          }
          intent="primary"
          disabled={!zapScript || !liveConnected || launching}
          onClick={() => void launch()}
        />
      }
    />
  ) : undefined;

  return (
    <SlideModal
      isOpen={props.isOpen}
      close={props.close}
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
          <details className="group border-t border-white/15 pt-2">
            <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between rounded-md px-1 focus-visible:ring-2 focus-visible:ring-white/50 focus-visible:outline-none [&::-webkit-details-marker]:hidden">
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
