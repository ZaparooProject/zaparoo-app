import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { ChevronLeftIcon, ChevronRightIcon, PlayIcon } from "lucide-react";
import { CoreAPI } from "@/lib/coreApi";
import { logger } from "@/lib/logger";
import {
  collectLibraryMetadata,
  deriveLibraryImageTypes,
  fetchLibraryMediaMeta,
  imageTypeFromTypeTag,
  LIBRARY_QUERY_KEYS,
  libraryEntryDisplayName,
  mediaRefKey,
  mergeLibraryTags,
  organizeLibraryDetailTags,
  type LibraryDetailFactType,
  resolveLibraryLaunchText,
} from "@/lib/libraryMedia";
import type { MediaBrowseEntry, TagInfo } from "@/lib/models";
import { usePreferencesStore } from "@/lib/preferencesStore";
import { useStatusStore } from "@/lib/store";
import { useSystemNameResolver } from "@/hooks/useSystemName";
import { showRateLimitedErrorToast } from "@/lib/toastUtils";
import { SlideModal } from "@/components/SlideModal";
import { TagBadge } from "@/components/TagBadge";
import { Button } from "@/components/wui/Button";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { DelayedLoading } from "@/components/DelayedLoading";
import { NfcIcon } from "@/lib/images";
import { LibraryArtwork } from "@/components/library/LibraryArtwork";
import { FavoriteButton } from "@/components/library/FavoriteButton";

function DetailRow(props: { label: string; value: string; mono?: boolean }) {
  if (!props.value) return null;
  return (
    <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:gap-3">
      <span className="text-muted-foreground text-sm sm:min-w-[120px]">
        {props.label}
      </span>
      <span
        className={`flex-1 break-words ${props.mono ? "font-mono text-sm" : "font-medium"}`}
      >
        {props.value}
      </span>
    </div>
  );
}

function metadataFactLabelKey(type: LibraryDetailFactType): string {
  switch (type) {
    case "year":
      return "library.releaseYear";
    case "players":
      return "library.players";
    case "developer":
      return "library.developer";
    case "publisher":
      return "library.publisher";
    case "genre":
      return "library.genre";
    case "rating":
      return "library.rating";
    case "gamefamily":
      return "library.gameFamily";
    case "arcadeboard":
      return "library.arcadeBoard";
  }
}

function TagRow(props: { label: string; tags: TagInfo[] }) {
  if (props.tags.length === 0) return null;
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:gap-3">
      <span className="text-muted-foreground text-sm sm:min-w-[120px]">
        {props.label}
      </span>
      <span className="flex flex-1 flex-wrap gap-1.5">
        {props.tags.map((tag, index) => (
          <TagBadge
            key={`${tag.type}:${tag.tag}:${index}`}
            type={tag.type}
            tag={tag.tag}
            displayTag={tag.label || tag.tag}
          />
        ))}
      </span>
    </div>
  );
}

export function LibraryMediaDetailsModal(props: {
  isOpen: boolean;
  close: () => void;
  entry: MediaBrowseEntry | null;
  systemId: string;
  deviceKey: string;
}) {
  const { t } = useTranslation();
  const showFilenames = usePreferencesStore((state) => state.showFilenames);
  const nfcAvailable = usePreferencesStore((state) => state.nfcAvailable);
  const resolveSystemName = useSystemNameResolver();
  const connected = useStatusStore((state) => state.connected);
  const setWriteQueue = useStatusStore((state) => state.setWriteQueue);
  const [imageIndex, setImageIndex] = useState(0);
  const [resolvedDefaultType, setResolvedDefaultType] = useState<string | null>(
    null,
  );
  const [imageAvailable, setImageAvailable] = useState<boolean | null>(null);
  const [launching, setLaunching] = useState(false);
  const [preparingWrite, setPreparingWrite] = useState(false);
  const launchControllerRef = useRef<AbortController | null>(null);
  const writeControllerRef = useRef<AbortController | null>(null);
  const previousImageButtonRef = useRef<HTMLButtonElement>(null);
  const nextImageButtonRef = useRef<HTMLButtonElement>(null);
  const entry = props.entry;
  const metadataQuery = useQuery({
    queryKey: [
      LIBRARY_QUERY_KEYS.meta,
      props.deviceKey,
      ...(entry ? mediaRefKey(entry, props.systemId) : [null, "", ""]),
    ],
    queryFn: ({ signal }) => {
      if (!entry) throw new Error("Media selection is unavailable");
      return fetchLibraryMediaMeta(entry, props.systemId, signal);
    },
    enabled: props.isOpen && entry !== null,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    retry: false,
  });
  const writeCapabilityQuery = useQuery({
    queryKey: ["nfcWriteCapability", props.deviceKey],
    queryFn: () => CoreAPI.hasWriteCapableReader(),
    enabled: props.isOpen && connected && !nfcAvailable,
    staleTime: 60 * 1000,
    retry: false,
  });
  const writeAvailable = nfcAvailable || writeCapabilityQuery.data === true;
  const metadata = metadataQuery.data?.media;
  const metadataView = useMemo(
    () => (metadata ? collectLibraryMetadata(metadata) : null),
    [metadata],
  );
  const imageTypes = useMemo(() => {
    if (!metadata) return [];
    return deriveLibraryImageTypes(metadata).filter(
      (type) => type !== resolvedDefaultType,
    );
  }, [metadata, resolvedDefaultType]);
  const imageOptions = [null, ...imageTypes] as Array<string | null>;
  const currentImageType = imageOptions[imageIndex] ?? null;
  const fallbackTitle = entry
    ? libraryEntryDisplayName(entry, showFilenames)
    : "";
  const title = metadataView?.title || fallbackTitle;
  const description = metadataView?.description || entry?.description || "";

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- A new external media selection starts a fresh carousel/action state.
    setImageIndex(0);
    setResolvedDefaultType(null);
    setImageAvailable(entry?.hasCover === false ? false : null);
    setLaunching(false);
    setPreparingWrite(false);
    launchControllerRef.current?.abort();
    launchControllerRef.current = null;
    writeControllerRef.current?.abort();
    writeControllerRef.current = null;
  }, [entry]);

  useEffect(
    () => () => {
      launchControllerRef.current?.abort();
      writeControllerRef.current?.abort();
    },
    [],
  );

  useEffect(() => {
    if (imageIndex >= imageOptions.length) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Metadata can remove a duplicate resolved cover type from carousel.
      setImageIndex(Math.max(0, imageOptions.length - 1));
    }
  }, [imageIndex, imageOptions.length]);

  const rememberResolvedType = useCallback((typeTag: string) => {
    setResolvedDefaultType(imageTypeFromTypeTag(typeTag));
  }, []);
  const rememberImageAvailability = useCallback((available: boolean) => {
    setImageAvailable(available);
  }, []);

  const closeModal = () => {
    launchControllerRef.current?.abort();
    launchControllerRef.current = null;
    writeControllerRef.current?.abort();
    writeControllerRef.current = null;
    setLaunching(false);
    setPreparingWrite(false);
    props.close();
  };

  const launch = async () => {
    if (!entry || launching || preparingWrite || !connected) return;
    const controller = new AbortController();
    launchControllerRef.current?.abort();
    launchControllerRef.current = controller;
    setLaunching(true);
    try {
      const text = await resolveLibraryLaunchText(
        entry,
        props.systemId,
        controller.signal,
      );
      if (!text) throw new Error("Launch target could not be resolved");
      await CoreAPI.run({ text });
    } catch (error) {
      if (controller.signal.aborted) return;
      logger.error("Failed to launch media from Library", error, {
        category: "api",
        action: "launchLibraryMedia",
        severity: "error",
      });
      showRateLimitedErrorToast(t("library.launchError"));
    } finally {
      if (launchControllerRef.current === controller) {
        launchControllerRef.current = null;
        setLaunching(false);
      }
    }
  };

  const write = async () => {
    if (!entry || preparingWrite || launching || !writeAvailable) return;
    const controller = new AbortController();
    writeControllerRef.current?.abort();
    writeControllerRef.current = controller;
    setPreparingWrite(true);
    try {
      const text = await resolveLibraryLaunchText(
        entry,
        props.systemId,
        controller.signal,
      );
      if (!text) throw new Error("Write target could not be resolved");
      closeModal();
      setWriteQueue(text);
    } catch (error) {
      if (controller.signal.aborted) return;
      logger.error("Failed to prepare Library media for NFC writing", error, {
        category: "nfc",
        action: "writeLibraryMedia",
        severity: "error",
      });
      showRateLimitedErrorToast(t("library.writeError"));
    } finally {
      if (writeControllerRef.current === controller) {
        writeControllerRef.current = null;
        setPreparingWrite(false);
      }
    }
  };

  const detailTagView = organizeLibraryDetailTags(
    mergeLibraryTags(
      entry?.disambiguatingTags ?? [],
      metadataView?.tags ?? [],
      entry?.tags ?? [],
    ),
  );
  const factValue = (type: LibraryDetailFactType) =>
    detailTagView.facts.find((fact) => fact.type === type)?.values.join(", ") ??
    "";
  const year = factValue("year");
  const players = factValue("players");
  const detailFacts = detailTagView.facts.filter(
    (fact) => fact.type !== "year" && fact.type !== "players",
  );
  const resolvedSystemName = resolveSystemName(
    metadata?.title.system.id || props.systemId,
    metadata?.title.system.name || props.systemId,
  );
  const numericPlayers = Number(players);
  const playersSummary = players
    ? Number.isInteger(numericPlayers) && numericPlayers >= 0
      ? t("library.playerCount", { count: numericPlayers })
      : t("library.playersValue", { value: players })
    : "";
  const summaryItems = [resolvedSystemName, year, playersSummary].filter(
    Boolean,
  );
  const imageType = currentImageType ?? resolvedDefaultType ?? "artwork";
  const imageAlt = t("library.imageAlt", {
    title,
    type: t(`library.imageTypes.${imageType}`),
  });
  const showPreviousImage = () => {
    const nextIndex = Math.max(0, imageIndex - 1);
    setImageIndex(nextIndex);
    if (nextIndex === 0) {
      requestAnimationFrame(() => {
        nextImageButtonRef.current?.focus({ preventScroll: true });
      });
    }
  };
  const showNextImage = () => {
    const nextIndex = Math.min(imageOptions.length - 1, imageIndex + 1);
    setImageIndex(nextIndex);
    if (nextIndex === imageOptions.length - 1) {
      requestAnimationFrame(() => {
        previousImageButtonRef.current?.focus({ preventScroll: true });
      });
    }
  };

  return (
    <SlideModal
      isOpen={props.isOpen}
      close={closeModal}
      title={title}
      fixedHeight="85vh"
    >
      {entry && (
        <div className="flex flex-col gap-4 py-2">
          <div className="flex items-center gap-2">
            <Button
              label={launching ? t("library.launching") : t("library.launch")}
              icon={
                launching ? (
                  <LoadingSpinner size={20} decorative />
                ) : (
                  <PlayIcon size={20} />
                )
              }
              size="lg"
              intent="primary"
              disabled={!connected || launching || preparingWrite}
              onClick={() => void launch()}
              className="min-h-12 flex-1"
            />
            <FavoriteButton
              entry={entry}
              fallbackSystemId={props.systemId}
              deviceKey={props.deviceKey}
              metadataTags={metadata?.tags}
              iconOnly
            />
            {writeAvailable && (
              <Button
                icon={
                  preparingWrite ? (
                    <LoadingSpinner size={20} decorative />
                  ) : (
                    <NfcIcon size="20" />
                  )
                }
                size="lg"
                variant="outline"
                aria-label={
                  preparingWrite
                    ? t("library.preparingWrite")
                    : t("library.write")
                }
                disabled={preparingWrite || launching}
                onClick={() => void write()}
              />
            )}
          </div>

          {imageAvailable !== false && (
            <div className="flex flex-col gap-2">
              <div className="relative h-64 w-full">
                <LibraryArtwork
                  entry={entry}
                  systemId={props.systemId}
                  deviceKey={props.deviceKey}
                  maxSize={512}
                  priority="detail"
                  imageTypes={currentImageType ? [currentImageType] : undefined}
                  className="h-full w-full object-contain"
                  alt={imageAlt}
                  onTypeTag={
                    currentImageType ? undefined : rememberResolvedType
                  }
                  onAvailabilityChange={
                    currentImageType ? undefined : rememberImageAvailability
                  }
                />
              </div>
              {imageOptions.length > 1 && (
                <div className="flex items-center justify-center gap-3">
                  <Button
                    ref={previousImageButtonRef}
                    icon={<ChevronLeftIcon size={20} />}
                    variant="text"
                    aria-label={t("library.previousImage")}
                    disabled={imageIndex === 0}
                    onClick={showPreviousImage}
                  />
                  <span className="text-muted-foreground text-sm">
                    {t("library.imagePosition", {
                      current: imageIndex + 1,
                      total: imageOptions.length,
                    })}
                  </span>
                  <Button
                    ref={nextImageButtonRef}
                    icon={<ChevronRightIcon size={20} />}
                    variant="text"
                    aria-label={t("library.nextImage")}
                    disabled={imageIndex === imageOptions.length - 1}
                    onClick={showNextImage}
                  />
                </div>
              )}
            </div>
          )}

          <p className="text-muted-foreground text-center text-sm">
            {summaryItems.join(" • ")}
          </p>

          {metadataQuery.isLoading && (
            <DelayedLoading>
              <div
                className="text-muted-foreground flex items-center justify-center gap-2"
                role="status"
              >
                <LoadingSpinner size={16} className="text-primary" decorative />
                <span>{t("library.loadingMetadata")}</span>
              </div>
            </DelayedLoading>
          )}
          {metadataQuery.isError && (
            <div className="flex flex-col items-center gap-2">
              <span className="text-muted-foreground text-sm" role="alert">
                {t("library.metadataError")}
              </span>
              <Button
                label={t("library.tryAgain")}
                variant="outline"
                size="sm"
                onClick={() => void metadataQuery.refetch()}
              />
            </div>
          )}

          {description && (
            <p className="text-foreground text-sm whitespace-pre-wrap">
              {description}
            </p>
          )}

          {(detailFacts.length > 0 || detailTagView.tags.length > 0) && (
            <section className="flex flex-col gap-3">
              <h2 className="text-lg font-semibold">{t("library.details")}</h2>
              {detailFacts.map((fact) => (
                <DetailRow
                  key={fact.type}
                  label={t(metadataFactLabelKey(fact.type))}
                  value={fact.values.join(", ")}
                />
              ))}
              <TagRow label={t("library.tags")} tags={detailTagView.tags} />
            </section>
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
                label={t("library.path")}
                value={metadata?.path || entry.path}
                mono
              />
              {metadata?.launcherOverride && (
                <DetailRow
                  label={t("library.launcher")}
                  value={metadata.launcherOverride}
                />
              )}
            </div>
          </details>
        </div>
      )}
    </SlideModal>
  );
}
