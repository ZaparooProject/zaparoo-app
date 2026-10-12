import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import toast from "react-hot-toast";
import { CoreAPI } from "@/lib/coreApi";
import { mediaDeckItem, refreshDecks } from "@/lib/decks";
import { logger } from "@/lib/logger";
import type { MediaBrowseEntry } from "@/lib/models";
import { usePreferencesStore } from "@/lib/preferencesStore";
import { ConnectionState, useStatusStore } from "@/lib/store";
import { useCoreFeature } from "@/hooks/useCoreFeature";

/**
 * Add-to-deck picker state for one media details surface. `mediaKey` and
 * `detailsOpen` describe the surface, so late results never act on another
 * selection.
 */
export function useLibraryAddToDeck(props: {
  entry: MediaBrowseEntry | null;
  systemId: string;
  deviceKey: string;
  mediaKey: string | null;
  detailsOpen: boolean;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const feature = useCoreFeature("decks", { requireKnownSupport: true });
  const showFilenames = usePreferencesStore((state) => state.showFilenames);
  const liveConnected = useStatusStore(
    (state) => state.connectionState === ConnectionState.CONNECTED,
  );
  const [pickerOpen, setPickerOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [newDeckName, setNewDeckName] = useState("");
  const [search, setSearch] = useState("");
  const surfaceRef = useRef({
    mediaKey: props.mediaKey,
    open: props.detailsOpen,
  });
  useLayoutEffect(() => {
    surfaceRef.current = { mediaKey: props.mediaKey, open: props.detailsOpen };
  }, [props.mediaKey, props.detailsOpen]);

  useEffect(() => {
    if (!props.detailsOpen) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- External dismissal must not reopen a stale deck picker with the next media selection.
      setPickerOpen(false);
      setCreating(false);
      setSearch("");
      setNewDeckName("");
    }
  }, [props.detailsOpen]);

  const { entry, systemId, deviceKey } = props;
  const add = async (deckId?: string) => {
    if (
      !entry ||
      !systemId ||
      (!entry.path && entry.mediaId === undefined) ||
      !liveConnected ||
      (!deckId && !newDeckName.trim()) ||
      saving
    )
      return;
    const startedFor = props.mediaKey;
    const surfaceUnchanged = () =>
      surfaceRef.current.open && surfaceRef.current.mediaKey === startedFor;
    setSaving(true);
    if (deckId) setPickerOpen(false);
    try {
      const media = mediaDeckItem(entry, showFilenames);
      const updated = deckId
        ? await CoreAPI.deckUpdate({ deckId, addItems: [media] })
        : await CoreAPI.deckNew({ name: newDeckName.trim(), items: [media] });
      await refreshDecks(queryClient, deviceKey, updated);
      setNewDeckName("");
      setCreating(false);
      if (surfaceUnchanged()) setPickerOpen(false);
      toast.success(t("decks.added"));
    } catch (error) {
      logger.error("Failed to add media to deck", error, {
        category: "api",
        action: "deckAddMedia",
      });
      // Only the surface that started the request gets its picker back.
      if (surfaceUnchanged()) setPickerOpen(true);
      toast.error(t("decks.addError"));
    } finally {
      setSaving(false);
    }
  };

  return {
    available:
      feature.available &&
      entry?.type === "media" &&
      (entry.mediaId !== undefined || Boolean(systemId && entry.path)),
    deviceKey,
    liveConnected,
    decksEnabled: feature.available,
    pickerOpen: pickerOpen && props.detailsOpen,
    creating,
    saving,
    newDeckName,
    search,
    openPicker: () => setPickerOpen(true),
    closePicker: () => setPickerOpen(false),
    setCreating,
    setNewDeckName,
    setSearch,
    add,
  };
}

export type LibraryAddToDeckFlow = ReturnType<typeof useLibraryAddToDeck>;
