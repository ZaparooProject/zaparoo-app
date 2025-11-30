import { useCallback, useEffect, useRef } from "react";
import { useShallow } from "zustand/react/shallow";
import { Capacitor } from "@capacitor/core";
import { Preferences } from "@capacitor/preferences";
import { App } from "@capacitor/app";
import toast from "react-hot-toast";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { Clock, AlertTriangle } from "lucide-react";
import { WebSocketManager, WebSocketState } from "../lib/websocketManager.ts";
import { logger } from "../lib/logger.ts";
import {
  IndexResponse,
  Notification,
  PlayingResponse,
  PlaytimeLimitReachedParams,
  PlaytimeLimitWarningParams,
  TokenResponse
} from "../lib/models.ts";
import {
  getWsUrl,
  CoreAPI,
  getDeviceAddress,
  NotificationRequest
} from "../lib/coreApi.ts";
import { useStatusStore, ConnectionState } from "../lib/store.ts";
import { formatDurationDisplay } from "../lib/utils.ts";

// Module-level timestamp to detect HMR - resets when module reloads
const moduleLoadTimestamp = Date.now();

export function CoreApiWebSocket() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const wsManagerRef = useRef<WebSocketManager | null>(null);
  const optimisticTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resumeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isResumingRef = useRef(false);

  const {
    targetDeviceAddress,
    setTargetDeviceAddress,
    setConnectionState,
    setConnectionError,
    setPlaying,
    setGamesIndex,
    setLastToken,
    addDeviceHistory,
    setDeviceHistory
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
      setDeviceHistory: state.setDeviceHistory
    }))
  );

  // Derive WebSocket URL from device address
  const wsUrl = targetDeviceAddress ? getWsUrl() : "";

  // Initialize device address from localStorage on mount, with retry for hot reload scenarios
  useEffect(() => {
    // If already have an address, skip
    if (targetDeviceAddress !== "") return;

    let attempts = 0;
    const maxAttempts = 5;
    const checkInterval = 100; // ms
    let timer: ReturnType<typeof setTimeout> | null = null;

    const checkAddress = () => {
      attempts++;
      const addr = getDeviceAddress();

      // Update store if we found an address
      if (addr !== "") {
        setTargetDeviceAddress(addr);
        return;
      }

      // Continue checking if we still don't have a valid address and haven't exceeded max attempts
      if (attempts < maxAttempts) {
        timer = setTimeout(checkAddress, checkInterval);
      }
    };

    checkAddress();

    return () => {
      if (timer) {
        clearTimeout(timer);
      }
    };
  }, [targetDeviceAddress, setTargetDeviceAddress]);

  // Shared function to check and apply optimistic connection state
  const applyOptimisticState = useCallback(async (
    timeoutRef: { current: ReturnType<typeof setTimeout> | null },
    logPrefix: string = ""
  ) => {
    try {
      // In dev mode, skip optimistic state if module just loaded (HMR scenario)
      // This prevents showing stale "reconnecting" state after hot reload
      if (import.meta.env.DEV) {
        const timeSinceModuleLoad = Date.now() - moduleLoadTimestamp;
        if (timeSinceModuleLoad < 2000) {
          logger.log(`${logPrefix}Skipping optimistic state - module just loaded (HMR)`);
          return false;
        }
      }

      const [lastStateResult, lastTimestampResult] = await Promise.all([
        Preferences.get({ key: "lastConnectionState" }),
        Preferences.get({ key: "lastConnectionTimestamp" })
      ]);

      const lastState = lastStateResult.value;
      const lastTimestamp = lastTimestampResult.value;

      // Only be optimistic if:
      // 1. Device address exists
      // 2. Last state was CONNECTED
      // 3. Last connection was within 10 minutes
      const TEN_MINUTES = 10 * 60 * 1000;
      const now = Date.now();

      if (
        lastState === WebSocketState.CONNECTED &&
        lastTimestamp &&
        now - parseInt(lastTimestamp) < TEN_MINUTES
      ) {
        logger.log(`${logPrefix}Showing optimistic reconnecting state`);
        setConnectionState(ConnectionState.RECONNECTING);
        setConnectionError("");

        // Clear any existing timeout
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
        }

        // Set a timeout to show real state if connection fails
        timeoutRef.current = setTimeout(() => {
          if (wsManagerRef.current) {
            const actualState = wsManagerRef.current.currentState;
            // If still not actually connected after 5 seconds, show real state
            if (actualState !== WebSocketState.CONNECTED) {
              logger.log(`${logPrefix}Optimistic timeout: showing real connection state`);
              switch (actualState) {
                case WebSocketState.CONNECTING:
                  setConnectionState(ConnectionState.CONNECTING);
                  break;
                case WebSocketState.RECONNECTING:
                  setConnectionState(ConnectionState.RECONNECTING);
                  break;
                case WebSocketState.ERROR:
                  setConnectionState(ConnectionState.ERROR);
                  break;
                case WebSocketState.DISCONNECTED:
                  setConnectionState(ConnectionState.DISCONNECTED);
                  break;
              }
            }
          }
          timeoutRef.current = null;
        }, 5000); // 5 second timeout

        return true; // Optimistic state applied
      } else {
        logger.log(`${logPrefix}Not showing optimistic state - conditions not met`);
        return false; // Not optimistic
      }
    } catch (error) {
      logger.error(`${logPrefix}Error checking optimistic state:`, error, { category: "storage", action: "get", key: "lastConnectionState", severity: "warning" });
      return false;
    }
  }, [setConnectionState, setConnectionError]);

  useEffect(() => {
    // Early exit checks
    if (targetDeviceAddress === "") {
      setConnectionState(ConnectionState.ERROR);
      setConnectionError("No device address configured");
      return;
    }
    if (!wsUrl) {
      setConnectionState(ConnectionState.ERROR);
      setConnectionError("Invalid WebSocket URL");
      return;
    }

    // Close any existing connection before creating a new one
    if (wsManagerRef.current) {
      wsManagerRef.current.destroy();
      wsManagerRef.current = null;
    }

    // Check if we should show optimistic connected state
    applyOptimisticState(optimisticTimeoutRef).then((isOptimistic) => {
      if (!isOptimistic) {
        setConnectionState(ConnectionState.CONNECTING);
      }
    });

    // Helper functions for message processing
    const mediaStarted = (params: PlayingResponse) => {
      try {
        logger.log("media.started", params);
        setPlaying(params);
      } catch (err) {
        logger.error("Error processing media.started notification:", err);
      }
    };

    const mediaStopped = () => {
      try {
        logger.log("media.stopped");
        setPlaying({
          systemId: "",
          systemName: "",
          mediaPath: "",
          mediaName: ""
        });
      } catch (err) {
        logger.error("Error processing media.stopped notification:", err);
      }
    };

    const mediaIndexing = (params: IndexResponse) => {
      try {
        logger.log("mediaIndexing", params);

        // Get current state before updating
        const currentState = useStatusStore.getState().gamesIndex;

        // Update the store with new state
        setGamesIndex(params);

        // Check for any meaningful state changes that require media query invalidation
        const indexingStateChanged = currentState.indexing !== params.indexing;
        const optimizingStateChanged = currentState.optimizing !== params.optimizing;
        const existsStateChanged = currentState.exists !== params.exists;
        const totalMediaChanged = currentState.totalMedia !== params.totalMedia;

        // Invalidate media query on any significant state change to keep UI in sync
        if (indexingStateChanged || optimizingStateChanged || existsStateChanged || totalMediaChanged) {
          logger.log("Database state changed, invalidating media query");
          queryClient.invalidateQueries({ queryKey: ["media"] });
        }
      } catch (err) {
        logger.error("Error processing mediaIndexing notification:", err);
      }
    };

    const activeToken = (params: TokenResponse) => {
      try {
        logger.log("activeToken", params);
        setLastToken(params);
      } catch (err) {
        logger.error("Error processing activeToken notification:", err);
      }
    };

    // Create WebSocket manager
    const wsManager = new WebSocketManager(
      {
        url: wsUrl,
        pingInterval: 15000,
        pongTimeout: 15000,
        reconnectInterval: 1000,
        maxReconnectAttempts: Infinity,
        reconnectBackoffMultiplier: 1.5,
        maxReconnectInterval: 2000,
        pingMessage: "ping",
        connectionTimeout: 10000
      },
      {
        onOpen: () => {
          isResumingRef.current = false; // Reset resume flag
          setConnectionState(ConnectionState.CONNECTED);
          setConnectionError("");

          // Flush any queued requests
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
              logger.error("Failed to get device history:", e, { category: "storage", action: "get", key: "deviceHistory", severity: "warning" });
            });

          // Get media information
          CoreAPI.media()
            .then((v) => {
              try {
                setGamesIndex(v.database);
                if (v.active.length > 0) {
                  setPlaying(v.active[0]);
                }
              } catch (e) {
                logger.error("Error processing media data:", e);
                toast.error(t("error", { msg: "Failed to process media data" }));
              }
            })
            .catch((e) => {
              logger.error("Failed to get media information:", e, { category: "api", action: "media" });
              toast.error(t("error", { msg: "Failed to fetch media" }));
            });

          // Get tokens information
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
              logger.error("Failed to get tokens information:", e, { category: "api", action: "tokens" });
              toast.error(t("error", { msg: "Failed to fetch tokens" }));
            });
        },
        onClose: () => {
          // Only show RECONNECTING if we weren't intentionally reconnecting
          // (e.g., due to visibility change or app resume)
          if (!isResumingRef.current) {
            setConnectionState(ConnectionState.RECONNECTING);
          }
        },
        onError: (error) => {
          const errorMsg = "Error communicating with server: " + wsUrl;
          setConnectionError(errorMsg);
          setConnectionState(ConnectionState.ERROR);
          logger.error(errorMsg, error);
        },
        onMessage: (e) => {
          logger.debug("message", e.data);

          // Process the received message
          if (!e || !e.data) {
            logger.error("Received empty message event");
            return;
          }

          CoreAPI.processReceived(e)
            .then((v: NotificationRequest | null) => {
              if (v !== null) {
                try {
                  switch (v.method) {
                    case Notification.MediaStarted:
                      mediaStarted(v.params as PlayingResponse);
                      break;
                    case Notification.MediaStopped:
                      mediaStopped();
                      break;
                    case Notification.MediaIndexing:
                      mediaIndexing(v.params as IndexResponse);
                      break;
                    case Notification.TokensScanned:
                      activeToken(v.params as TokenResponse);
                      break;
                    case Notification.PlaytimeLimitWarning: {
                      const warningParams = v.params as PlaytimeLimitWarningParams;
                      const remainingTime = formatDurationDisplay(warningParams.remaining);
                      toast(
                        (to) => (
                          <span
                            className="flex grow flex-col"
                            onClick={() => toast.dismiss(to.id)}
                            onKeyUp={(e) => (e.key === "Enter" || e.key === " ") && toast.dismiss(to.id)}
                            role="button"
                            tabIndex={0}
                          >
                            {t("settings.core.playtime.warningToast", {
                              remaining: remainingTime
                            })}
                          </span>
                        ),
                        {
                          icon: (
                            <span className="text-warning pl-1 pr-1">
                              <Clock size={20} />
                            </span>
                          ),
                          duration: 5000
                        }
                      );
                      break;
                    }
                    case Notification.PlaytimeLimitReached: {
                      const reachedParams = v.params as PlaytimeLimitReachedParams;
                      const limitType = reachedParams.reason === "daily" ? t("settings.core.playtime.dailyLimit") : t("settings.core.playtime.sessionLimit");
                      toast(
                        (to) => (
                          <span
                            className="flex grow flex-col"
                            onClick={() => toast.dismiss(to.id)}
                            onKeyUp={(e) => (e.key === "Enter" || e.key === " ") && toast.dismiss(to.id)}
                            role="button"
                            tabIndex={0}
                          >
                            {t("settings.core.playtime.reachedToast", {
                              type: limitType
                            })}
                          </span>
                        ),
                        {
                          icon: (
                            <span className="text-error pl-1 pr-1">
                              <AlertTriangle size={20} />
                            </span>
                          ),
                          duration: 6000
                        }
                      );
                      break;
                    }
                    default:
                      logger.warn("Unknown notification method:", v.method);
                  }
                } catch (err) {
                  logger.error("Error processing notification:", err);
                  toast.error(t("error", { msg: "Error processing notification" }));
                }
              }
            })
            .catch((e) => {
              logger.error("Error processing message:", e, { category: "websocket", action: "processMessage" });
              toast.error(t("error", { msg: e?.message || "Unknown error" }));
            });
        },
        onStateChange: (state) => {
          // Map WebSocketState to ConnectionState
          switch (state) {
            case WebSocketState.CONNECTING:
              // Don't show intermediate connecting state on app resume
              if (!isResumingRef.current) {
                setConnectionState(ConnectionState.CONNECTING);
              }
              break;
            case WebSocketState.CONNECTED:
              isResumingRef.current = false;
              // This is handled in onOpen callback
              break;
            case WebSocketState.RECONNECTING:
              // Don't reset isResumingRef here - it would allow the subsequent
              // CONNECTING state to show a flicker. Only reset on CONNECTED/ERROR.
              setConnectionState(ConnectionState.RECONNECTING);
              break;
            case WebSocketState.ERROR:
              isResumingRef.current = false;
              setConnectionState(ConnectionState.ERROR);
              break;
            case WebSocketState.DISCONNECTED:
              isResumingRef.current = false;
              setConnectionState(ConnectionState.DISCONNECTED);
              break;
          }
        }
      }
    );

    wsManagerRef.current = wsManager;

    // Pass WebSocket manager to CoreAPI
    CoreAPI.setWsInstance(wsManager);

    // Start connection
    wsManager.connect();

    // Cleanup function: close WebSocket on component unmount or dependency change
    return () => {
      logger.log("CoreApiWebSocket cleanup: destroying WebSocket manager");

      // Clear optimistic timeout if active
      if (optimisticTimeoutRef.current) {
        clearTimeout(optimisticTimeoutRef.current);
        optimisticTimeoutRef.current = null;
      }

      wsManager.destroy();
      wsManagerRef.current = null;
      setConnectionState(ConnectionState.DISCONNECTED);

      // In dev mode, clear persisted connection state to prevent HMR from
      // showing stale "reconnecting" state on module hot reload
      if (import.meta.env.DEV) {
        Preferences.remove({ key: "lastConnectionState" });
        Preferences.remove({ key: "lastConnectionTimestamp" });
      }
    };
  }, [
    targetDeviceAddress,
    wsUrl,
    addDeviceHistory,
    setConnectionError,
    setConnectionState,
    setDeviceHistory,
    setGamesIndex,
    setLastToken,
    setPlaying,
    queryClient,
    t,
    applyOptimisticState
  ]); // Dependencies: re-create WebSocket if address or URL changes

  // App lifecycle listeners for handling pause/resume
  useEffect(() => {
    let resumeListener: Awaited<ReturnType<typeof App.addListener>> | null = null;
    let pauseListener: Awaited<ReturnType<typeof App.addListener>> | null = null;

    const setupListeners = async () => {
      // Handle app resume - trigger immediate reconnection with optimistic state
      resumeListener = await App.addListener("resume", async () => {
        logger.log("App resumed, triggering immediate reconnection");

        // Only attempt reconnection if we have a valid device address
        if (!targetDeviceAddress || !wsManagerRef.current) {
          return;
        }

        // Set flag to prevent UI flicker during reconnection
        isResumingRef.current = true;

        // Apply optimistic state in parallel with reconnection (don't block on disk I/O)
        applyOptimisticState(resumeTimeoutRef, "App resume: ");

        // Trigger immediate reconnection without waiting for optimistic check
        wsManagerRef.current.immediateReconnect();
      });

      // Handle app pause - persist connection state
      pauseListener = await App.addListener("pause", async () => {
        logger.log("App paused");

        if (wsManagerRef.current) {
          const currentState = wsManagerRef.current.currentState;
          const timestamp = Date.now();

          // Persist connection state for optimistic UI on resume
          await Preferences.set({
            key: "lastConnectionState",
            value: currentState
          });
          await Preferences.set({
            key: "lastConnectionTimestamp",
            value: timestamp.toString()
          });

          logger.log(`Persisted connection state: ${currentState} at ${timestamp}`);
        }
      });
    };

    setupListeners();

    // Cleanup listeners on unmount
    return () => {
      // Clear resume timeout if active
      if (resumeTimeoutRef.current) {
        clearTimeout(resumeTimeoutRef.current);
        resumeTimeoutRef.current = null;
      }

      resumeListener?.remove();
      pauseListener?.remove();
    };
  }, [targetDeviceAddress, setConnectionState, setConnectionError, applyOptimisticState]); // Re-setup listeners if device address changes

  // Browser visibility change handling (web platform only)
  useEffect(() => {
    // Skip on native platforms - they use Capacitor lifecycle events
    if (Capacitor.isNativePlatform()) return;

    const handleVisibilityChange = async () => {
      if (document.visibilityState === "visible") {
        logger.log("Tab became visible, checking connection status");

        if (!targetDeviceAddress || !wsManagerRef.current) return;

        const wsManager = wsManagerRef.current;

        // Resume heartbeat first to test connection health
        wsManager.resumeHeartbeat();

        // Check if WebSocket is actually connected
        if (!wsManager.isConnected) {
          logger.log("Connection not healthy, triggering immediate reconnect");
          isResumingRef.current = true;
          applyOptimisticState(resumeTimeoutRef, "Tab visible: ");
          wsManager.immediateReconnect();
        } else {
          logger.log("Connection still healthy after tab switch");
          setConnectionState(ConnectionState.CONNECTED);
        }
      } else if (document.visibilityState === "hidden") {
        logger.log("Tab hidden, pausing heartbeat and persisting state");

        if (wsManagerRef.current) {
          // Pause heartbeat to prevent timeout during tab suspension
          wsManagerRef.current.pauseHeartbeat();

          const currentState = wsManagerRef.current.currentState;
          const timestamp = Date.now();

          await Preferences.set({ key: "lastConnectionState", value: currentState });
          await Preferences.set({ key: "lastConnectionTimestamp", value: timestamp.toString() });
        }
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [targetDeviceAddress, setConnectionState, applyOptimisticState]);

  return null;
}