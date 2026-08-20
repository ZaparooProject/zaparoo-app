/**
 * ConnectionProvider - Manages device connections and integrates with the app.
 *
 * This replaces CoreApiWebSocket.tsx with a cleaner, more robust implementation
 * using the new transport abstraction layer.
 */

import {
  useEffect,
  useRef,
  useCallback,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useShallow } from "zustand/react/shallow";
import { Capacitor, type PluginListenerHandle } from "@capacitor/core";
import { App } from "@capacitor/app";
import { Network } from "@capacitor/network";
import toast from "react-hot-toast";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import {
  Clock,
  AlertTriangle,
  OctagonAlert,
  TriangleAlert,
} from "lucide-react";
import { showRateLimitedErrorToast } from "@/lib/toastUtils";
import {
  connectionManager,
  type TransportState,
  type DeviceConnection,
} from "@/lib/transport";
import { logger } from "@/lib/logger";
import {
  ClientCapability,
  IndexResponse,
  InboxMessage,
  InboxSeverity,
  type MediaResponse,
  type MediaSlot,
  Notification,
  PlayingResponse,
  PlaytimeLimitReachedParams,
  PlaytimeLimitWarningParams,
  ScrapingStatusNotification,
  TokenResponse,
} from "@/lib/models";
import { isCoreFeatureAvailable } from "@/lib/featureGates";
import { invalidateLibraryImageCache } from "@/lib/libraryImageCache";
import { clearQueuedLibraryImages } from "@/lib/libraryImages";
import { LIBRARY_QUERY_KEYS } from "@/lib/libraryMedia";
import { satisfies as versionSatisfies } from "@/lib/coreVersion";
import {
  CoreAPI,
  CoreApiError,
  isCancelled,
  isExpectedMediaDatabaseError,
  isIndexResponse,
  type NotificationRequest,
} from "@/lib/coreApi";
import {
  DEFAULT_GAMES_INDEX,
  emptyPlaying,
  useStatusStore,
  ConnectionState,
} from "@/lib/store";
import {
  credentialKeyForRecord,
  credentialStore,
  type StoredCredentials,
} from "@/lib/crypto/credentials";
import { reconcileCredentialProvenAliases } from "@/lib/devices/credentialProof";
import {
  deviceRegistry,
  parsedEndpointForRecord,
  resolvedEndpointForRecord,
  resolvedEndpointsForRecord,
  useDeviceRegistry,
  type DeviceRegistrySnapshot,
} from "@/lib/devices/deviceRegistry";
import { isNativePluginAvailable } from "@/lib/capacitorBridge";
import { parseDeviceEndpoint } from "@/lib/devices/endpoint";
import { formatDurationDisplay, formatDurationAccessible } from "@/lib/utils";
import {
  ConnectionContext,
  DeviceConnectionActionsContext,
  type ConnectionContextValue,
  type DeviceConnectionActionsContextValue,
} from "@/hooks/useConnection";
import { useNetworkScan } from "@/hooks/useNetworkScan";
import { useAnnouncer } from "./A11yAnnouncer";
import { PairingModal } from "./PairingModal";

interface ConnectionProviderProps {
  children: ReactNode;
}

const selectActiveRecordId = (state: DeviceRegistrySnapshot) =>
  state.activeRecordId;

const activeRecordOf = (state: DeviceRegistrySnapshot) =>
  state.activeRecordId ? (state.records[state.activeRecordId] ?? null) : null;

async function removeNativeListener(
  handle: PluginListenerHandle,
  label: string,
): Promise<void> {
  try {
    await handle.remove();
  } catch (error) {
    logger.error("Failed to remove native listener", error, {
      category: "lifecycle",
      action: "removeNativeListener",
      severity: "warning",
      listener: label,
    });
  }
}

/**
 * WebSocket candidates for the active record, serialized as a primitive so a
 * metadata-only registry write cannot tear the socket down and rebuild it.
 *
 * Resolved rather than canonical: on iOS a WebSocket to a `.local` name does
 * not reliably bootstrap multicast resolution, so the socket dials every
 * address mDNS resolved while the record keeps the hostname.
 */
const selectConnectionWsUrlsKey = (state: DeviceRegistrySnapshot) =>
  resolvedEndpointsForRecord(activeRecordOf(state))
    .map((endpoint) => endpoint.wsUrl)
    .join("\n");

/** The address pairing runs against — resolved, for the same reason. */
const selectConnectionAddress = (state: DeviceRegistrySnapshot) =>
  resolvedEndpointForRecord(activeRecordOf(state))?.address ?? "";

/**
 * The `.local` name the active record connects through, or `""` when it does
 * not use one. mDNS browsing only exists to resolve these.
 */
const selectMdnsHostname = (state: DeviceRegistrySnapshot) => {
  const host = parsedEndpointForRecord(activeRecordOf(state))?.host ?? "";
  return host.endsWith(".local") ? host : "";
};

const selectMdnsPort = (state: DeviceRegistrySnapshot) =>
  parsedEndpointForRecord(activeRecordOf(state))?.port ?? 0;

const selectActiveDiscoveryId = (state: DeviceRegistrySnapshot) =>
  activeRecordOf(state)?.discoveryId ?? "";

function normalizeMdnsHostname(hostname: string): string {
  return hostname.trim().toLowerCase().replace(/\.+$/, "");
}

/**
 * Absorb a registry write failure that has already been reported.
 *
 * Both rejection paths log for themselves — `commit` for a write attempted
 * before hydration, `persist` for a write that never reached storage — so the
 * only thing left to do here is stop the same failure surfacing a second time
 * as an unhandled rejection, which reaches Rollbar as a duplicate. The
 * connection is unaffected either way: the snapshot is published before it is
 * persisted, so the UI already reflects the change.
 */
const ignoreReportedRegistryFailure = () => {};

const CLIENT_CAPABILITIES_SINCE = "2.16.0";
const MEDIA_TRANSITION_GRACE_MS = 250;
const MEDIA_INDEX_RECONCILE_MS = 2000;
const LEGACY_CLIENT_ACCESS = {
  paired: false,
  role: null,
  capabilities: [
    ClientCapability.ProfilesManage,
    ClientCapability.SettingsWrite,
  ],
};

function getMediaSlot(slot: unknown): MediaSlot | null {
  if (
    slot === undefined ||
    slot === null ||
    slot === "" ||
    slot === "primary"
  ) {
    return "primary";
  }
  if (slot === "background") {
    return "background";
  }
  return null;
}

function getPlaylistForSlot(response: MediaResponse, slot: MediaSlot) {
  return (
    response.playlists?.find(
      (playlist) => getMediaSlot(playlist.slot) === slot,
    ) ?? null
  );
}

function getPlayingForSlot(response: MediaResponse, slot: MediaSlot) {
  return (
    response.active?.find(
      (activeMedia) => getMediaSlot(activeMedia.slot) === slot,
    ) ?? null
  );
}

function indexResponsesEqual(
  current: IndexResponse,
  next: IndexResponse,
): boolean {
  const keys = new Set<keyof IndexResponse>([
    ...(Object.keys(current) as (keyof IndexResponse)[]),
    ...(Object.keys(next) as (keyof IndexResponse)[]),
  ]);
  return [...keys].every((key) => current[key] === next[key]);
}

export function ConnectionProvider({ children }: ConnectionProviderProps) {
  const { t } = useTranslation();
  const { announce } = useAnnouncer();
  const queryClient = useQueryClient();
  const isInitialized = useRef(false);
  // Track current connection to prevent stale events from old connections
  const currentConnectionId = useRef<string | null>(null);
  const previousConnectionRecordId = useRef<string | null>(null);
  const credentialWorkRef = useRef(
    new Map<symbol, { recordId: string; promise: Promise<void> }>(),
  );
  const forgettingRecordIdsRef = useRef(new Set<string>());
  const mdnsRetryPendingForRecord = useRef<string | null>(null);
  // Monotonically identifies the latest current-client capability request.
  // Connection transitions invalidate older callbacks before they can write.
  const currentClientRequestToken = useRef(0);
  const invalidateCurrentClientRequest = useCallback(() => {
    currentClientRequestToken.current++;
  }, []);
  // Pending media-fetch retry; cleared on cleanup so a stale connection
  // can't write its state into the freshly-mounted one.
  const mediaRetryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mediaStopTimers = useRef<
    Record<MediaSlot, ReturnType<typeof setTimeout> | null>
  >({ primary: null, background: null });
  const mediaIndexReconcileTimer = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const mediaIndexReconcileToken = useRef(0);
  const runMediaIndexReconciliationRef = useRef<() => void>(() => {});
  const mediaStateRequestToken = useRef(0);
  const invalidateMediaStateRequest = useCallback(() => {
    mediaStateRequestToken.current++;
  }, []);
  // Pairing modal is auto-opened when the transport reports the server requires
  // encryption (or rejects our credentials). Closed on success or user dismiss.
  const [pairingOpen, setPairingOpen] = useState(false);

  // Refs for stable callback references - prevents effect re-run on callback changes
  const handleConnectionOpenRef = useRef<() => void>(() => {});
  const processNotificationRef = useRef<
    (notification: NotificationRequest) => void
  >(() => {});
  const tRef = useRef(t);

  // Store state
  const {
    setConnectionState,
    setConnectionError,
    setNetworkAvailable,
    beginConnectionIssue,
    clearConnectionIssue,
    setPlaying,
    setBackgroundPlaying,
    setPlaylist,
    setGamesIndex,
    setScrapingStatus,
    setLastToken,
    setActiveTokens,
    clearActiveTokens,
    setStagedToken,
    clearStagedToken,
    setCoreVersion,
    setCorePlatform,
    setCoreVersionPending,
    setCurrentClient,
    setEncryptionState,
    setPairingRequired,
    resetConnectionState,
    addInboxMessage,
    setInboxMessages,
    setInboxModalOpen,
  } = useStatusStore(
    useShallow((state) => ({
      setConnectionState: state.setConnectionState,
      setConnectionError: state.setConnectionError,
      setNetworkAvailable: state.setNetworkAvailable,
      beginConnectionIssue: state.beginConnectionIssue,
      clearConnectionIssue: state.clearConnectionIssue,
      setPlaying: state.setPlaying,
      setBackgroundPlaying: state.setBackgroundPlaying,
      setPlaylist: state.setPlaylist,
      setGamesIndex: state.setGamesIndex,
      setScrapingStatus: state.setScrapingStatus,
      setLastToken: state.setLastToken,
      setActiveTokens: state.setActiveTokens,
      clearActiveTokens: state.clearActiveTokens,
      setStagedToken: state.setStagedToken,
      clearStagedToken: state.clearStagedToken,
      setCoreVersion: state.setCoreVersion,
      setCorePlatform: state.setCorePlatform,
      setCoreVersionPending: state.setCoreVersionPending,
      setCurrentClient: state.setCurrentClient,
      setEncryptionState: state.setEncryptionState,
      setPairingRequired: state.setPairingRequired,
      resetConnectionState: state.resetConnectionState,
      addInboxMessage: state.addInboxMessage,
      setInboxMessages: state.setInboxMessages,
      setInboxModalOpen: state.setInboxModalOpen,
    })),
  );

  const activeRecordId = useDeviceRegistry(selectActiveRecordId);
  const connectionWsUrlsKey = useDeviceRegistry(selectConnectionWsUrlsKey);
  const connectionWsUrls = useMemo(
    () => (connectionWsUrlsKey ? connectionWsUrlsKey.split("\n") : []),
    [connectionWsUrlsKey],
  );
  const connectionWsUrl = connectionWsUrls[0] ?? "";
  const connectionAddress = useDeviceRegistry(selectConnectionAddress);
  const mdnsHostname = useDeviceRegistry(selectMdnsHostname);
  const mdnsPort = useDeviceRegistry(selectMdnsPort);
  const activeDiscoveryId = useDeviceRegistry(selectActiveDiscoveryId);
  const {
    devices: discoveredDevices,
    startScan: startMdnsScan,
    stopScan: stopMdnsScan,
  } = useNetworkScan();

  // Connection state tracked via useState to prevent unnecessary re-renders
  // These are updated via onConnectionChange callback
  const [localConnection, setLocalConnection] =
    useState<DeviceConnection | null>(null);
  const [connectionRevision, setConnectionRevision] = useState(0);
  const updateNetworkAvailability = useCallback(
    (available: boolean) => {
      setNetworkAvailable(available);
      if (!available) {
        if (deviceRegistry.getSnapshot().activeRecordId !== null) {
          beginConnectionIssue();
        }
        return;
      }

      const status = useStatusStore.getState();
      if (
        status.connectionState === ConnectionState.CONNECTED &&
        status.encryptionState !== "unknown"
      ) {
        clearConnectionIssue();
      }
    },
    [beginConnectionIssue, clearConnectionIssue, setNetworkAvailable],
  );

  // Derive display states from local connection state
  const isConnected = localConnection?.state === "connected";
  const hasData = localConnection?.hasData ?? false;
  const hasConnectedBefore = localConnection?.hasConnectedBefore ?? false;

  // Show "Connecting..." for new devices that haven't connected yet
  // Also show when localConnection is null but we have a target address (initial setup)
  const showConnecting =
    !isConnected &&
    !hasConnectedBefore &&
    (localConnection === null
      ? connectionWsUrl !== ""
      : localConnection.state === "connecting" ||
        localConnection.state === "reconnecting");

  // Show "Reconnecting..." for devices that had prior successful connection
  const showReconnecting = !isConnected && (hasData || hasConnectedBefore);

  // The announcement for the device this record names, matched on its service
  // name when it has one and on hostname + port otherwise. An address is never
  // matched on: DHCP hands leases around, and adopting the wrong device's
  // resolution would point the socket at a stranger.
  const resolvedMdnsDevice = useMemo(() => {
    if (mdnsHostname === "") return null;
    const discoveryId = activeDiscoveryId.toLowerCase();

    return (
      discoveredDevices.find((device) => {
        if (
          discoveryId &&
          device.deviceId?.trim().toLowerCase() === discoveryId
        ) {
          return true;
        }
        return (
          device.hostname !== undefined &&
          normalizeMdnsHostname(device.hostname) === mdnsHostname &&
          device.port === mdnsPort
        );
      }) ?? null
    );
  }, [activeDiscoveryId, discoveredDevices, mdnsHostname, mdnsPort]);

  useEffect(() => {
    if (isConnected) mdnsRetryPendingForRecord.current = null;
    if (!resolvedMdnsDevice || !activeRecordId) return;

    const dialHosts = new Set(
      connectionWsUrls.flatMap((url) => {
        const parsedConnection = parseDeviceEndpoint(url);
        return parsedConnection.ok ? [parsedConnection.endpoint.host] : [];
      }),
    );
    const confirmedCurrentRoute = resolvedMdnsDevice.addresses.some(
      (address) => {
        const parsedAddress = parseDeviceEndpoint(address);
        return parsedAddress.ok && dialHosts.has(parsedAddress.endpoint.host);
      },
    );

    void deviceRegistry
      .noteResolvedAddresses(activeRecordId, resolvedMdnsDevice.addresses)
      .then(() => {
        // A persisted mDNS address can be correct while iOS still rejects a
        // socket because local-network resolution has not been primed. The
        // registry does not change when ZeroConf confirms the same route, and
        // the plugin may not re-announce a device cached from an earlier watch.
        // Retry when that route is first confirmed and whenever its connection
        // drops as the shared mDNS watch restarts.
        if (
          confirmedCurrentRoute &&
          !isConnected &&
          mdnsRetryPendingForRecord.current !== activeRecordId &&
          deviceRegistry.getSnapshot().activeRecordId === activeRecordId
        ) {
          mdnsRetryPendingForRecord.current = activeRecordId;
          connectionManager.immediateReconnectActive();
        }
      })
      .catch(ignoreReportedRegistryFailure);
  }, [activeRecordId, connectionWsUrls, isConnected, resolvedMdnsDevice]);

  // Browsing costs battery and multicast traffic, so it runs only until this
  // device's hostname has been resolved on a live connection.
  //
  // Gate on the boolean, not on `resolvedMdnsDevice` itself: a re-announcement
  // produces a fresh object every time, and depending on the object would tear
  // the watch down and rebuild it on each one. The module-level device cache in
  // useNetworkScan outlives stopScan(), so the resolution survives the teardown
  // and a later reconnect does not have to rediscover it.
  const mdnsBrowseSettled = resolvedMdnsDevice !== null && isConnected;
  useEffect(() => {
    if (mdnsHostname === "" || mdnsBrowseSettled) return;
    if (!Capacitor.isNativePlatform()) return;

    void startMdnsScan();
    return () => {
      stopMdnsScan();
    };
  }, [mdnsBrowseSettled, mdnsHostname, startMdnsScan, stopMdnsScan]);

  // Keep refs updated with latest callbacks (but don't trigger effect re-runs)
  useEffect(() => {
    tRef.current = t;
  }, [t]);

  // Map TransportState to ConnectionState for backward compatibility
  const mapTransportState = useCallback(
    (state: TransportState): ConnectionState => {
      switch (state) {
        case "connected":
          return ConnectionState.CONNECTED;
        case "connecting":
          return ConnectionState.CONNECTING;
        case "reconnecting":
          return ConnectionState.RECONNECTING;
        case "disconnected":
          return ConnectionState.DISCONNECTED;
        default:
          return ConnectionState.ERROR;
      }
    },
    [],
  );

  const applyMediaState = useCallback(
    (response: MediaResponse) => {
      setPlaying(getPlayingForSlot(response, "primary") ?? emptyPlaying());
      setBackgroundPlaying(
        getPlayingForSlot(response, "background") ?? emptyPlaying(),
      );
      setPlaylist("primary", getPlaylistForSlot(response, "primary"));
      setPlaylist("background", getPlaylistForSlot(response, "background"));
    },
    [setBackgroundPlaying, setPlaying, setPlaylist],
  );

  const refreshMediaState = useCallback(
    (stoppedSlot?: MediaSlot) => {
      const requestToken = ++mediaStateRequestToken.current;
      void CoreAPI.media()
        .then((response) => {
          if (
            requestToken !== mediaStateRequestToken.current ||
            isCancelled(response)
          ) {
            return;
          }
          applyMediaState(response);
        })
        .catch((error) => {
          if (requestToken !== mediaStateRequestToken.current) {
            return;
          }
          if (stoppedSlot === "primary") {
            setPlaying(emptyPlaying());
            setPlaylist("primary", null);
          } else if (stoppedSlot === "background") {
            setBackgroundPlaying(emptyPlaying());
            setPlaylist("background", null);
          }
          logger.error("Failed to refresh media slot state", error, {
            category: "api",
            action: "media",
            severity: "warning",
          });
        });
    },
    [applyMediaState, setBackgroundPlaying, setPlaying, setPlaylist],
  );

  const cancelMediaStopReconciliation = useCallback((slot: MediaSlot) => {
    const timer = mediaStopTimers.current[slot];
    if (!timer) return;
    clearTimeout(timer);
    mediaStopTimers.current[slot] = null;
  }, []);

  const scheduleMediaStopReconciliation = useCallback(
    (slot: MediaSlot) => {
      cancelMediaStopReconciliation(slot);
      mediaStopTimers.current[slot] = setTimeout(() => {
        mediaStopTimers.current[slot] = null;
        refreshMediaState(slot);
      }, MEDIA_TRANSITION_GRACE_MS);
    },
    [cancelMediaStopReconciliation, refreshMediaState],
  );

  const cancelMediaIndexReconciliation = useCallback(() => {
    if (mediaIndexReconcileTimer.current) {
      clearTimeout(mediaIndexReconcileTimer.current);
      mediaIndexReconcileTimer.current = null;
    }
    mediaIndexReconcileToken.current++;
  }, []);

  const scheduleMediaIndexReconciliation = useCallback(() => {
    if (mediaIndexReconcileTimer.current) {
      clearTimeout(mediaIndexReconcileTimer.current);
    }
    mediaIndexReconcileTimer.current = setTimeout(() => {
      mediaIndexReconcileTimer.current = null;
      runMediaIndexReconciliationRef.current();
    }, MEDIA_INDEX_RECONCILE_MS);
  }, []);

  const applyGamesIndexState = useCallback(
    (nextState: IndexResponse) => {
      const currentState = useStatusStore.getState().gamesIndex;
      if (indexResponsesEqual(currentState, nextState)) {
        return;
      }
      setGamesIndex(nextState);

      const mediaStateChanged =
        currentState.indexing !== nextState.indexing ||
        currentState.optimizing !== nextState.optimizing ||
        currentState.exists !== nextState.exists ||
        currentState.totalMedia !== nextState.totalMedia;
      if (mediaStateChanged) {
        logger.log("Database state changed, invalidating media query");
        queryClient.invalidateQueries({ queryKey: ["media"] });
      }

      // Latest Core increments systemsCompleted after each durable system
      // commit. Older Core omits it but flips indexing/exists at completion.
      const libraryContentChanged =
        currentState.indexing !== nextState.indexing ||
        currentState.exists !== nextState.exists ||
        currentState.totalMedia !== nextState.totalMedia ||
        currentState.systemsCompleted !== nextState.systemsCompleted;
      if (libraryContentChanged) {
        logger.log("Media library changed, invalidating cached lists");
        queryClient.invalidateQueries({ queryKey: ["systems"] });
        queryClient.invalidateQueries({ queryKey: ["tags"] });
        queryClient.invalidateQueries({ queryKey: ["infiniteMediaSearch"] });
        queryClient.invalidateQueries({
          queryKey: [LIBRARY_QUERY_KEYS.favorites],
        });
        queryClient.invalidateQueries({
          queryKey: [LIBRARY_QUERY_KEYS.browse],
        });
        queryClient.invalidateQueries({
          queryKey: [LIBRARY_QUERY_KEYS.browseIndex],
        });
        queryClient.invalidateQueries({
          queryKey: [LIBRARY_QUERY_KEYS.meta],
        });
        queryClient.removeQueries({
          queryKey: [LIBRARY_QUERY_KEYS.image],
        });
      }
    },
    [queryClient, setGamesIndex],
  );

  useEffect(() => {
    runMediaIndexReconciliationRef.current = () => {
      if (
        useStatusStore.getState().connectionState !== ConnectionState.CONNECTED
      ) {
        return;
      }

      const requestToken = ++mediaIndexReconcileToken.current;
      const connectionId = currentConnectionId.current;

      void CoreAPI.media()
        .then((response) => {
          if (
            requestToken !== mediaIndexReconcileToken.current ||
            connectionId !== currentConnectionId.current ||
            useStatusStore.getState().connectionState !==
              ConnectionState.CONNECTED
          ) {
            return;
          }
          if (isCancelled(response)) {
            if (useStatusStore.getState().gamesIndex.indexing) {
              scheduleMediaIndexReconciliation();
            }
            return;
          }

          applyGamesIndexState(response.database);
          if (response.database.indexing) {
            scheduleMediaIndexReconciliation();
          }
        })
        .catch((error) => {
          if (
            requestToken !== mediaIndexReconcileToken.current ||
            connectionId !== currentConnectionId.current ||
            useStatusStore.getState().connectionState !==
              ConnectionState.CONNECTED
          ) {
            return;
          }
          logger.error("Failed to reconcile media indexing status", error, {
            category: "api",
            action: "media-index-reconcile",
            severity: "warning",
          });
          if (useStatusStore.getState().gamesIndex.indexing) {
            scheduleMediaIndexReconciliation();
          }
        });
    };
  }, [applyGamesIndexState, scheduleMediaIndexReconciliation]);

  useEffect(
    () => () => {
      cancelMediaStopReconciliation("primary");
      cancelMediaStopReconciliation("background");
      cancelMediaIndexReconciliation();
      invalidateMediaStateRequest();
    },
    [
      cancelMediaIndexReconciliation,
      cancelMediaStopReconciliation,
      invalidateMediaStateRequest,
    ],
  );

  // Process notifications from WebSocket messages
  const processNotification = useCallback(
    (notification: NotificationRequest) => {
      try {
        switch (notification.method) {
          case Notification.MediaStarted: {
            const params = notification.params as PlayingResponse;
            const slot = getMediaSlot(params.slot);
            logger.log("media.started", params);
            if (slot) {
              cancelMediaStopReconciliation(slot);
              if (slot === "primary") {
                clearStagedToken();
              }
              refreshMediaState();
            }
            break;
          }

          case Notification.MediaStopped: {
            const params = notification.params as { slot?: unknown };
            const slot = getMediaSlot(params.slot);
            logger.log("media.stopped", params);
            if (slot) {
              if (slot === "primary") {
                clearStagedToken();
              }
              scheduleMediaStopReconciliation(slot);
            }
            break;
          }

          case Notification.MediaIndexing: {
            const params = notification.params;
            logger.log("mediaIndexing", params);
            if (!isIndexResponse(params)) {
              logger.error(
                "Invalid media indexing notification",
                new Error(
                  "Media indexing notification contains invalid fields",
                ),
                {
                  category: "api",
                  action: "media-index-notification",
                  severity: "warning",
                },
              );
              break;
            }

            applyGamesIndexState(params);
            if (params.indexing) {
              cancelMediaIndexReconciliation();
              scheduleMediaIndexReconciliation();
            } else {
              cancelMediaIndexReconciliation();
            }
            break;
          }

          case Notification.MediaScraping: {
            const params = notification.params as ScrapingStatusNotification;
            logger.log("mediaScraping", params);
            setScrapingStatus(params);
            if (params.done || !params.scraping) {
              queryClient.invalidateQueries({ queryKey: ["media"] });
              queryClient.invalidateQueries({ queryKey: ["tags"] });
              queryClient.invalidateQueries({
                queryKey: ["infiniteMediaSearch"],
              });
              queryClient.invalidateQueries({
                queryKey: [LIBRARY_QUERY_KEYS.favorites],
              });
              queryClient.invalidateQueries({
                queryKey: [LIBRARY_QUERY_KEYS.browse],
              });
              queryClient.invalidateQueries({
                queryKey: [LIBRARY_QUERY_KEYS.browseIndex],
              });
              queryClient.invalidateQueries({
                queryKey: [LIBRARY_QUERY_KEYS.meta],
              });
              queryClient.removeQueries({
                queryKey: [LIBRARY_QUERY_KEYS.image],
              });
              invalidateLibraryImageCache(activeRecordId ?? "");
            }
            break;
          }

          case Notification.TokensScanned: {
            const params = notification.params as TokenResponse;
            logger.log("activeToken", params);
            setLastToken(params);
            setActiveTokens([params]);
            clearStagedToken();
            break;
          }

          case Notification.TokensRemoved: {
            logger.log("tokens.removed");
            clearActiveTokens();
            break;
          }

          case Notification.TokensStaged: {
            const params = notification.params as TokenResponse;
            logger.log("tokens.staged", params);
            setStagedToken({ token: params, ready: false });
            announce(t("tokenStaging.stagedAnnounce"), "assertive");
            break;
          }

          case Notification.TokensStagedReady: {
            const params = notification.params as TokenResponse;
            logger.log("tokens.staged.ready", params);
            setStagedToken({ token: params, ready: true });
            announce(t("tokenStaging.readyAnnounce"), "assertive");
            break;
          }

          case Notification.ReadersConnected:
          case Notification.ReadersDisconnected: {
            logger.log(notification.method, notification.params);
            queryClient.invalidateQueries({ queryKey: ["readers"] });
            if (notification.method === Notification.ReadersDisconnected) {
              clearActiveTokens();
              clearStagedToken();
            }
            break;
          }

          case Notification.PlaytimeLimitWarning: {
            const warningParams =
              notification.params as PlaytimeLimitWarningParams;
            const remainingTime = formatDurationDisplay(
              warningParams.remaining,
            );
            const remainingTimeAccessible = formatDurationAccessible(
              warningParams.remaining,
              t,
            );
            const warningMessage = t("settings.core.playtime.warningToast", {
              remaining: remainingTimeAccessible,
            });
            toast(
              (to) => (
                <button
                  type="button"
                  className="flex grow flex-col text-left focus-visible:ring-2 focus-visible:ring-white/50 focus-visible:outline-none"
                  onClick={() => toast.dismiss(to.id)}
                >
                  <span aria-hidden="true">
                    {t("settings.core.playtime.warningToast", {
                      remaining: remainingTime,
                    })}
                  </span>
                  <span className="sr-only">{warningMessage}</span>
                </button>
              ),
              {
                ariaProps: { role: "alert", "aria-live": "assertive" },
                icon: (
                  <span className="pr-1 pl-1 text-amber-500" aria-hidden="true">
                    <Clock size={20} />
                  </span>
                ),
                duration: 5000,
              },
            );
            break;
          }

          case Notification.InboxAdded: {
            const inboxMessage = notification.params as InboxMessage;
            const coreVersion = useStatusStore.getState().coreVersion;
            if (!isCoreFeatureAvailable("inbox", coreVersion)) {
              break;
            }
            addInboxMessage(inboxMessage);
            if (inboxMessage.severity >= InboxSeverity.Warning) {
              const severityIconNode =
                inboxMessage.severity === InboxSeverity.Error ? (
                  <span className="text-error pr-1 pl-1" aria-hidden="true">
                    <OctagonAlert size={20} />
                  </span>
                ) : (
                  <span className="pr-1 pl-1 text-amber-400" aria-hidden="true">
                    <TriangleAlert size={20} />
                  </span>
                );
              toast(
                (to) => (
                  <button
                    type="button"
                    className="flex grow flex-col text-left focus-visible:ring-2 focus-visible:ring-white/50 focus-visible:outline-none"
                    onClick={() => {
                      toast.dismiss(to.id);
                      setInboxModalOpen(true);
                    }}
                  >
                    {inboxMessage.title}
                  </button>
                ),
                {
                  ariaProps: { role: "alert", "aria-live": "assertive" },
                  icon: severityIconNode,
                  duration: 6000,
                },
              );
            }
            break;
          }

          case Notification.PlaytimeLimitReached: {
            const reachedParams =
              notification.params as PlaytimeLimitReachedParams;
            const limitType =
              reachedParams.reason === "daily"
                ? t("settings.core.playtime.dailyLimit")
                : t("settings.core.playtime.sessionLimit");
            const reachedMessage = t("settings.core.playtime.reachedToast", {
              type: limitType,
            });
            toast(
              (to) => (
                <button
                  type="button"
                  className="flex grow flex-col text-left focus-visible:ring-2 focus-visible:ring-white/50 focus-visible:outline-none"
                  onClick={() => toast.dismiss(to.id)}
                >
                  {reachedMessage}
                </button>
              ),
              {
                ariaProps: { role: "alert", "aria-live": "assertive" },
                icon: (
                  <span className="text-error pr-1 pl-1" aria-hidden="true">
                    <AlertTriangle size={20} />
                  </span>
                ),
                duration: 6000,
              },
            );
            break;
          }

          case Notification.TokensLaunching: {
            logger.debug("running notification ignored", notification.params);
            break;
          }

          case Notification.ClientsPaired: {
            // This client was approved on the device. Clear any encryption
            // block so lifecycle reconnects are no longer suppressed.
            logger.log("client paired notification received");
            connectionManager.clearEncryptionBlockActive();
            break;
          }

          default:
            logger.warn("Unknown notification method:", notification.method);
        }
      } catch (err) {
        logger.error("Error processing notification:", err);
        toast.error(t("error", { msg: "Error processing notification" }));
      }
    },
    [
      refreshMediaState,
      applyGamesIndexState,
      cancelMediaIndexReconciliation,
      cancelMediaStopReconciliation,
      scheduleMediaIndexReconciliation,
      scheduleMediaStopReconciliation,
      setScrapingStatus,
      setLastToken,
      setActiveTokens,
      clearActiveTokens,
      setStagedToken,
      clearStagedToken,
      queryClient,
      t,
      announce,
      addInboxMessage,
      setInboxModalOpen,
      activeRecordId,
    ],
  );

  // Handle connection open - fetch initial data
  const handleConnectionOpen = useCallback(() => {
    const clientRequestToken = ++currentClientRequestToken.current;
    const hasCachedCoreVersion = useStatusStore.getState().coreVersion !== null;
    setConnectionError("");

    // Flush any queued API requests
    CoreAPI.flushQueue();

    // Fetch Core version for feature gating, then persist platform/version on
    // the device record so the device list can render them between connects.
    setCoreVersionPending(!hasCachedCoreVersion);
    CoreAPI.version()
      .then((res) => {
        if (isCancelled(res)) {
          // Don't clear pending — a new connection will manage its own pending state
          logger.log("Version request was cancelled, skipping");
          return;
        }
        if (clientRequestToken !== currentClientRequestToken.current) {
          return;
        }
        setCoreVersion(res.version);
        setCorePlatform(res.platform);
        setCoreVersionPending(false);
        const recordId = deviceRegistry.getSnapshot().activeRecordId;
        if (recordId) {
          void deviceRegistry
            .applyDiscoveredMetadata(recordId, {
              platform: res.platform,
              version: res.version,
            })
            .catch(ignoreReportedRegistryFailure);
        }

        if (versionSatisfies(res.version, CLIENT_CAPABILITIES_SINCE)) {
          CoreAPI.clientsCurrent()
            .then((clientRes) => {
              if (clientRequestToken !== currentClientRequestToken.current) {
                return;
              }
              if (isCancelled(clientRes)) {
                logger.log("Current client request was cancelled, skipping");
                return;
              }
              setCurrentClient(clientRes);
            })
            .catch((err) => {
              if (clientRequestToken !== currentClientRequestToken.current) {
                return;
              }
              if (err instanceof CoreApiError && err.code === -32601) {
                logger.warn(
                  "Current client capabilities are unavailable on this Core build",
                );
                return;
              }
              logger.error(
                "Failed to fetch current client capabilities:",
                err,
                {
                  category: "api",
                  action: "clientsCurrent",
                  severity: "warning",
                },
              );
            });
        } else {
          // Roles did not exist before Core 2.16, so older connections
          // retain their legacy unrestricted settings access.
          setCurrentClient(LEGACY_CLIENT_ACCESS);
        }

        if (isCoreFeatureAvailable("mediaScrapers", res.version)) {
          CoreAPI.mediaScrapeStatus()
            .then((statusRes) => {
              if (isCancelled(statusRes)) {
                logger.log(
                  "Media scrape status request was cancelled, skipping",
                );
                return;
              }
              setScrapingStatus(statusRes);
            })
            .catch((err) => {
              setScrapingStatus(null);
              logger.error("Failed to fetch media scrape status:", err, {
                category: "api",
                action: "mediaScrapeStatus",
                severity: "warning",
              });
            });
        } else {
          setScrapingStatus(null);
        }
        if (isCoreFeatureAvailable("inbox", res.version)) {
          CoreAPI.inbox()
            .then((inboxRes) => {
              if (isCancelled(inboxRes)) {
                logger.log("Inbox request was cancelled, skipping");
                return;
              }
              setInboxMessages(inboxRes.messages);
            })
            .catch((err) => {
              logger.error("Failed to fetch inbox:", err, {
                category: "api",
                action: "inbox",
                severity: "warning",
              });
            });
        } else {
          setInboxMessages([]);
          setInboxModalOpen(false);
        }
      })
      .catch((e) => {
        if (clientRequestToken !== currentClientRequestToken.current) {
          return;
        }
        logger.error("Failed to get Core version:", e, {
          category: "api",
          action: "version",
          severity: "warning",
        });
        if (!hasCachedCoreVersion) {
          setCoreVersion(null);
          setCorePlatform(null);
          setCurrentClient(null);
        }
        setCoreVersionPending(false);
      });

    // Refetch device-scoped library data after every connection. This handles
    // reconnects where Core's library changed while app was disconnected.
    queryClient.invalidateQueries({ queryKey: ["media"] });
    queryClient.invalidateQueries({ queryKey: ["systems"] });
    queryClient.invalidateQueries({ queryKey: ["tags"] });
    queryClient.invalidateQueries({ queryKey: ["infiniteMediaSearch"] });
    queryClient.invalidateQueries({
      queryKey: [LIBRARY_QUERY_KEYS.favorites],
    });
    queryClient.invalidateQueries({
      queryKey: [LIBRARY_QUERY_KEYS.browse],
    });
    queryClient.invalidateQueries({
      queryKey: [LIBRARY_QUERY_KEYS.browseIndex],
    });
    queryClient.invalidateQueries({
      queryKey: [LIBRARY_QUERY_KEYS.meta],
    });
    void queryClient.invalidateQueries({
      queryKey: [LIBRARY_QUERY_KEYS.image],
      refetchType: "active",
    });

    const fetchMediaState = (retryDelayMs: number) => {
      const scheduledFor = currentConnectionId.current;
      const requestToken = ++mediaStateRequestToken.current;
      CoreAPI.media()
        .then((v) => {
          if (requestToken !== mediaStateRequestToken.current) {
            return;
          }
          if (isCancelled(v)) {
            logger.log("Media request was cancelled, retrying once");
            // The first call after a reconnect can race with the transport
            // re-coming up; one delayed retry is enough to catch up.
            if (retryDelayMs > 0) {
              if (mediaRetryTimer.current) {
                clearTimeout(mediaRetryTimer.current);
              }
              mediaRetryTimer.current = setTimeout(() => {
                mediaRetryTimer.current = null;
                // Bail if the connection has changed under us — otherwise
                // we'd write a stale connection's state into a newer one.
                if (currentConnectionId.current !== scheduledFor) {
                  return;
                }
                fetchMediaState(0);
              }, retryDelayMs);
            }
            return;
          }
          try {
            setGamesIndex(v.database);
            if (v.database.indexing) {
              scheduleMediaIndexReconciliation();
            } else {
              cancelMediaIndexReconciliation();
            }
            applyMediaState(v);
          } catch (e) {
            logger.error("Error processing media data:", e);
            toast.error(t("error", { msg: "Failed to process media data" }));
          }
        })
        .catch((e) => {
          if (requestToken !== mediaStateRequestToken.current) {
            return;
          }
          if (isExpectedMediaDatabaseError(e)) {
            cancelMediaIndexReconciliation();
            setGamesIndex(DEFAULT_GAMES_INDEX);
            return;
          }

          logger.error("Failed to get media information:", e);
          // Suppress the toast unless we're actually live-connected — the
          // connection-state UI already conveys reconnect/disconnect, and
          // WS transport flapping makes these rejections common. (Note: the
          // store's `connected` flag stays true during RECONNECTING, so we
          // intentionally check `connectionState` here, not `connected`.)
          if (
            useStatusStore.getState().connectionState ===
            ConnectionState.CONNECTED
          ) {
            showRateLimitedErrorToast(
              t("error", { msg: "Failed to fetch media" }),
            );
          }
        });
    };

    fetchMediaState(500);

    // Fetch tokens information
    CoreAPI.tokens()
      .then((v) => {
        if (clientRequestToken !== currentClientRequestToken.current) {
          return;
        }
        // Skip processing if request was cancelled (stale, aborted, or connection reset)
        if (isCancelled(v)) {
          logger.log("Tokens request was cancelled, skipping");
          return;
        }
        try {
          setActiveTokens(v.active ?? []);
          if (v.last) {
            setLastToken(v.last);
          }
        } catch (e) {
          logger.error("Error processing tokens data:", e);
          toast.error(t("error", { msg: "Failed to process tokens data" }));
        }
      })
      .catch((e) => {
        // A request from the previous socket can reject after reconnection has
        // already restored CONNECTED. Ignore that stale failure rather than
        // showing an error for the healthy replacement connection.
        if (clientRequestToken !== currentClientRequestToken.current) {
          return;
        }
        logger.error("Failed to get tokens information:", e);
        if (
          useStatusStore.getState().connectionState ===
          ConnectionState.CONNECTED
        ) {
          showRateLimitedErrorToast(
            t("error", { msg: "Failed to fetch tokens" }),
          );
        }
      });
  }, [
    cancelMediaIndexReconciliation,
    scheduleMediaIndexReconciliation,
    setConnectionError,
    setGamesIndex,
    applyMediaState,
    setLastToken,
    setActiveTokens,
    setCoreVersion,
    setCorePlatform,
    setCoreVersionPending,
    setCurrentClient,
    setScrapingStatus,
    setInboxMessages,
    setInboxModalOpen,
    queryClient,
    t,
  ]);

  // Keep callback refs updated (allows stable references in connection effect)
  useEffect(() => {
    handleConnectionOpenRef.current = handleConnectionOpen;
    processNotificationRef.current = processNotification;
  }, [handleConnectionOpen, processNotification]);

  // Load stored devices. Everything below reads the registry, so this is the
  // one place that has to wait for storage; the connection effect simply sees
  // an empty wsUrl until it lands.
  useEffect(() => {
    void deviceRegistry.hydrate();
  }, []);

  // Setup connection when the active device changes
  useEffect(() => {
    // Reset local connection state when device changes so UI doesn't show stale data
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Intentional: reset state for the newly selected external device.
    setLocalConnection(null);
    if (connectionWsUrl === "") {
      clearConnectionIssue();
    } else {
      beginConnectionIssue();
    }
    invalidateCurrentClientRequest();
    const deviceChanged = previousConnectionRecordId.current !== activeRecordId;
    previousConnectionRecordId.current = activeRecordId;
    if (deviceChanged) setCurrentClient(null);
    setEncryptionState("unknown");
    setPairingRequired(false);
    setPairingOpen(false);

    if (
      connectionWsUrl === "" ||
      activeRecordId === null ||
      forgettingRecordIdsRef.current.has(activeRecordId)
    ) {
      clearConnectionIssue();
      setConnectionState(ConnectionState.DISCONNECTED);
      return;
    }

    const recordId = activeRecordId;
    // The transport keys devices by this id, and a record id is stable across
    // address changes — the point of the registry. Addresses are never used.
    const deviceId = recordId;

    // Which key answered `getCredentials` for this connection. Non-null only
    // while a pre-V2 pairing has not yet been moved to the canonical key, and
    // trustworthy only after the peer authenticates with it.
    let legacyKeyUsed: string | null = null;
    let credentialsUsed: StoredCredentials | null = null;
    let aliasReconciliationInFlight = false;

    // Generate unique ID for this connection session to prevent stale events
    // Use crypto.randomUUID if available, fallback for older Android WebViews
    const connectionId =
      typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `${Date.now()}-${connectionRevision}-${Math.random().toString(36).slice(2)}`;
    currentConnectionId.current = connectionId;
    const isCurrentConnection = () =>
      currentConnectionId.current === connectionId &&
      !forgettingRecordIdsRef.current.has(recordId);

    // Reset CoreAPI to clear any zombie requests from previous connections
    CoreAPI.reset();

    logger.log(
      `[ConnectionProvider] Setting up connection to: ${connectionWsUrl} (id: ${connectionId.slice(0, 8)})`,
    );

    // Setup connection manager event handlers
    // Use refs for callbacks to avoid re-running this effect when callbacks change
    connectionManager.setEventHandlers({
      onConnectionChange: (deviceId, connection) => {
        if (deviceId === connectionManager.getActiveDeviceId()) {
          setConnectionState(mapTransportState(connection.state));
          if (
            connection.state !== "connected" &&
            !useStatusStore.getState().pairingRequired
          ) {
            beginConnectionIssue();
          }

          // Update local connection state for context consumers
          // Note: useState always triggers re-render when called with a new object reference
          setLocalConnection(connection);

          if (connection.state !== "connected") {
            invalidateCurrentClientRequest();
            CoreAPI.handleDisconnect();
            void queryClient.cancelQueries({
              queryKey: [LIBRARY_QUERY_KEYS.image],
            });
            const imageRequests = clearQueuedLibraryImages();
            if (
              imageRequests.activeRequests > 0 ||
              imageRequests.queuedRequests > 0
            ) {
              logger.error(
                "Library image requests cancelled after connection reset",
                undefined,
                {
                  category: "queue",
                  action: "library-images-disconnect",
                  severity: "info",
                  ...imageRequests,
                },
              );
            }
          }

          // Each new connect attempt starts unverified — clear stale signals
          // from a prior attempt so the UI gate in ConnectionStatusDisplay shows
          // "connecting" until the server confirms the encryption mode. Reset
          // only on "connecting" (the start of a fresh socket attempt). The
          // transient "reconnecting" state that fires between disconnect and
          // the next connect must NOT reset, because onEncryptionRequired sets
          // pairingRequired=true just before the close — wiping it during
          // "reconnecting" prevents the pair UI from ever rendering.
          if (connection.state === "connecting") {
            setEncryptionState("unknown");
            setPairingRequired(false);
          }

          // Handle connection open - always re-fetch data to prevent stale state
          if (connection.state === "connected") {
            // Guard against stale connection events from old connections
            if (connectionId !== currentConnectionId.current) {
              logger.warn(
                `[ConnectionProvider] Ignoring stale connection event (expected: ${currentConnectionId.current?.slice(0, 8)}, got: ${connectionId.slice(0, 8)})`,
              );
              return;
            }

            if (!isInitialized.current) {
              isInitialized.current = true;
            }
            handleConnectionOpenRef.current();
          }
        }
      },
      onMessage: (_deviceId, event) => {
        // Process message through CoreAPI
        CoreAPI.processReceived(event)
          .then((notification: NotificationRequest | null) => {
            if (notification !== null) {
              processNotificationRef.current(notification);
            }
          })
          .catch((e) => {
            logger.error("Error processing message:", e);
            showRateLimitedErrorToast(
              tRef.current("error", { msg: e?.message || "Unknown error" }),
            );
          });
      },
      onError: (deviceId, error) => {
        logger.log(
          `[ConnectionProvider] Connection error for ${deviceId}:`,
          error.message,
        );
        if (deviceId === connectionManager.getActiveDeviceId()) {
          logger.log(
            `[ConnectionProvider] Setting connection error: ${error.message}`,
          );
          setConnectionError(
            error.message || tRef.current("settings.connectionFailed"),
          );
        }
      },
      onEncryptedHandshakeOk: () => {
        if (!isCurrentConnection()) return;
        clearConnectionIssue();
        setEncryptionState("encrypted");
        setPairingRequired(false);
        // The peer authenticated with whatever key answered getCredentials, so
        // this is the one moment the app can be sure the record and the
        // credential belong to the same physical device. Move a pre-V2 pairing
        // to the canonical key now, and only drop the pointer to the old key
        // once that has actually landed.
        const provenKey = legacyKeyUsed;
        const workToken = Symbol("credentialWork");
        const work = (
          provenKey === null
            ? Promise.resolve(true)
            : credentialStore.promoteRecordCredentials(recordId, provenKey)
        )
          .then(async (migrationSettled) => {
            if (!isCurrentConnection()) return;
            await deviceRegistry.markConnected(recordId, {
              ...(provenKey === null ? {} : { provenLegacyKey: provenKey }),
              migrationSettled,
            });
            if (
              !isCurrentConnection() ||
              !credentialsUsed ||
              aliasReconciliationInFlight
            ) {
              return;
            }
            aliasReconciliationInFlight = true;
            try {
              const mergedRecordIds = await reconcileCredentialProvenAliases(
                recordId,
                credentialsUsed,
              );
              for (const mergedRecordId of mergedRecordIds) {
                invalidateLibraryImageCache(mergedRecordId);
                queryClient.removeQueries({
                  predicate: (query) => query.queryKey.includes(mergedRecordId),
                });
              }
            } finally {
              aliasReconciliationInFlight = false;
            }
          })
          .catch(ignoreReportedRegistryFailure)
          .finally(() => {
            credentialWorkRef.current.delete(workToken);
          });
        credentialWorkRef.current.set(workToken, { recordId, promise: work });
        void work;
      },
      onPlaintextMode: () => {
        if (!isCurrentConnection()) return;
        clearConnectionIssue();
        setEncryptionState("plaintext");
        setPairingRequired(false);
        // Nothing was proven, so the legacy key pointer stays put.
        void deviceRegistry
          .markConnected(recordId)
          .catch(ignoreReportedRegistryFailure);
      },
      onEncryptionRequired: () => {
        // Server demands encryption but we have no credentials — open the
        // pairing modal so the user can pair. Connection stays failed until
        // pairing succeeds and triggers an immediate reconnect.
        clearConnectionIssue();
        setEncryptionState("plaintext");
        setPairingRequired(true);
        setConnectionError(
          tRef.current("pairing.connectionError.encryptionRequired"),
        );
        setPairingOpen(true);
      },
      onUnsupportedVersion: () => {
        clearConnectionIssue();
        setEncryptionState("plaintext");
        setConnectionError(
          tRef.current("pairing.connectionError.unsupportedVersion"),
        );
      },
      onCredentialsRevoked: () => {
        if (!isCurrentConnection()) return;
        clearConnectionIssue();
        // Server rejected our stored credentials — clear them and prompt
        // the user to pair again.
        // Delete exactly the key the server rejected — which may still be the
        // pre-V2 one on a migrated device that has not connected since.
        const revokedKey = legacyKeyUsed ?? credentialKeyForRecord(recordId);
        credentialStore.delete(revokedKey).catch((err) => {
          logger.error("Failed to delete revoked credentials", err, {
            category: "storage",
            action: "deleteCredentials",
          });
        });
        setEncryptionState("plaintext");
        setPairingRequired(true);
        setConnectionError(
          tRef.current("pairing.connectionError.credentialsRevoked"),
        );
        setPairingOpen(true);
      },
    });

    // Add device and set as active
    const transport = connectionManager.addDevice({
      deviceId,
      type: "websocket",
      address: connectionWsUrl,
      fallbackAddresses: connectionWsUrls.slice(1),
      encryption: {
        getCredentials: async () => {
          const record = deviceRegistry.getSnapshot().records[recordId];
          const lookup = await credentialStore.getForRecord(
            recordId,
            record?.legacyCredentialKey,
          );
          legacyKeyUsed = lookup.legacyKeyUsed;
          credentialsUsed = lookup.credentials;
          return lookup.credentials;
        },
      },
    });

    connectionManager.setActiveDevice(deviceId);

    // Create a compatibility wrapper for CoreAPI
    const transportWrapper = {
      send: (msg: string) => transport.send(msg),
      get isConnected() {
        return transport.isConnected;
      },
      get currentState() {
        return transport.state;
      },
    };

    // Set the wrapper on CoreAPI
    CoreAPI.setWsInstance(transportWrapper as never);

    // Set initial state. Presentation timing starts at effect setup because the
    // transport's first event can precede ConnectionManager activation.
    setConnectionState(ConnectionState.CONNECTING);

    return () => {
      logger.log(
        `[ConnectionProvider] Cleanup: removing device (id: ${connectionId.slice(0, 8)})`,
      );
      isInitialized.current = false;
      // Clear connection ID if it's still ours (prevents race with new connection)
      if (currentConnectionId.current === connectionId) {
        currentConnectionId.current = null;
      }
      // Drop any pending media retry so it can't fire against the next connection.
      if (mediaRetryTimer.current) {
        clearTimeout(mediaRetryTimer.current);
        mediaRetryTimer.current = null;
      }
      cancelMediaStopReconciliation("primary");
      cancelMediaStopReconciliation("background");
      cancelMediaIndexReconciliation();
      invalidateMediaStateRequest();
      // Reset CoreAPI to clear any pending requests for this connection
      CoreAPI.reset();
      connectionManager.removeDevice(deviceId);
      invalidateCurrentClientRequest();
      clearConnectionIssue();
      setConnectionState(ConnectionState.DISCONNECTED);
    };
  }, [
    activeRecordId,
    beginConnectionIssue,
    clearConnectionIssue,
    connectionRevision,
    connectionWsUrl,
    connectionWsUrls,
    invalidateCurrentClientRequest,
    invalidateMediaStateRequest,
    cancelMediaIndexReconciliation,
    cancelMediaStopReconciliation,
    setConnectionState,
    setConnectionError,
    setCurrentClient,
    setEncryptionState,
    setPairingRequired,
    mapTransportState,
    queryClient,
    // Note: handleConnectionOpen, processNotification, and t are accessed via refs
    // to prevent this effect from re-running when those callbacks change
  ]);

  // App lifecycle listeners (Capacitor)
  useEffect(() => {
    let disposed = false;
    let resumeListener: Awaited<ReturnType<typeof App.addListener>> | null =
      null;
    let pauseListener: Awaited<ReturnType<typeof App.addListener>> | null =
      null;

    const setupListeners = async () => {
      if (!isNativePluginAvailable("App")) return;

      const resumeHandle = await App.addListener("resume", () => {
        if (disposed) return;
        logger.log("[ConnectionProvider] App resumed");
        connectionManager.resumeAll();
      });
      if (disposed) {
        void removeNativeListener(resumeHandle, "resume");
        return;
      }
      resumeListener = resumeHandle;

      const pauseHandle = await App.addListener("pause", () => {
        if (disposed) return;
        logger.log("[ConnectionProvider] App paused");
        connectionManager.pauseAll();
      });
      if (disposed) {
        void removeNativeListener(pauseHandle, "pause");
        return;
      }
      pauseListener = pauseHandle;
    };

    setupListeners().catch((e) => {
      logger.warn("[ConnectionProvider] Failed to setup app listeners:", e);
    });

    return () => {
      disposed = true;
      if (resumeListener) {
        void removeNativeListener(resumeListener, "resume");
      }
      if (pauseListener) {
        void removeNativeListener(pauseListener, "pause");
      }
    };
  }, []);

  // Browser visibility and network changes (web platform only)
  useEffect(() => {
    if (Capacitor.isNativePlatform()) return;

    const initialNetworkAvailable = navigator.onLine;
    const status = useStatusStore.getState();
    status.setNetworkAvailable(initialNetworkAvailable);
    if (
      !initialNetworkAvailable &&
      deviceRegistry.getSnapshot().activeRecordId
    ) {
      status.beginConnectionIssue();
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        logger.log("[ConnectionProvider] Tab visible");
        connectionManager.resumeAll();
      } else {
        logger.log("[ConnectionProvider] Tab hidden");
        connectionManager.pauseAll();
      }
    };
    const handleOnline = () => {
      updateNetworkAvailability(true);
      connectionManager.immediateReconnectActive();
    };
    const handleOffline = () => updateNetworkAvailability(false);

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [updateNetworkAvailability]);

  // Network change detection (native platforms only)
  // Triggers immediate reconnect when network is restored (e.g., WiFi reconnects)
  useEffect(() => {
    if (!Capacitor.isNativePlatform() || !isNativePluginAvailable("Network")) {
      return;
    }

    let disposed = false;
    let networkListener: PluginListenerHandle | null = null;

    const setup = async () => {
      try {
        const initialStatus = await Network.getStatus();
        if (disposed) return;
        updateNetworkAvailability(initialStatus.connected);
      } catch (error) {
        logger.warn(
          "[ConnectionProvider] Failed to read initial network status:",
          error,
        );
      }
      if (disposed) return;

      const handle = await Network.addListener(
        "networkStatusChange",
        (status) => {
          if (disposed) return;
          logger.log(
            `[ConnectionProvider] Network status changed: ${status.connected ? "connected" : "disconnected"} (${status.connectionType})`,
          );
          updateNetworkAvailability(status.connected);
          if (status.connected) {
            connectionManager.immediateReconnectActive();
          }
        },
      );
      if (disposed) {
        void removeNativeListener(handle, "network status");
        return;
      }
      networkListener = handle;
    };

    setup().catch((e) => {
      logger.warn("[ConnectionProvider] Failed to setup network listener:", e);
    });

    return () => {
      disposed = true;
      if (networkListener) {
        void removeNativeListener(networkListener, "network status");
      }
    };
  }, [updateNetworkAvailability]);

  const openPairingModal = useCallback(() => {
    setPairingOpen(true);
  }, []);

  const forgetDevice = useCallback(
    async (recordId: string): Promise<void> => {
      forgettingRecordIdsRef.current.add(recordId);
      const isActive = deviceRegistry.getSnapshot().activeRecordId === recordId;

      if (isActive) {
        // ConnectionProvider owns transport lifetime. Invalidate callbacks before
        // destroying the transport, then wait for credential work that already
        // started so the final delete cannot be followed by a stale promotion.
        currentConnectionId.current = null;
        setPairingOpen(false);
        setLocalConnection(null);
        resetConnectionState();
        CoreAPI.reset();
        connectionManager.removeDevice(recordId);
      }

      const credentialWork = [...credentialWorkRef.current.values()]
        .filter((work) => work.recordId === recordId)
        .map((work) => work.promise);
      await Promise.all(credentialWork);

      try {
        await deviceRegistry.removeRecord(recordId);
      } catch (error) {
        // Secure-storage failure leaves the record unchanged. If it became or
        // remained active while fenced, recreate and rebind its transport.
        if (deviceRegistry.getSnapshot().activeRecordId === recordId) {
          setConnectionRevision((revision) => revision + 1);
        }
        throw error;
      } finally {
        forgettingRecordIdsRef.current.delete(recordId);
      }
    },
    [resetConnectionState],
  );

  // Memoize context value to prevent unnecessary re-renders of consumers
  const contextValue = useMemo<ConnectionContextValue>(
    () => ({
      activeConnection: localConnection,
      isConnected,
      hasData,
      showConnecting,
      showReconnecting,
      openPairingModal,
    }),
    [
      localConnection,
      isConnected,
      hasData,
      showConnecting,
      showReconnecting,
      openPairingModal,
    ],
  );
  const connectionActions = useMemo<DeviceConnectionActionsContextValue>(
    () => ({ forgetDevice }),
    [forgetDevice],
  );

  const pairingAddress =
    connectionManager.getActiveConnection()?.address ?? connectionAddress;

  return (
    <ConnectionContext.Provider value={contextValue}>
      <DeviceConnectionActionsContext.Provider value={connectionActions}>
        {children}
        <PairingModal
          isOpen={pairingOpen}
          close={() => setPairingOpen(false)}
          address={pairingAddress}
          recordId={activeRecordId ?? ""}
          onSuccess={() => connectionManager.restartActiveConnection()}
        />
      </DeviceConnectionActionsContext.Provider>
    </ConnectionContext.Provider>
  );
}
