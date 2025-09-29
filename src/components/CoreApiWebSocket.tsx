import { useEffect, useRef } from "react";
import { useShallow } from "zustand/react/shallow";
import { Preferences } from "@capacitor/preferences";
import toast from "react-hot-toast";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { WebSocketManager, WebSocketState } from "../lib/websocketManager.ts";
import {
  IndexResponse,
  Notification,
  PlayingResponse,
  TokenResponse
} from "../lib/models.ts";
import {
  getWsUrl,
  CoreAPI,
  getDeviceAddress,
  NotificationRequest
} from "../lib/coreApi.ts";
import { useStatusStore, ConnectionState } from "../lib/store.ts";

export function CoreApiWebSocket() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const wsManagerRef = useRef<WebSocketManager | null>(null);

  const {
    setConnectionState,
    setConnectionStateWithGracePeriod,
    clearGracePeriod,
    setConnectionError,
    setPlaying,
    setGamesIndex,
    setLastToken,
    addDeviceHistory,
    setDeviceHistory
  } = useStatusStore(
    useShallow((state) => ({
      setConnectionState: state.setConnectionState,
      setConnectionStateWithGracePeriod: state.setConnectionStateWithGracePeriod,
      clearGracePeriod: state.clearGracePeriod,
      setConnectionError: state.setConnectionError,
      setPlaying: state.setPlaying,
      setGamesIndex: state.setGamesIndex,
      setLastToken: state.setLastToken,
      addDeviceHistory: state.addDeviceHistory,
      setDeviceHistory: state.setDeviceHistory
    }))
  );

  // Get WebSocket URL and device address outside useEffect for early exit
  const deviceAddress = getDeviceAddress();
  const wsUrl = getWsUrl();

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

        // Check for state transitions that require media query invalidation
        const transitionedFromIndexingToOptimizing =
          currentState.indexing && !params.indexing && params.optimizing;
        const transitionedFromOptimizingToComplete =
          currentState.optimizing && !params.optimizing && !params.indexing;

        // Invalidate media query on important transitions to refresh UI status
        if (transitionedFromIndexingToOptimizing || transitionedFromOptimizingToComplete) {
          console.log("State transition detected, invalidating media query");
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
        pingMessage: "ping"
      },
      {
        onOpen: () => {
          clearGracePeriod();
          setConnectionStateWithGracePeriod(ConnectionState.CONNECTED);
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
          setConnectionStateWithGracePeriod(ConnectionState.RECONNECTING);
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
              setConnectionState(ConnectionState.CONNECTING);
              break;
            case WebSocketState.CONNECTED:
              // This is handled in onOpen callback
              break;
            case WebSocketState.RECONNECTING:
              setConnectionStateWithGracePeriod(ConnectionState.RECONNECTING);
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
    );

    wsManagerRef.current = wsManager;

    // Pass WebSocket manager to CoreAPI
    CoreAPI.setWsInstance(wsManager);

    // Start connection
    wsManager.connect();

    // Cleanup function: close WebSocket on component unmount or dependency change
    return () => {
      console.log("CoreApiWebSocket cleanup: destroying WebSocket manager");
      wsManager.destroy();
      wsManagerRef.current = null;
      clearGracePeriod();
      setConnectionState(ConnectionState.DISCONNECTED);
    };
  }, [
    deviceAddress,
    wsUrl,
    addDeviceHistory,
    clearGracePeriod,
    setConnectionError,
    setConnectionState,
    setConnectionStateWithGracePeriod,
    setDeviceHistory,
    setGamesIndex,
    setLastToken,
    setPlaying,
    queryClient,
    t
  ]); // Dependencies: re-create WebSocket if address or URL changes

  return null;
}