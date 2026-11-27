import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { SlideModal } from "@/components/SlideModal";
import { initLocalMedia } from "@/lib/localPlayback/player";
import { useLocalPlaybackStore } from "@/lib/localPlayback/store";

/**
 * Shows an image the app matched, and on web builds plays a video URL. Native
 * builds play video in the system player instead. Mounted once at the app
 * root, it also loads the local index so Now Playing follows native playback
 * from launch.
 */
export function LocalMediaViewer() {
  const { t } = useTranslation();
  const viewer = useLocalPlaybackStore((s) => s.viewer);
  const setViewer = useLocalPlaybackStore((s) => s.setViewer);

  useEffect(() => {
    void initLocalMedia();
  }, []);

  return (
    <SlideModal
      isOpen={viewer !== null}
      close={() => setViewer(null)}
      title={viewer?.title ?? t("localMedia.viewerTitle")}
    >
      {viewer?.kind === "image" && (
        <img
          src={viewer.url}
          alt={viewer.title}
          className="mx-auto max-h-[70vh] w-full rounded-md object-contain"
        />
      )}
      {viewer?.kind === "video" && (
        // A bare media URL from a token has no caption file to attach.
        // eslint-disable-next-line jsx-a11y/media-has-caption
        <video
          src={viewer.url}
          controls
          autoPlay
          playsInline
          aria-label={viewer.title}
          className="mx-auto max-h-[70vh] w-full rounded-md bg-black"
        />
      )}
    </SlideModal>
  );
}
