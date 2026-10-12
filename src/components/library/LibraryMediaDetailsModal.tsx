import {
  Fragment,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { ChevronRightIcon, ListPlusIcon } from "lucide-react";
import {
  LibraryMetadataLink,
  type MetadataLinkTarget,
} from "@/components/library/LibraryMetadataLink";
import { libraryTagDisplayLabel } from "@/lib/libraryTagLabels";
import { CoreAPI, logRunFailure } from "@/lib/coreApi";
import { logger } from "@/lib/logger";
import {
  collectLibraryMetadata,
  fetchLibraryMediaMeta,
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
import { useContextualNfcWrite } from "@/hooks/useContextualNfcWrite";
import { useCoreFeature } from "@/hooks/useCoreFeature";
import { showRateLimitedErrorToast } from "@/lib/toastUtils";
import { SlideModal } from "@/components/SlideModal";
import { TagBadge } from "@/components/TagBadge";
import { Button } from "@/components/wui/Button";
import { EmptyState } from "@/components/wui/EmptyState";
import { DelayedLoading } from "@/components/DelayedLoading";
import { InlineLoading } from "@/components/InlineLoading";
import {
  ContextualWriteRail,
  LaunchButton,
} from "@/components/library/ContextualWriteRail";
import { LibraryAddToDeckModals } from "@/components/library/LibraryAddToDeck";
import { useLibraryAddToDeck } from "@/components/library/useLibraryAddToDeck";
import { LibraryDetailArtwork } from "@/components/library/LibraryDetailArtwork";
import { MediaPreferenceActions } from "@/components/library/MediaPreferenceActions";
import { MediaWriteTargetModal } from "@/components/MediaWriteTargetModal";
import {
  getDefaultMediaWriteValue,
  getMediaWritePath,
  shouldSelectMediaWriteTarget,
} from "@/lib/mediaWriteTarget";

/** Label/value row; stacks on phones and inside the docked details pane. */
export function DetailRow(props: {
  label: string;
  value?: string;
  children?: ReactNode;
  mono?: boolean;
}) {
  if (!props.value && !props.children) return null;
  return (
    <div className="library-detail-row">
      <span className="text-muted-foreground text-sm sm:min-w-[120px]">
        {props.label}
      </span>
      <span
        className={`min-w-0 flex-1 break-words ${props.mono ? "font-mono text-sm" : "font-medium"}`}
      >
        {props.children ?? props.value}
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

const SUMMARY_FACT_TYPES: readonly LibraryDetailFactType[] = [
  "year",
  "players",
];

export function LibraryMediaDetailsModal(props: {
  isOpen: boolean;
  close: () => void;
  entry: MediaBrowseEntry | null;
  systemId: string;
  deviceKey: string;
  context?: "library" | "nowPlaying";
  returnOwner?: string;
  docked?: boolean;
}) {
  const { t } = useTranslation();
  const metadataSearchFeature = useCoreFeature("mediaTags", {
    requireKnownSupport: true,
  });
  const libraryFeature = useCoreFeature("mediaLibrary", {
    requireKnownSupport: true,
  });
  const showFilenames = usePreferencesStore((state) => state.showFilenames);
  const resolveSystemName = useSystemNameResolver();
  // `connected` stays true while reconnecting so cached data remains usable.
  // Launching needs a live socket, or it would sit out the request timeout.
  const liveConnected = useStatusStore(
    (state) => state.connectionState === ConnectionState.CONNECTED,
  );
  const [launching, setLaunching] = useState(false);
  const [preparingWrite, setPreparingWrite] = useState(false);
  const [writeOptionsOpen, setWriteOptionsOpen] = useState(false);
  const [resolvedWritePath, setResolvedWritePath] = useState<string | null>(
    null,
  );
  const launchControllerRef = useRef<AbortController | null>(null);
  const writeControllerRef = useRef<AbortController | null>(null);
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
  const writeActivity = useContextualNfcWrite(mediaKey, props.isOpen);
  const deckFlow = useLibraryAddToDeck({
    entry,
    systemId,
    deviceKey: props.deviceKey,
    mediaKey,
    detailsOpen: props.isOpen,
  });

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
  const fallbackTitle = entry
    ? libraryEntryDisplayName(entry, showFilenames)
    : "";
  const title = metadataView?.title || fallbackTitle;
  const description = metadataView?.description || entry?.description || "";

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- A new external media selection starts a fresh action state.
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

  const closeModal = () => {
    deckFlow.closePicker();
    launchControllerRef.current?.abort();
    launchControllerRef.current = null;
    writeControllerRef.current?.abort();
    writeControllerRef.current = null;
    setLaunching(false);
    setPreparingWrite(false);
    void writeActivity.cancel();
    props.close();
  };

  const launch = async () => {
    if (
      !entry ||
      launching ||
      preparingWrite ||
      writeActivity.active ||
      !liveConnected
    )
      return;
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
    if (
      !entry ||
      preparingWrite ||
      launching ||
      writeActivity.active ||
      writeActivity.externalWriteActive ||
      !writeAvailable
    )
      return;
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
      void writeActivity.start(text);
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
  const summaryFacts = detailTagView.facts.filter((fact) =>
    SUMMARY_FACT_TYPES.includes(fact.type),
  );
  const detailFacts = detailTagView.facts.filter(
    (fact) => !SUMMARY_FACT_TYPES.includes(fact.type),
  );
  const resolvedSystemName = resolveSystemName(
    metadata?.title.system.id || systemId,
    metadata?.title.system.name || systemId,
  );
  const factValueLabel = (type: LibraryDetailFactType, tag: TagInfo) => {
    const value = libraryTagDisplayLabel(tag, t);
    if (type !== "players") return value;
    const count = Number(value);
    return Number.isInteger(count) && count >= 0
      ? t("library.playerCount", { count })
      : t("library.playersValue", { value });
  };
  const linkTarget: MetadataLinkTarget | null = entry
    ? {
        entry,
        systemId: metadata?.title.system.id || systemId,
        deviceKey: props.deviceKey,
        owner: props.returnOwner,
      }
    : null;
  const canExploreTags =
    libraryFeature.available && metadataSearchFeature.available;
  const factLinks = (
    target: MetadataLinkTarget,
    type: LibraryDetailFactType,
    tags: readonly TagInfo[],
  ) =>
    tags.map((tag, index) => {
      const value = factValueLabel(type, tag);
      return {
        key: `${tag.type}:${tag.tag}:${index}`,
        link: (
          <LibraryMetadataLink
            {...target}
            tag={tag}
            enabled={canExploreTags}
            label={`${t(metadataFactLabelKey(type))}: ${value}`}
          >
            {value}
          </LibraryMetadataLink>
        ),
      };
    });
  const footer = entry ? (
    <ContextualWriteRail
      aria-label={t("library.mediaActions")}
      activity={writeActivity}
      writeDisabled={!writeAvailable}
      busy={launching}
      preparing={preparingWrite}
      preparingLabel={t("library.preparingWrite")}
      onWrite={() => void write()}
      primaryAction={
        props.context !== "nowPlaying" ? (
          <LaunchButton
            label={t("library.launch")}
            launching={launching}
            unavailable={!liveConnected}
            busy={preparingWrite || writeActivity.active}
            onLaunch={() => void launch()}
          />
        ) : undefined
      }
    >
      <MediaPreferenceActions
        key={mediaKey}
        entry={entry}
        fallbackSystemId={systemId}
        deviceKey={props.deviceKey}
        metadataTags={metadata?.tags}
        context="modal"
      />
      {deckFlow.available && (
        <Button
          label={t("decks.addAction")}
          icon={<ListPlusIcon size={20} />}
          variant="text"
          layout="responsive"
          className="whitespace-nowrap"
          disabled={!liveConnected || deckFlow.saving || writeActivity.active}
          disabledAppearance={deckFlow.saving ? "busy" : "unavailable"}
          onClick={deckFlow.openPicker}
        />
      )}
    </ContextualWriteRail>
  ) : undefined;

  const writeOptionsModalOpen = props.isOpen && writeOptionsOpen;

  return (
    <>
      <SlideModal
        isOpen={
          props.isOpen &&
          (props.docked || (!writeOptionsOpen && !deckFlow.pickerOpen))
        }
        presentation={props.docked ? "pane" : "modal"}
        suspendWhenCovered
        close={closeModal}
        title={title}
        footer={footer}
        footerSkipLabel={t("accessibility.skipToActions")}
      >
        {entry && linkTarget && (
          <div className="flex flex-col gap-4 py-2">
            <LibraryDetailArtwork
              key={mediaKey}
              entry={entry}
              systemId={systemId}
              deviceKey={props.deviceKey}
              title={title}
              metadata={metadata}
            />

            <div className="text-muted-foreground flex flex-wrap items-center justify-center gap-x-2 text-center text-sm">
              <LibraryMetadataLink
                {...linkTarget}
                enabled={libraryFeature.available}
                label={`${t("library.system")}: ${resolvedSystemName}`}
              >
                {resolvedSystemName}
              </LibraryMetadataLink>
              {summaryFacts.flatMap((fact) =>
                factLinks(linkTarget, fact.type, fact.tags).map(
                  ({ key, link }) => (
                    <span key={key} className="inline-flex items-center gap-2">
                      <span aria-hidden="true">•</span>
                      {link}
                    </span>
                  ),
                ),
              )}
            </div>

            {metadataQuery.isLoading && (
              <DelayedLoading>
                <InlineLoading
                  label={t("library.loadingMetadata")}
                  className="py-0"
                />
              </DelayedLoading>
            )}
            {metadataQuery.isError && (
              <EmptyState
                size="compact"
                title={t("library.metadataError")}
                action={
                  <Button
                    label={t("library.tryAgain")}
                    variant="outline"
                    onClick={() => void metadataQuery.refetch()}
                  />
                }
              />
            )}

            {description && (
              <p className="text-foreground text-sm whitespace-pre-wrap">
                {description}
              </p>
            )}

            {(detailFacts.length > 0 || detailTagView.tags.length > 0) && (
              <section className="flex flex-col gap-3">
                <h2 className="text-lg font-semibold">
                  {t("library.details")}
                </h2>
                {detailFacts.map((fact) => (
                  <DetailRow
                    key={fact.type}
                    label={t(metadataFactLabelKey(fact.type))}
                  >
                    <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1">
                      {factLinks(linkTarget, fact.type, fact.tags).map(
                        ({ key, link }) => (
                          <Fragment key={key}>{link}</Fragment>
                        ),
                      )}
                    </span>
                  </DetailRow>
                ))}
                {detailTagView.tags.length > 0 && (
                  <DetailRow label={t("library.tags")}>
                    <span className="flex flex-wrap gap-1.5">
                      {detailTagView.tags.map((tag, index) => {
                        const displayTag = `${tag.type}:${libraryTagDisplayLabel(tag, t)}`;
                        return (
                          <LibraryMetadataLink
                            key={`${tag.type}:${tag.tag}:${index}`}
                            {...linkTarget}
                            tag={tag}
                            enabled={canExploreTags}
                            label={`${t("library.tags")}: ${displayTag}`}
                          >
                            <TagBadge
                              type={tag.type}
                              tag={tag.tag}
                              displayTag={displayTag}
                            />
                          </LibraryMetadataLink>
                        );
                      })}
                    </span>
                  </DetailRow>
                )}
              </section>
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
      <LibraryAddToDeckModals flow={deckFlow} />
      {writeOptionsModalOpen && (
        <MediaWriteTargetModal
          isOpen={writeOptionsModalOpen}
          close={() => setWriteOptionsOpen(false)}
          media={writeSource}
          onWrite={(text) => {
            setWriteOptionsOpen(false);
            void writeActivity.start(text);
          }}
        />
      )}
    </>
  );
}
