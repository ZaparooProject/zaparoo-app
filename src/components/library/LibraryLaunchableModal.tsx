import { useState } from "react";
import { useTranslation } from "react-i18next";
import { CoreAPI, logRunFailure } from "@/lib/coreApi";
import type { System } from "@/lib/models";
import { ConnectionState, useStatusStore } from "@/lib/store";
import { showRateLimitedErrorToast } from "@/lib/toastUtils";
import { useNfcWriteAvailable } from "@/hooks/useNfcWriteAvailable";
import { useContextualNfcWrite } from "@/hooks/useContextualNfcWrite";
import { SlideModal } from "@/components/SlideModal";
import {
  ContextualWriteRail,
  LaunchButton,
} from "@/components/library/ContextualWriteRail";
import {
  DetailRow,
  TechnicalDetails,
} from "@/components/library/LibraryMediaFacts";

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
    <ContextualWriteRail
      aria-label={t("library.mediaActions")}
      activity={writeActivity}
      writeDisabled={!zapScript || !writeAvailable}
      busy={launching}
      onWrite={write}
      primaryAction={
        <LaunchButton
          label={t("library.launch")}
          launching={launching}
          unavailable={!zapScript || !liveConnected}
          busy={writeActivity.active}
          onLaunch={() => void launch()}
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
      footerSkipLabel={t("accessibility.skipToActions")}
    >
      {props.system && (
        <div className="flex flex-col gap-4 py-2">
          {props.system.category && (
            <p className="text-muted-foreground text-center text-sm">
              {props.system.category}
            </p>
          )}
          <TechnicalDetails>
            <DetailRow label={t("library.zapScript")} value={zapScript} mono />
          </TechnicalDetails>
        </div>
      )}
    </SlideModal>
  );
}
