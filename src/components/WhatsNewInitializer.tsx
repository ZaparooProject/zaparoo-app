import { useCallback, useEffect, useRef, useState } from "react";
import { WhatsNewDialog } from "@/components/WhatsNewDialog";
import { usePreferencesStore } from "@/lib/preferencesStore";
import {
  getWhatsNewAnnouncement,
  resolveRuntimeReleaseIdentity,
  type WhatsNewAnnouncement,
} from "@/lib/whatsNew";

const MODAL_TRANSITION_MS = 200;

export function WhatsNewInitializer() {
  // Seen announcements are unknown while running on fallback defaults.
  const preferencesLoaded = usePreferencesStore(
    (state) => state._preferencesHydrationSucceeded,
  );
  const tourCompleted = usePreferencesStore((state) => state.tourCompleted);
  const whatsNewInitialized = usePreferencesStore(
    (state) => state.whatsNewInitialized,
  );
  const seenAnnouncementIds = usePreferencesStore(
    (state) => state.seenWhatsNewAnnouncementIds,
  );
  const initializeWhatsNew = usePreferencesStore(
    (state) => state.initializeWhatsNew,
  );
  const setLastWhatsNewRuntimeKey = usePreferencesStore(
    (state) => state.setLastWhatsNewRuntimeKey,
  );
  const markWhatsNewSeen = usePreferencesStore(
    (state) => state.markWhatsNewSeen,
  );

  const [pendingAnnouncement, setPendingAnnouncement] =
    useState<WhatsNewAnnouncement | null>(null);
  const [pendingRuntimeKey, setPendingRuntimeKey] = useState<string | null>(
    null,
  );
  const [isOpen, setIsOpen] = useState(false);
  const processedRuntimeKeyRef = useRef<string | null>(null);
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dismissingRef = useRef(false);

  useEffect(() => {
    if (!preferencesLoaded) return;

    let cancelled = false;

    const prepareWhatsNew = async () => {
      const identity = await resolveRuntimeReleaseIdentity();
      if (cancelled || processedRuntimeKeyRef.current === identity.releaseKey) {
        return;
      }

      processedRuntimeKeyRef.current = identity.releaseKey;
      const announcement = getWhatsNewAnnouncement(identity.releaseKey);

      if (!whatsNewInitialized) {
        if (tourCompleted && announcement) {
          // TODO: After one release has shipped with whats-new state seeded,
          // remove this legacy-install branch and always seed uninitialized
          // installs without showing an announcement.
          setPendingAnnouncement(announcement);
          setPendingRuntimeKey(identity.releaseKey);
          return;
        }

        initializeWhatsNew(identity.releaseKey, announcement?.id ?? null);
        return;
      }

      if (!announcement) {
        setLastWhatsNewRuntimeKey(identity.releaseKey);
        return;
      }

      if (seenAnnouncementIds.includes(announcement.id)) {
        setLastWhatsNewRuntimeKey(identity.releaseKey);
        return;
      }

      setPendingAnnouncement(announcement);
      setPendingRuntimeKey(identity.releaseKey);
    };

    prepareWhatsNew();

    return () => {
      cancelled = true;
    };
  }, [
    preferencesLoaded,
    initializeWhatsNew,
    seenAnnouncementIds,
    setLastWhatsNewRuntimeKey,
    tourCompleted,
    whatsNewInitialized,
  ]);

  useEffect(() => {
    if (
      !pendingAnnouncement ||
      !tourCompleted ||
      isOpen ||
      dismissingRef.current
    ) {
      return;
    }

    const timer = setTimeout(() => {
      setIsOpen(true);
    }, 300);

    return () => clearTimeout(timer);
  }, [isOpen, pendingAnnouncement, tourCompleted]);

  useEffect(
    () => () => {
      if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
    },
    [],
  );

  const handleDismiss = useCallback(() => {
    dismissingRef.current = true;
    if (pendingAnnouncement && pendingRuntimeKey) {
      markWhatsNewSeen(pendingAnnouncement.id, pendingRuntimeKey);
    }
    setIsOpen(false);
    if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
    dismissTimerRef.current = setTimeout(() => {
      setPendingAnnouncement(null);
      setPendingRuntimeKey(null);
      dismissingRef.current = false;
      dismissTimerRef.current = null;
    }, MODAL_TRANSITION_MS);
  }, [markWhatsNewSeen, pendingAnnouncement, pendingRuntimeKey]);

  return (
    <WhatsNewDialog
      isOpen={isOpen}
      announcement={pendingAnnouncement}
      onDismiss={handleDismiss}
    />
  );
}
