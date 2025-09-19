import { useEffect, useRef } from "react";
import { useShallow } from "zustand/react/shallow";
import { Preferences } from "@capacitor/preferences";
import WebsocketHeartbeatJs from "websocket-heartbeat-js";
import toast from "react-hot-toast";
import { useTranslation } from "react-i18next";
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
  const coreApiWsRef = useRef<WebsocketHeartbeatJs | null>(null);

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

  const { t } = useTranslation();

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
    if (coreApiWsRef.current) {
      coreApiWsRef.current.close();
      coreApiWsRef.current = null;
    }

    setConnectionState(ConnectionState.CONNECTING);

    let ws: WebsocketHeartbeatJs;
    try {
      ws = new WebsocketHeartbeatJs({
        url: wsUrl,
        reconnectTimeout: 1000,
        pingMsg: "ping"
      });
      coreApiWsRef.current = ws;
    } catch (e) {
      console.error("Failed to create WebSocket connection:", e);
      setConnectionState(ConnectionState.ERROR);
      setConnectionError(
        `Failed to create WebSocket: ${e instanceof Error ? e.message : String(e)}`
      );
      return;
    }

    ws.onerror = (e) => {
      const errorMsg = "Error communicating with server: " + wsUrl;
      setConnectionError(errorMsg);
      setConnectionState(ConnectionState.ERROR);
      console.error(errorMsg, e);
    };

    ws.onopen = () => {
      clearGracePeriod();
      setConnectionStateWithGracePeriod(ConnectionState.CONNECTED);
      setConnectionError("");

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
    };

    ws.onclose = () => {
      setConnectionStateWithGracePeriod(ConnectionState.RECONNECTING);
    };

    ws.onmessage = (e) => {
      console.debug("message", e.data);

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
          setGamesIndex(params);
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
    };

    // Set send function inside useEffect
    CoreAPI.setSend(ws.send.bind(ws));

    // Cleanup function: close WebSocket on component unmount or dependency change
    return () => {
      console.log("CoreApiWebSocket cleanup: closing WebSocket");
      ws.close();
      coreApiWsRef.current = null;
      clearGracePeriod();
      setConnectionState(ConnectionState.DISCONNECTED);
    };
  }, [deviceAddress, wsUrl, setConnectionState, setConnectionStateWithGracePeriod, clearGracePeriod, setConnectionError, setPlaying, setGamesIndex, setLastToken, addDeviceHistory, setDeviceHistory, t]);

  return null;
}
