/**
 * ConnectionProvider - Manages device connections and integrates with the app.
 *
 * This replaces CoreApiWebSocket.tsx with a cleaner, more robust implementation
 * using the new transport abstraction layer.
 */

import { useEffect, useRef, useCallback, type ReactNode } from "react";
import { useShallow } from "zustand/react/shallow";
import { Capacitor } from "@capacitor/core";
import { Preferences } from "@capacitor/preferences";
import { App } from "@capacitor/app";
import toast from "react-hot-toast";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { Clock, AlertTriangle } from "lucide-react";
import { connectionManager, type TransportState } from "../lib/transport";
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

  // Derive context value
  const activeConnection = connectionManager.getActiveConnection();
  const isConnected = activeConnection?.state === "connected";
  const hasData = activeConnection?.hasData ?? false;
  const hasConnectedBefore = activeConnection?.hasConnectedBefore ?? false;

  // Show "Connecting..." for new devices that haven't connected yet
  const showConnecting =
    !isConnected &&
    !hasConnectedBefore &&
    (activeConnection?.state === "connecting" ||
      activeConnection?.state === "reconnecting");

  // Show "Reconnecting..." for devices that had prior successful connection
  const showReconnecting = !isConnected && (hasData || hasConnectedBefore);

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
                  <span className="text-warning pr-1 pl-1">
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
        toast.error(t("error", { msg: "Failed to fetch media" }));
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
        toast.error(t("error", { msg: "Failed to fetch tokens" }));
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
    if (targetDeviceAddress === "") {
      setConnectionState(ConnectionState.ERROR);
      setConnectionError("No device address configured");
      return;
    }

    const wsUrl = getWsUrl();
    if (!wsUrl) {
      setConnectionState(ConnectionState.ERROR);
      setConnectionError("Invalid WebSocket URL");
      return;
    }

    logger.log(
      `[ConnectionProvider] Setting up connection to: ${targetDeviceAddress}`,
    );

    // Setup connection manager event handlers
    connectionManager.setEventHandlers({
      onConnectionChange: (deviceId, connection) => {
        if (deviceId === connectionManager.getActiveDeviceId()) {
          setConnectionState(mapTransportState(connection.state));

          // Handle connection open - always re-fetch data to prevent stale state
          if (connection.state === "connected") {
            if (!isInitialized.current) {
              isInitialized.current = true;
            }
            handleConnectionOpen();
          }
        }
      },
      onMessage: (_deviceId, event) => {
        // Process message through CoreAPI
        CoreAPI.processReceived(event)
          .then((notification: NotificationRequest | null) => {
            if (notification !== null) {
              processNotification(notification);
            }
          })
          .catch((e) => {
            logger.error("Error processing message:", e);
            toast.error(t("error", { msg: e?.message || "Unknown error" }));
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
      logger.log("[ConnectionProvider] Cleanup: removing device");
      isInitialized.current = false;
      connectionManager.removeDevice(targetDeviceAddress);
      setConnectionState(ConnectionState.DISCONNECTED);
    };
  }, [
    targetDeviceAddress,
    setConnectionState,
    setConnectionError,
    mapTransportState,
    handleConnectionOpen,
    processNotification,
    t,
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

  const contextValue: ConnectionContextValue = {
    activeConnection,
    isConnected,
    hasData,
    showConnecting,
    showReconnecting,
  };

  return (
    <ConnectionContext.Provider value={contextValue}>
      {children}
    </ConnectionContext.Provider>
  );
}
