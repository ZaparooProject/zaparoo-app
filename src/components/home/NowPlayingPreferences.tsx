import { useTranslation } from "react-i18next";
import type { TagInfo } from "@/lib/models";
import { MediaPreferenceActions } from "@/components/library/MediaPreferenceActions";

export function NowPlayingPreferences(props: {
  deviceKey: string;
  systemId: string;
  mediaPath: string;
  mediaName: string;
  metadataTags?: TagInfo[];
  ready: boolean;
}) {
  const { t } = useTranslation();
  const entry = {
    type: "media" as const,
    systemId: props.systemId,
    name: props.mediaName,
    path: props.mediaPath,
  };

  return (
    <div
      role="group"
      aria-label={t("scan.mediaPreferences")}
      className="mt-auto flex gap-1 overflow-x-auto overscroll-x-contain"
    >
      <MediaPreferenceActions
        entry={entry}
        fallbackSystemId={props.systemId}
        deviceKey={props.deviceKey}
        metadataTags={props.metadataTags}
        ready={props.ready}
        context="nowPlaying"
      />
    </div>
  );
}
