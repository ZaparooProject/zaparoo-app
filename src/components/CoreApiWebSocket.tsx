import { useCallback, useEffect, useRef, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { Preferences } from "@capacitor/preferences";
import { App } from "@capacitor/app";
import toast from "react-hot-toast";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { WebSocketManager, WebSocketState } from "../lib/websocketManager.ts";
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

export function CoreApiWebSocket() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const wsManagerRef = useRef<WebSocketManager | null>(null);
  const optimisticTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resumeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isResumingRef = useRef(false);
  const [deviceAddress, setDeviceAddress] = useState(getDeviceAddress());
  const [wsUrl, setWsUrl] = useState(getWsUrl());

  const {
    setConnectionState,
    setConnectionError,
    setPlaying,
    setGamesIndex,
    setLastToken,
    addDeviceHistory,
    setDeviceHistory
  } = useStatusStore(
    useShallow((state) => ({
      setConnectionState: state.setConnectionState,
      setConnectionError: state.setConnectionError,
      setPlaying: state.setPlaying,
      setGamesIndex: state.setGamesIndex,
      setLastToken: state.setLastToken,
      addDeviceHistory: state.addDeviceHistory,
      setDeviceHistory: state.setDeviceHistory
    }))
  );

  // Retry logic to handle hot reload scenarios where localStorage might be temporarily unavailable
  useEffect(() => {
    let attempts = 0;
    const maxAttempts = 5;
    const checkInterval = 100; // ms
    let timer: ReturnType<typeof setTimeout> | null = null;

    const checkAddress = () => {
      attempts++;
      const addr = getDeviceAddress();
      const url = getWsUrl();

      // Update state if values changed
      if (addr !== deviceAddress) {
        setDeviceAddress(addr);
      }

      if (url !== wsUrl) {
        setWsUrl(url);
      }

      // Continue checking if we still don't have a valid address/URL and haven't exceeded max attempts
      const stillEmpty = addr === "" || url === "";
      if (stillEmpty && attempts < maxAttempts) {
        timer = setTimeout(checkAddress, checkInterval);
      }
    };

    // Only start retry logic if we don't have an address yet
    // This prevents unnecessary retries when address is already available
    if (deviceAddress === "" || wsUrl === "") {
      checkAddress();
    }

    return () => {
      if (timer) {
        clearTimeout(timer);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Run once on mount - deviceAddress/wsUrl are intentionally omitted as this bootstraps their initial values

  // Shared function to check and apply optimistic connection state
  const applyOptimisticState = useCallback(async (
    timeoutRef: { current: ReturnType<typeof setTimeout> | null },
    logPrefix: string = ""
  ) => {
    try {
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
        console.log(`${logPrefix}Showing optimistic connected state`);
        setConnectionState(ConnectionState.CONNECTED);
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
              console.log(`${logPrefix}Optimistic timeout: showing real connection state`);
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
        console.log(`${logPrefix}Not showing optimistic state - conditions not met`);
        return false; // Not optimistic
      }
    } catch (error) {
      console.error(`${logPrefix}Error checking optimistic state:`, error);
      return false;
    }
  }, [setConnectionState, setConnectionError]);

  useEffect(() => {
    // Early exit checks
    if (deviceAddress === "") {
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
        console.log("media.started", params);
        setPlaying(params);
      } catch (err) {
        console.error("Error processing media.started notification:", err);
      }
    };

    const mediaStopped = () => {
      try {
        console.log("media.stopped");
        setPlaying({
          systemId: "",
          systemName: "",
          mediaPath: "",
          mediaName: ""
        });
      } catch (err) {
        console.error("Error processing media.stopped notification:", err);
      }
    };

    const mediaIndexing = (params: IndexResponse) => {
      try {
        console.log("mediaIndexing", params);

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
          console.log("Database state changed, invalidating media query");
          queryClient.invalidateQueries({ queryKey: ["media"] });
        }
      } catch (err) {
        console.error("Error processing mediaIndexing notification:", err);
      }
    };

    const activeToken = (params: TokenResponse) => {
      try {
        console.log("activeToken", params);
        setLastToken(params);
      } catch (err) {
        console.error("Error processing activeToken notification:", err);
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
                console.error("Error processing device history:", e);
                toast.error(t("error", { msg: "Failed to load device history" }));
              }
            })
            .catch((e) => {
              console.error("Failed to get device history:", e);
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
                console.error("Error processing media data:", e);
                toast.error(t("error", { msg: "Failed to process media data" }));
              }
            })
            .catch((e) => {
              console.error("Failed to get media information:", e);
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
                console.error("Error processing tokens data:", e);
                toast.error(t("error", { msg: "Failed to process tokens data" }));
              }
            })
            .catch((e) => {
              console.error("Failed to get tokens information:", e);
              toast.error(t("error", { msg: "Failed to fetch tokens" }));
            });
        },
        onClose: () => {
          setConnectionState(ConnectionState.RECONNECTING);
        },
        onError: (error) => {
          const errorMsg = "Error communicating with server: " + wsUrl;
          setConnectionError(errorMsg);
          setConnectionState(ConnectionState.ERROR);
          console.error(errorMsg, error);
        },
        onMessage: (e) => {
          console.debug("message", e.data);

          // Process the received message
          if (!e || !e.data) {
            console.error("Received empty message event");
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
                      const limitType = warningParams.type === "daily" ? t("settings.core.playtime.dailyLimit") : t("settings.core.playtime.sessionLimit");
                      toast(
                        t("settings.core.playtime.warningToast", {
                          remaining: remainingTime,
                          type: limitType
                        }),
                        {
                          icon: "⏰",
                          duration: 5000
                        }
                      );
                      break;
                    }
                    case Notification.PlaytimeLimitReached: {
                      const reachedParams = v.params as PlaytimeLimitReachedParams;
                      const limitType = reachedParams.reason === "daily" ? t("settings.core.playtime.dailyLimit") : t("settings.core.playtime.sessionLimit");
                      toast.error(
                        t("settings.core.playtime.reachedToast", {
                          type: limitType
                        }),
                        {
                          duration: 6000
                        }
                      );
                      break;
                    }
                    default:
                      console.warn("Unknown notification method:", v.method);
                  }
                } catch (err) {
                  console.error("Error processing notification:", err);
                  toast.error(t("error", { msg: "Error processing notification" }));
                }
              }
            })
            .catch((e) => {
              console.error("Error processing message:", e);
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
              isResumingRef.current = false;
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
      console.log("CoreApiWebSocket cleanup: destroying WebSocket manager");

      // Clear optimistic timeout if active
      if (optimisticTimeoutRef.current) {
        clearTimeout(optimisticTimeoutRef.current);
        optimisticTimeoutRef.current = null;
      }

      wsManager.destroy();
      wsManagerRef.current = null;
      setConnectionState(ConnectionState.DISCONNECTED);
    };
  }, [
    deviceAddress,
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
        console.log("App resumed, triggering immediate reconnection");

        // Only attempt reconnection if we have a valid device address
        if (!deviceAddress || !wsManagerRef.current) {
          return;
        }

        // Set flag to prevent UI flicker during reconnection
        isResumingRef.current = true;

        // Apply optimistic state using shared function
        await applyOptimisticState(resumeTimeoutRef, "App resume: ");

        // Trigger immediate reconnection
        wsManagerRef.current.immediateReconnect();
      });

      // Handle app pause - persist connection state
      pauseListener = await App.addListener("pause", async () => {
        console.log("App paused");

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

          console.log(`Persisted connection state: ${currentState} at ${timestamp}`);
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
  }, [deviceAddress, setConnectionState, setConnectionError, applyOptimisticState]); // Re-setup listeners if device address changes

  return null;
}