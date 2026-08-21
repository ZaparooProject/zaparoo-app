import type { ReactElement } from "react";
import { useTranslation } from "react-i18next";
import { Copy } from "lucide-react";
import { useSystemNameResolver } from "@/hooks/useSystemName";
import { useMediaWriteTarget } from "@/hooks/useMediaWriteTarget";
import { CreateIcon, DeviceIcon, PlayIcon } from "@/lib/images";
import type { SearchResultGame } from "@/lib/models";
import { searchResultToBrowseEntry } from "@/lib/libraryMedia";
import { filenameFromPath } from "@/lib/path";
import { usePreferencesStore } from "@/lib/preferencesStore";
import { useActiveDeviceKey } from "@/hooks/useActiveDeviceKey";
import { SlideModal } from "@/components/SlideModal";
import { Button } from "@/components/wui/Button";
import { ModalActionRail } from "@/components/wui/ModalActionRail";
import { FavoriteButton } from "@/components/library/FavoriteButton";
import { MediaWriteTargetSelector } from "@/components/MediaWriteTargetSelector";

type MediaDetailsAction = (value: string) => void | Promise<void>;

export interface MediaDetailsModalProps {
  isOpen: boolean;
  close: () => void;
  media: SearchResultGame | null;
  onWrite: MediaDetailsAction;
  onCopy?: MediaDetailsAction;
  onPreview?: MediaDetailsAction;
  previewDisabled?: boolean;
  primaryActionLabel?: string;
  primaryActionIcon?: ReactElement;
}

export function MediaDetailsModal({
  isOpen,
  close,
  media,
  onWrite,
  onCopy,
  onPreview,
  previewDisabled = false,
  primaryActionLabel,
  primaryActionIcon,
}: MediaDetailsModalProps) {
  const { t } = useTranslation();
  const showFilenames = usePreferencesStore((state) => state.showFilenames);
  const deviceKey = useActiveDeviceKey();
  const resolveSystemName = useSystemNameResolver();
  const writeTarget = useMediaWriteTarget(media);
  const favoriteEntry = media ? searchResultToBrowseEntry(media) : null;
  const title = media
    ? showFilenames
      ? filenameFromPath(media.path) || media.name
      : media.name
    : "";
  const hasSecondaryActions = Boolean(favoriteEntry || onCopy || onPreview);
  const primaryAction = media ? (
    <Button
      label={primaryActionLabel ?? t("create.search.writeLabel")}
      icon={primaryActionIcon ?? <CreateIcon size="20" />}
      intent="primary"
      onClick={() => void onWrite(writeTarget.selectedValue)}
    />
  ) : undefined;
  const footer =
    media && primaryAction ? (
      hasSecondaryActions ? (
        <ModalActionRail
          aria-label={t("create.search.mediaActions")}
          actions={
            <>
              {favoriteEntry && (
                <FavoriteButton
                  entry={favoriteEntry}
                  fallbackSystemId={media.system.id}
                  deviceKey={deviceKey}
                  displayLabel={t("library.favorite")}
                  layout="responsive"
                  variant="text"
                  className="w-full whitespace-nowrap"
                />
              )}
              {onCopy && (
                <Button
                  label={t("create.search.copyLabel")}
                  icon={<Copy size="20" />}
                  layout="responsive"
                  variant="text"
                  className="whitespace-nowrap"
                  onClick={() => void onCopy(writeTarget.selectedValue)}
                />
              )}
              {onPreview && (
                <Button
                  label={t("create.search.playLabel")}
                  icon={<PlayIcon size="20" />}
                  layout="responsive"
                  variant="text"
                  className="whitespace-nowrap"
                  disabled={previewDisabled}
                  onClick={() => void onPreview(writeTarget.selectedValue)}
                />
              )}
            </>
          }
          primaryAction={primaryAction}
        />
      ) : (
        primaryAction
      )
    ) : undefined;

  return (
    <SlideModal isOpen={isOpen} close={close} title={title} footer={footer}>
      {media && (
        <div className="flex flex-col gap-4 py-2">
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:gap-3">
              <div className="flex items-center gap-2 sm:min-w-[100px]">
                <DeviceIcon size="16" className="text-white/60" />
                <span className="text-sm text-white/60">
                  {t("create.search.systemLabel")}
                </span>
              </div>
              <span className="flex-1 font-medium">
                {resolveSystemName(media.system.id, media.system.name)}
              </span>
            </div>
          </div>

          <MediaWriteTargetSelector media={media} target={writeTarget} />
        </div>
      )}
    </SlideModal>
  );
}
