import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import {
  deriveLibraryImageTypes,
  imageTypeFromTypeTag,
} from "@/lib/libraryMedia";
import type { MediaBrowseEntry, MediaMetaResponse } from "@/lib/models";
import { Button } from "@/components/wui/Button";
import { LibraryArtwork } from "@/components/library/LibraryArtwork";

/**
 * Detail artwork with its image-type carousel. Mount it keyed by media so a
 * new selection starts at its cover with no carried-over reports.
 */
export function LibraryDetailArtwork(props: {
  entry: MediaBrowseEntry;
  systemId: string;
  deviceKey: string;
  title: string;
  metadata: MediaMetaResponse["media"] | undefined;
}) {
  const { t } = useTranslation();
  const { metadata } = props;
  const [imageIndex, setImageIndex] = useState(0);
  const [resolvedDefaultType, setResolvedDefaultType] = useState<string | null>(
    null,
  );
  const [available, setAvailable] = useState<boolean | null>(
    props.entry.hasCover === false ? false : null,
  );
  const previousButtonRef = useRef<HTMLButtonElement>(null);
  const nextButtonRef = useRef<HTMLButtonElement>(null);

  const imageTypes = useMemo(() => {
    if (!metadata) return [];
    return deriveLibraryImageTypes(metadata).filter(
      (type) => type !== resolvedDefaultType,
    );
  }, [metadata, resolvedDefaultType]);
  const imageOptions = [null, ...imageTypes] as Array<string | null>;
  const currentImageType = imageOptions[imageIndex] ?? null;

  useEffect(() => {
    if (imageIndex >= imageOptions.length) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Metadata can remove a duplicate resolved cover type from carousel.
      setImageIndex(Math.max(0, imageOptions.length - 1));
    }
  }, [imageIndex, imageOptions.length]);

  const rememberResolvedType = useCallback((typeTag: string) => {
    setResolvedDefaultType(imageTypeFromTypeTag(typeTag));
  }, []);

  if (available === false) return null;

  const imageType = currentImageType ?? resolvedDefaultType ?? "artwork";
  const showPrevious = () => {
    const nextIndex = Math.max(0, imageIndex - 1);
    setImageIndex(nextIndex);
    if (nextIndex === 0) {
      requestAnimationFrame(() => {
        nextButtonRef.current?.focus({ preventScroll: true });
      });
    }
  };
  const showNext = () => {
    const nextIndex = Math.min(imageOptions.length - 1, imageIndex + 1);
    setImageIndex(nextIndex);
    if (nextIndex === imageOptions.length - 1) {
      requestAnimationFrame(() => {
        previousButtonRef.current?.focus({ preventScroll: true });
      });
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="relative h-64 w-full">
        <LibraryArtwork
          entry={props.entry}
          systemId={props.systemId}
          deviceKey={props.deviceKey}
          maxSize={512}
          priority="detail"
          imageTypes={currentImageType ? [currentImageType] : undefined}
          className="h-full w-full object-contain"
          loadingClassName="mx-auto max-w-[21.333rem]"
          alt={t("library.imageAlt", {
            title: props.title,
            type: t(`library.imageTypes.${imageType}`),
          })}
          onTypeTag={currentImageType ? undefined : rememberResolvedType}
          onAvailabilityChange={currentImageType ? undefined : setAvailable}
        />
      </div>
      {imageOptions.length > 1 && (
        <div className="flex items-center justify-center gap-3">
          <Button
            ref={previousButtonRef}
            icon={<ChevronLeftIcon size={20} />}
            variant="text"
            aria-label={t("library.previousImage")}
            disabled={imageIndex === 0}
            onClick={showPrevious}
          />
          <span className="text-muted-foreground text-sm">
            {t("library.imagePosition", {
              current: imageIndex + 1,
              total: imageOptions.length,
            })}
          </span>
          <Button
            ref={nextButtonRef}
            icon={<ChevronRightIcon size={20} />}
            variant="text"
            aria-label={t("library.nextImage")}
            disabled={imageIndex === imageOptions.length - 1}
            onClick={showNext}
          />
        </div>
      )}
    </div>
  );
}
