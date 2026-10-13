import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ListPlusIcon } from "lucide-react";
import type { MetadataLinkTarget } from "@/components/library/LibraryMetadataLink";
import {
  DetailRow,
  LibraryFactRows,
  LibraryMediaFacts,
  TechnicalDetails,
} from "@/components/library/LibraryMediaFacts";
import {
  useLibraryFactValueLabel,
  useLibraryMediaMeta,
} from "@/components/library/useLibraryMediaFacts";
import { CoreAPI, logRunFailure } from "@/lib/coreApi";
import { logger } from "@/lib/logger";
import {
  collectLibraryMetadata,
  libraryEntryDisplayName,
  mediaRefKey,
  mergeLibraryTags,
  organizeLibraryDetailTags,
  type LibraryDetailFactType,
  resolveLibraryLaunchText,
  resolveLibraryWriteText,
} from "@/lib/libraryMedia";
import type { MediaBrowseEntry } from "@/lib/models";
import { usePreferencesStore } from "@/lib/preferencesStore";
import { ConnectionState, useStatusStore } from "@/lib/store";
import { useSystemNameResolver } from "@/hooks/useSystemName";
import { useNfcWriteAvailable } from "@/hooks/useNfcWriteAvailable";
import { useContextualNfcWrite } from "@/hooks/useContextualNfcWrite";
import { showRateLimitedErrorToast } from "@/lib/toastUtils";
import { SlideModal } from "@/components/SlideModal";
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

/** Facts repeated as a plain caption beneath the artwork. */
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
  const factValueLabel = useLibraryFactValueLabel();
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

  const metadataQuery = useLibraryMediaMeta(
    entry,
    systemId,
    props.deviceKey,
    props.isOpen,
  );
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
  const resolvedSystemName = resolveSystemName(
    metadata?.title.system.id || systemId,
    metadata?.title.system.name || systemId,
  );
  const linkTarget: MetadataLinkTarget | null = entry
    ? {
        entry,
        systemId: metadata?.title.system.id || systemId,
        deviceKey: props.deviceKey,
        owner: props.returnOwner,
      }
    : null;
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

            <p className="text-muted-foreground text-center text-sm">
              {[
                resolvedSystemName,
                ...summaryFacts.flatMap((fact) =>
                  fact.tags.map((tag) => factValueLabel(fact.type, tag)),
                ),
              ].join(" • ")}
            </p>

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

            <LibraryMediaFacts
              target={linkTarget}
              systemName={resolvedSystemName}
              facts={detailTagView.facts}
              tags={detailTagView.tags}
            />

            <TechnicalDetails>
              <LibraryFactRows
                target={linkTarget}
                facts={detailTagView.technicalFacts}
              />
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
            </TechnicalDetails>
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
