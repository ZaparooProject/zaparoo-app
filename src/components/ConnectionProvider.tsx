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
import { Capacitor } from "@capacitor/core";
import { Preferences } from "@capacitor/preferences";
import { App } from "@capacitor/app";
import toast from "react-hot-toast";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { Clock, AlertTriangle } from "lucide-react";
import { showRateLimitedErrorToast } from "../lib/toastUtils";
import {
  connectionManager,
  type TransportState,
  type DeviceConnection,
} from "../lib/transport";
import { logger } from "../lib/logger";
import {
  IndexResponse,
  Notification,
  PlayingResponse,
  PlaytimeLimitReachedParams,
  PlaytimeLimitWarningParams,
  TokenResponse,
} from "../lib/models";
import {
  CoreAPI,
  getDeviceAddress,
  getWsUrl,
  type NotificationRequest,
} from "../lib/coreApi";
import { useStatusStore, ConnectionState } from "../lib/store";
import { formatDurationDisplay, formatDurationAccessible } from "../lib/utils";
import {
  ConnectionContext,
  type ConnectionContextValue,
} from "../hooks/useConnection";
import { useAnnouncer } from "./A11yAnnouncer";

interface ConnectionProviderProps {
  children: ReactNode;
}

export function ConnectionProvider({ children }: ConnectionProviderProps) {
  const { t } = useTranslation();
  const { announce } = useAnnouncer();
  const queryClient = useQueryClient();
  const isInitialized = useRef(false);
  // Track current connection to prevent stale events from old connections
  const currentConnectionId = useRef<string | null>(null);

  // Refs for stable callback references - prevents effect re-run on callback changes
  const handleConnectionOpenRef = useRef<() => void>(() => {});
  const processNotificationRef = useRef<
    (notification: NotificationRequest) => void
  >(() => {});
  const tRef = useRef(t);

  // Store state
  const {
    targetDeviceAddress,
    setTargetDeviceAddress,
    setConnectionState,
    setConnectionError,
    setPlaying,
    setGamesIndex,
    setLastToken,
    addDeviceHistory,
    setDeviceHistory,
  } = useStatusStore(
    useShallow((state) => ({
      targetDeviceAddress: state.targetDeviceAddress,
      setTargetDeviceAddress: state.setTargetDeviceAddress,
      setConnectionState: state.setConnectionState,
      setConnectionError: state.setConnectionError,
      setPlaying: state.setPlaying,
      setGamesIndex: state.setGamesIndex,
      setLastToken: state.setLastToken,
      addDeviceHistory: state.addDeviceHistory,
      setDeviceHistory: state.setDeviceHistory,
    })),
  );

  // Connection state tracked via useState to prevent unnecessary re-renders
  // These are updated via onConnectionChange callback
  const [localConnection, setLocalConnection] =
    useState<DeviceConnection | null>(null);

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
      ? targetDeviceAddress !== ""
      : localConnection.state === "connecting" ||
        localConnection.state === "reconnecting");

  // Show "Reconnecting..." for devices that had prior successful connection
  const showReconnecting = !isConnected && (hasData || hasConnectedBefore);

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

  // Process notifications from WebSocket messages
  const processNotification = useCallback(
    (notification: NotificationRequest) => {
      try {
        switch (notification.method) {
          case Notification.MediaStarted: {
            const params = notification.params as PlayingResponse;
            logger.log("media.started", params);
            setPlaying(params);
            break;
          }

          case Notification.MediaStopped: {
            logger.log("media.stopped");
            setPlaying({
              systemId: "",
              systemName: "",
              mediaPath: "",
              mediaName: "",
            });
            break;
          }

          case Notification.MediaIndexing: {
            const params = notification.params as IndexResponse;
            logger.log("mediaIndexing", params);

            const currentState = useStatusStore.getState().gamesIndex;
            setGamesIndex(params);

            // Invalidate media query on significant state changes
            if (
              currentState.indexing !== params.indexing ||
              currentState.optimizing !== params.optimizing ||
              currentState.exists !== params.exists ||
              currentState.totalMedia !== params.totalMedia
            ) {
              logger.log("Database state changed, invalidating media query");
              queryClient.invalidateQueries({ queryKey: ["media"] });
            }
            break;
          }

          case Notification.TokensScanned: {
            const params = notification.params as TokenResponse;
            logger.log("activeToken", params);
            setLastToken(params);
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
            announce(warningMessage, "assertive");
            toast(
              (to) => (
                <span
                  className="flex grow flex-col"
                  onClick={() => toast.dismiss(to.id)}
                  onKeyUp={(e) =>
                    (e.key === "Enter" || e.key === " ") && toast.dismiss(to.id)
                  }
                  role="button"
                  tabIndex={0}
                  aria-hidden="true"
                >
                  {t("settings.core.playtime.warningToast", {
                    remaining: remainingTime,
                  })}
                </span>
              ),
              {
                icon: (
                  <span className="pr-1 pl-1 text-amber-500">
                    <Clock size={20} />
                  </span>
                ),
                duration: 5000,
              },
            );
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
            announce(reachedMessage, "assertive");
            toast(
              (to) => (
                <span
                  className="flex grow flex-col"
                  onClick={() => toast.dismiss(to.id)}
                  onKeyUp={(e) =>
                    (e.key === "Enter" || e.key === " ") && toast.dismiss(to.id)
                  }
                  role="button"
                  tabIndex={0}
                  aria-hidden="true"
                >
                  {reachedMessage}
                </span>
              ),
              {
                icon: (
                  <span className="text-error pr-1 pl-1">
                    <AlertTriangle size={20} />
                  </span>
                ),
                duration: 6000,
              },
            );
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
    [setPlaying, setGamesIndex, setLastToken, queryClient, t, announce],
  );

  // Handle connection open - fetch initial data
  const handleConnectionOpen = useCallback(() => {
    setConnectionError("");

    // Flush any queued API requests
    CoreAPI.flushQueue();

    // Load device history
    Preferences.get({ key: "deviceHistory" })
      .then((v) => {
        try {
          if (v.value) {
            setDeviceHistory(JSON.parse(v.value));
          }
          addDeviceHistory(getDeviceAddress());
        } catch (e) {
          logger.error("Error processing device history:", e);
          toast.error(t("error", { msg: "Failed to load device history" }));
        }
      })
      .catch((e) => {
        logger.error("Failed to get device history:", e);
      });

    // Fetch media information
    CoreAPI.media()
      .then((v) => {
        try {
          setGamesIndex(v.database);
          const firstActive = v.active[0];
          if (firstActive) {
            setPlaying(firstActive);
          }
        } catch (e) {
          logger.error("Error processing media data:", e);
          toast.error(t("error", { msg: "Failed to process media data" }));
        }
      })
      .catch((e) => {
        logger.error("Failed to get media information:", e);
        // Use rate-limited toast to prevent spam on connection issues
        showRateLimitedErrorToast(t("error", { msg: "Failed to fetch media" }));
      });

    // Fetch tokens information
    CoreAPI.tokens()
      .then((v) => {
        try {
          if (v.last) {
            setLastToken(v.last);
          }
        } catch (e) {
          logger.error("Error processing tokens data:", e);
          toast.error(t("error", { msg: "Failed to process tokens data" }));
        }
      })
      .catch((e) => {
        logger.error("Failed to get tokens information:", e);
        // Use rate-limited toast to prevent spam on connection issues
        showRateLimitedErrorToast(
          t("error", { msg: "Failed to fetch tokens" }),
        );
      });
  }, [
    setConnectionError,
    setDeviceHistory,
    addDeviceHistory,
    setGamesIndex,
    setPlaying,
    setLastToken,
    t,
  ]);

  // Keep callback refs updated (allows stable references in connection effect)
  useEffect(() => {
    handleConnectionOpenRef.current = handleConnectionOpen;
    processNotificationRef.current = processNotification;
  }, [handleConnectionOpen, processNotification]);

  // Initialize device address from localStorage
  useEffect(() => {
    if (targetDeviceAddress !== "") return;

    let attempts = 0;
    const maxAttempts = 5;
    const checkInterval = 100;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const checkAddress = () => {
      attempts++;
      const addr = getDeviceAddress();

      if (addr !== "") {
        setTargetDeviceAddress(addr);
        return;
      }

      if (attempts < maxAttempts) {
        timer = setTimeout(checkAddress, checkInterval);
      }
    };

    checkAddress();

    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [targetDeviceAddress, setTargetDeviceAddress]);

  // Setup connection when device address changes
  useEffect(() => {
    // Reset local connection state when device changes so UI doesn't show stale data
    setLocalConnection(null);

    if (targetDeviceAddress === "") {
      setConnectionState(ConnectionState.DISCONNECTED);
      return;
    }

    const wsUrl = getWsUrl();
    if (!wsUrl) {
      setConnectionState(ConnectionState.ERROR);
      setConnectionError("Invalid WebSocket URL");
      return;
    }

    // Generate unique ID for this connection session to prevent stale events
    const connectionId = crypto.randomUUID();
    currentConnectionId.current = connectionId;

    // Reset CoreAPI to clear any zombie requests from previous connections
    CoreAPI.reset();

    logger.log(
      `[ConnectionProvider] Setting up connection to: ${targetDeviceAddress} (id: ${connectionId.slice(0, 8)})`,
    );

    // Setup connection manager event handlers
    // Use refs for callbacks to avoid re-running this effect when callbacks change
    connectionManager.setEventHandlers({
      onConnectionChange: (deviceId, connection) => {
        if (deviceId === connectionManager.getActiveDeviceId()) {
          setConnectionState(mapTransportState(connection.state));

          // Update local connection state for context consumers
          // Note: useState always triggers re-render when called with a new object reference
          setLocalConnection(connection);

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
    });

    // Add device and set as active
    const transport = connectionManager.addDevice({
      deviceId: targetDeviceAddress,
      type: "websocket",
      address: wsUrl,
    });

    connectionManager.setActiveDevice(targetDeviceAddress);

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

    // Set initial state
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
      // Reset CoreAPI to clear any pending requests for this connection
      CoreAPI.reset();
      connectionManager.removeDevice(targetDeviceAddress);
      setConnectionState(ConnectionState.DISCONNECTED);
    };
  }, [
    targetDeviceAddress,
    setConnectionState,
    setConnectionError,
    mapTransportState,
    // Note: handleConnectionOpen, processNotification, and t are accessed via refs
    // to prevent this effect from re-running when those callbacks change
  ]);

  // App lifecycle listeners (Capacitor)
  useEffect(() => {
    let resumeListener: Awaited<ReturnType<typeof App.addListener>> | null =
      null;
    let pauseListener: Awaited<ReturnType<typeof App.addListener>> | null =
      null;

    const setupListeners = async () => {
      resumeListener = await App.addListener("resume", () => {
        logger.log("[ConnectionProvider] App resumed");
        connectionManager.resumeAll();
      });

      pauseListener = await App.addListener("pause", () => {
        logger.log("[ConnectionProvider] App paused");
        connectionManager.pauseAll();
      });
    };

    setupListeners();

    return () => {
      resumeListener?.remove();
      pauseListener?.remove();
    };
  }, []);

  // Browser visibility change (web platform only)
  useEffect(() => {
    if (Capacitor.isNativePlatform()) return;

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        logger.log("[ConnectionProvider] Tab visible");
        connectionManager.resumeAll();
      } else {
        logger.log("[ConnectionProvider] Tab hidden");
        connectionManager.pauseAll();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () =>
      document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, []);

  // Memoize context value to prevent unnecessary re-renders of consumers
  const contextValue = useMemo<ConnectionContextValue>(
    () => ({
      activeConnection: localConnection,
      isConnected,
      hasData,
      showConnecting,
      showReconnecting,
    }),
    [localConnection, isConnected, hasData, showConnecting, showReconnecting],
  );

  return (
    <ConnectionContext.Provider value={contextValue}>
      {children}
    </ConnectionContext.Provider>
  );
}
