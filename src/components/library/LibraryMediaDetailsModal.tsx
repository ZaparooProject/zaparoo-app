import classNames from "classnames";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import toast from "react-hot-toast";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  ListPlusIcon,
  PlayIcon,
  PlusIcon,
} from "lucide-react";
import { CoreAPI, logRunFailure } from "@/lib/coreApi";
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
  resolveLibraryWriteText,
} from "@/lib/libraryMedia";
import type { MediaBrowseEntry, TagInfo } from "@/lib/models";
import { usePreferencesStore } from "@/lib/preferencesStore";
import { ConnectionState, useStatusStore } from "@/lib/store";
import { useSystemNameResolver } from "@/hooks/useSystemName";
import { useNfcWriteAvailable } from "@/hooks/useNfcWriteAvailable";
import { useHapticPress } from "@/hooks/useHapticPress";
import { useCoreFeature } from "@/hooks/useCoreFeature";
import {
  canEditDeck,
  MAX_DECK_ITEMS,
  mediaDeckItem,
  refreshDecks,
} from "@/lib/decks";
import { TextInput } from "@/components/wui/TextInput";
import { showRateLimitedErrorToast } from "@/lib/toastUtils";
import { SlideModal } from "@/components/SlideModal";
import { TagBadge } from "@/components/TagBadge";
import { Button } from "@/components/wui/Button";
import { EmptyState } from "@/components/wui/EmptyState";
import { ModalActionRail } from "@/components/wui/ModalActionRail";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { DelayedLoading } from "@/components/DelayedLoading";
import { CreateIcon } from "@/lib/images";
import { LibraryArtwork } from "@/components/library/LibraryArtwork";
import { MediaPreferenceActions } from "@/components/library/MediaPreferenceActions";
import { MediaWriteTargetModal } from "@/components/MediaWriteTargetModal";
import {
  getDefaultMediaWriteValue,
  getMediaWritePath,
  shouldSelectMediaWriteTarget,
} from "@/lib/mediaWriteTarget";

export function DetailRow(props: {
  label: string;
  value: string;
  mono?: boolean;
}) {
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
  context?: "library" | "nowPlaying";
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const decksFeature = useCoreFeature("decks", { requireKnownSupport: true });
  const [deckPickerOpen, setDeckPickerOpen] = useState(false);
  const [deckSaving, setDeckSaving] = useState(false);
  const [newDeckName, setNewDeckName] = useState("");
  const [creatingDeck, setCreatingDeck] = useState(false);
  const [deckSearch, setDeckSearch] = useState("");
  const handleDeckPress = useHapticPress();
  useEffect(() => {
    if (!props.isOpen) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- External dismissal must not reopen a stale deck picker with the next media selection.
      setDeckPickerOpen(false);
      setCreatingDeck(false);
      setDeckSearch("");
      setNewDeckName("");
    }
  }, [props.isOpen]);
  const showFilenames = usePreferencesStore((state) => state.showFilenames);
  const resolveSystemName = useSystemNameResolver();
  // `connected` stays true while reconnecting so cached data remains usable.
  // Launching needs a live socket, or it would sit out the request timeout.
  const liveConnected = useStatusStore(
    (state) => state.connectionState === ConnectionState.CONNECTED,
  );
  const setWriteQueue = useStatusStore((state) => state.setWriteQueue);
  const [imageIndex, setImageIndex] = useState(0);
  // The artwork reports its cover from an effect, which runs before this
  // component's effects. A cached cover is reported on the first render for a
  // new entry, so a reset effect would discard it. Tie each report to its media.
  const [defaultImageReport, setDefaultImageReport] = useState<{
    mediaKey: string;
    type: string | null;
  } | null>(null);
  const [availabilityReport, setAvailabilityReport] = useState<{
    mediaKey: string;
    available: boolean;
  } | null>(null);
  const [launching, setLaunching] = useState(false);
  const [preparingWrite, setPreparingWrite] = useState(false);
  const [writeOptionsOpen, setWriteOptionsOpen] = useState(false);
  const [resolvedWritePath, setResolvedWritePath] = useState<string | null>(
    null,
  );
  const launchControllerRef = useRef<AbortController | null>(null);
  const writeControllerRef = useRef<AbortController | null>(null);
  const previousImageButtonRef = useRef<HTMLButtonElement>(null);
  const nextImageButtonRef = useRef<HTMLButtonElement>(null);
  const [retainedSelection, setRetainedSelection] = useState<{
    entry: MediaBrowseEntry;
    systemId: string;
  } | null>(() =>
    props.entry ? { entry: props.entry, systemId: props.systemId } : null,
  );
  const entry = props.entry ?? retainedSelection?.entry ?? null;
  const systemId = props.entry
    ? props.systemId
    : (retainedSelection?.systemId ?? props.systemId);
  const mediaKey = entry
    ? JSON.stringify([props.deviceKey, ...mediaRefKey(entry, systemId)])
    : null;
  const resolvedDefaultType =
    defaultImageReport?.mediaKey === mediaKey ? defaultImageReport.type : null;
  const imageAvailable =
    availabilityReport?.mediaKey === mediaKey
      ? availabilityReport.available
      : entry?.hasCover === false
        ? false
        : null;

  useEffect(() => {
    if (!props.entry) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Preserve full sheet content while its close transition runs.
    setRetainedSelection({ entry: props.entry, systemId: props.systemId });
  }, [props.entry, props.systemId]);

  const metadataQuery = useQuery({
    queryKey: [
      LIBRARY_QUERY_KEYS.meta,
      props.deviceKey,
      ...(entry ? mediaRefKey(entry, systemId) : [null, "", ""]),
    ],
    queryFn: ({ signal }) => {
      if (!entry) throw new Error("Media selection is unavailable");
      return fetchLibraryMediaMeta(entry, systemId, signal);
    },
    enabled: props.isOpen && entry !== null,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    retry: false,
  });
  const writeAvailable = useNfcWriteAvailable(props.deviceKey, props.isOpen);
  const deckList = useQuery({
    queryKey: [LIBRARY_QUERY_KEYS.decks, props.deviceKey],
    queryFn: ({ signal }) => CoreAPI.decks(signal),
    enabled:
      deckPickerOpen &&
      liveConnected &&
      decksFeature.available &&
      Boolean(props.deviceKey),
  });
  const addToDeck = async (deckId?: string) => {
    if (
      !entry ||
      !systemId ||
      (!entry.path && entry.mediaId === undefined) ||
      !liveConnected ||
      (!deckId && !newDeckName.trim()) ||
      deckSaving
    )
      return;
    setDeckSaving(true);
    if (deckId) setDeckPickerOpen(false);
    try {
      const media = mediaDeckItem(entry, showFilenames);
      const updated = deckId
        ? await CoreAPI.deckUpdate({ deckId, addItems: [media] })
        : await CoreAPI.deckNew({ name: newDeckName.trim(), items: [media] });
      await refreshDecks(queryClient, props.deviceKey, updated);
      setNewDeckName("");
      setCreatingDeck(false);
      setDeckPickerOpen(false);
      toast.success(t("decks.added"));
    } catch (error) {
      logger.error("Failed to add media to deck", error, {
        category: "api",
        action: "deckAddMedia",
      });
      setDeckPickerOpen(true);
      toast.error(t("decks.addError"));
    } finally {
      setDeckSaving(false);
    }
  };
  const metadata = metadataQuery.data?.media;
  const metadataWritePath =
    entry?.type !== "media" && metadata?.path !== entry?.path
      ? metadata?.path
      : undefined;
  const writeSource = useMemo(
    () =>
      entry
        ? {
            path:
              entry.type === "media"
                ? entry.path
                : (resolvedWritePath ?? metadataWritePath ?? ""),
            relativePath:
              entry.type === "media" ? entry.relativePath : undefined,
            zapScript: entry.zapScript,
            tags: mergeLibraryTags(
              entry.disambiguatingTags ?? [],
              entry.tags ?? [],
            ),
          }
        : null,
    [entry, metadataWritePath, resolvedWritePath],
  );
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
    setLaunching(false);
    setPreparingWrite(false);
    setWriteOptionsOpen(false);
    setResolvedWritePath(null);
    launchControllerRef.current?.abort();
    launchControllerRef.current = null;
    writeControllerRef.current?.abort();
    writeControllerRef.current = null;
  }, [entry]);

  useEffect(() => {
    if (props.isOpen) return;

    writeControllerRef.current?.abort();
    writeControllerRef.current = null;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- External parent closure resets transient write state.
    setPreparingWrite(false);
    setWriteOptionsOpen(false);
  }, [props.isOpen]);

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

  const rememberResolvedType = useCallback(
    (typeTag: string) => {
      if (mediaKey === null) return;
      const type = imageTypeFromTypeTag(typeTag);
      setDefaultImageReport((current) =>
        current?.mediaKey === mediaKey && current.type === type
          ? current
          : { mediaKey, type },
      );
    },
    [mediaKey],
  );
  const rememberImageAvailability = useCallback(
    (available: boolean) => {
      if (mediaKey === null) return;
      setAvailabilityReport((current) =>
        current?.mediaKey === mediaKey && current.available === available
          ? current
          : { mediaKey, available },
      );
    },
    [mediaKey],
  );

  const closeModal = () => {
    setDeckPickerOpen(false);
    launchControllerRef.current?.abort();
    launchControllerRef.current = null;
    writeControllerRef.current?.abort();
    writeControllerRef.current = null;
    setLaunching(false);
    setPreparingWrite(false);
    props.close();
  };

  const launch = async () => {
    if (!entry || launching || preparingWrite || !liveConnected) return;
    const controller = new AbortController();
    launchControllerRef.current?.abort();
    launchControllerRef.current = controller;
    setLaunching(true);
    try {
      const text = await resolveLibraryLaunchText(
        entry,
        systemId,
        controller.signal,
      );
      if (!text) throw new Error("Launch target could not be resolved");
      await CoreAPI.run({ text });
    } catch (error) {
      if (controller.signal.aborted) return;
      logRunFailure("Failed to launch media from Library", error, {
        action: "launchLibraryMedia",
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
    const selectionAvailable =
      writeSource && shouldSelectMediaWriteTarget(writeSource);
    if (selectionAvailable && getMediaWritePath(writeSource)) {
      setWriteOptionsOpen(true);
      return;
    }

    const controller = new AbortController();
    writeControllerRef.current?.abort();
    writeControllerRef.current = controller;
    setPreparingWrite(true);
    try {
      if (selectionAvailable) {
        const resolvedPath = await resolveLibraryLaunchText(
          entry,
          systemId,
          controller.signal,
        );
        if (controller.signal.aborted) return;
        if (resolvedPath && resolvedPath !== writeSource.zapScript) {
          setResolvedWritePath(resolvedPath);
        }
        setWriteOptionsOpen(true);
        return;
      }

      const text =
        entry.type === "media" && writeSource
          ? getDefaultMediaWriteValue(writeSource)
          : await resolveLibraryWriteText(entry, systemId, controller.signal);
      if (controller.signal.aborted) return;
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
    metadata?.title.system.id || systemId,
    metadata?.title.system.name || systemId,
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
  const footer = entry ? (
    <ModalActionRail
      aria-label={t("library.mediaActions")}
      actions={
        <>
          <MediaPreferenceActions
            key={mediaKey}
            entry={entry}
            fallbackSystemId={systemId}
            deviceKey={props.deviceKey}
            metadataTags={metadata?.tags}
            context="modal"
          />
          {decksFeature.available &&
            entry.type === "media" &&
            (entry.mediaId !== undefined || (systemId && entry.path)) && (
              <Button
                label={t("decks.addAction")}
                icon={<ListPlusIcon size={20} />}
                variant="text"
                layout="responsive"
                className="whitespace-nowrap"
                disabled={!liveConnected || deckSaving}
                onClick={() => setDeckPickerOpen(true)}
              />
            )}
          <Button
            label={t("library.writeAction")}
            aria-label={
              preparingWrite ? t("library.preparingWrite") : t("library.write")
            }
            icon={
              preparingWrite ? (
                <LoadingSpinner size={20} decorative />
              ) : (
                <CreateIcon size="20" />
              )
            }
            layout="responsive"
            variant="text"
            className={classNames(
              "whitespace-nowrap",
              (preparingWrite || (launching && writeAvailable)) &&
                "disabled:!text-white",
            )}
            disabled={!writeAvailable || preparingWrite || launching}
            onClick={() => void write()}
          />
        </>
      }
      primaryAction={
        props.context !== "nowPlaying" ? (
          <Button
            label={t("library.launch")}
            aria-label={
              launching ? t("library.launching") : t("library.launch")
            }
            icon={
              launching ? (
                <LoadingSpinner size={20} decorative />
              ) : (
                <PlayIcon size={20} />
              )
            }
            intent="primary"
            className={
              launching || (preparingWrite && liveConnected)
                ? "bg-button-pattern disabled:!border-[var(--color-border-filled)] disabled:!text-white"
                : undefined
            }
            disabled={!liveConnected || launching || preparingWrite}
            onClick={() => void launch()}
          />
        ) : undefined
      }
    />
  ) : undefined;

  const detailsModal = (
    <SlideModal
      isOpen={props.isOpen && !writeOptionsOpen && !deckPickerOpen}
      close={closeModal}
      title={title}
      footer={footer}
      footerSkipLabel={t("accessibility.skipToActions")}
    >
      {entry && (
        <div className="flex flex-col gap-4 py-2">
          {imageAvailable !== false && (
            <div className="flex flex-col gap-2">
              <div className="relative h-64 w-full">
                <LibraryArtwork
                  entry={entry}
                  systemId={systemId}
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

  const writeOptionsModalOpen = props.isOpen && writeOptionsOpen;
  const editableDecks = (deckList.data?.decks ?? []).filter(canEditDeck);
  const matchingDecks = editableDecks.filter((deck) =>
    deck.name.toLowerCase().includes(deckSearch.trim().toLowerCase()),
  );

  return (
    <>
      {detailsModal}
      <SlideModal
        isOpen={props.isOpen && deckPickerOpen && !creatingDeck}
        close={() => setDeckPickerOpen(false)}
        title={t("decks.addAction")}
        footer={
          <Button
            label={t("decks.new")}
            icon={<PlusIcon size={20} />}
            variant="outline"
            className="w-full"
            disabled={deckSaving || !liveConnected}
            onClick={() => setCreatingDeck(true)}
          />
        }
      >
        <div className="flex flex-col gap-3 py-2">
          <TextInput
            type="search"
            aria-label={t("decks.search")}
            placeholder={t("decks.search")}
            value={deckSearch}
            setValue={setDeckSearch}
            clearable
          />
          {deckList.isLoading ? (
            <p role="status" className="text-muted-foreground">
              {t("decks.loading")}
            </p>
          ) : deckList.isError ? (
            <EmptyState
              size="compact"
              title={t("decks.loadError")}
              action={
                <Button
                  label={t("library.tryAgain")}
                  variant="outline"
                  onClick={() => void deckList.refetch()}
                />
              }
            />
          ) : matchingDecks.length > 0 ? (
            <div
              role="group"
              aria-label={t("decks.title")}
              className="flex flex-col"
            >
              {matchingDecks.map((deck) => (
                <button
                  key={deck.deckId}
                  type="button"
                  className="flex min-h-14 w-full items-center justify-between gap-3 border-b border-white/25 px-1 py-3 text-left last:border-b-0 focus-visible:ring-2 focus-visible:ring-white/50 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={
                    deckSaving ||
                    !liveConnected ||
                    deck.itemCount >= MAX_DECK_ITEMS
                  }
                  onPointerUp={handleDeckPress}
                  onClick={() => void addToDeck(deck.deckId)}
                >
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="font-medium break-words">{deck.name}</span>
                    <span className="text-muted-foreground text-sm">
                      {t("library.itemCount", { count: deck.itemCount })}
                    </span>
                  </span>
                  <ChevronRightIcon
                    size={20}
                    aria-hidden="true"
                    className="shrink-0"
                  />
                </button>
              ))}
            </div>
          ) : (
            <EmptyState
              size="compact"
              title={t(deckSearch.trim() ? "decks.noMatching" : "decks.empty")}
            />
          )}
        </div>
      </SlideModal>
      <SlideModal
        isOpen={props.isOpen && deckPickerOpen && creatingDeck}
        close={() => setCreatingDeck(false)}
        dismissible={!deckSaving}
        title={t("decks.new")}
        footer={
          <div className="flex flex-col gap-2">
            <Button
              label={t("decks.createAndAdd")}
              icon={<PlusIcon size={20} />}
              intent="primary"
              className="w-full"
              disabled={!newDeckName.trim() || deckSaving || !liveConnected}
              onClick={() => void addToDeck()}
            />
            <Button
              label={t("nav.cancel")}
              variant="outline"
              className="w-full"
              disabled={deckSaving}
              onClick={() => setCreatingDeck(false)}
            />
          </div>
        }
      >
        <div className="py-2">
          <TextInput
            label={t("decks.name")}
            value={newDeckName}
            setValue={setNewDeckName}
            maxLength={100}
            disabled={deckSaving}
            required
            onKeyUp={(event) => {
              if (event.key === "Enter") void addToDeck();
            }}
          />
        </div>
      </SlideModal>
      {writeOptionsModalOpen && (
        <MediaWriteTargetModal
          isOpen={writeOptionsModalOpen}
          close={() => setWriteOptionsOpen(false)}
          media={writeSource}
          onWrite={(text) => {
            setWriteOptionsOpen(false);
            closeModal();
            setWriteQueue(text);
          }}
        />
      )}
    </>
  );
}
