import { useStatusStore } from "../lib/store.ts";
import useWebSocket, { ReadyState } from "react-use-websocket";
import { getWsUrl, CoreAPI, getDeviceAddress } from "../lib/coreApi.ts";
import { useEffect } from "react";
import {
  IndexResponse,
  Notification,
  PlayingResponse,
  TokenResponse
} from "../lib/models.ts";
import { useShallow } from "zustand/react/shallow";
import { Preferences } from "@capacitor/preferences";

export function CoreApiWebSocket() {
  const {
    connected,
    setConnected,
    setConnectionError,
    setPlaying,
    setGamesIndex,
    setLastToken,
    addDeviceHistory,
    setDeviceHistory
  } = useStatusStore(
    useShallow((state) => ({
      connected: state.connected,
      setConnected: state.setConnected,
      setConnectionError: state.setConnectionError,
      setPlaying: state.setPlaying,
      setGamesIndex: state.setGamesIndex,
      setLastToken: state.setLastToken,
      addDeviceHistory: state.addDeviceHistory,
      setDeviceHistory: state.setDeviceHistory
    }))
  );

  const { lastMessage, readyState, sendMessage } = useWebSocket(getWsUrl, {
    shouldReconnect: () => true,
    retryOnError: true,
    reconnectInterval: 250,
    reconnectAttempts: Infinity,
    share: true,
    heartbeat: true,
    onError: (e: WebSocketEventMap["error"]) => {
      setConnectionError("Could not connect to server: " + getWsUrl());
      console.log(e);
    },
    onOpen: () => {
      setConnectionError("");
      Preferences.get({ key: "deviceHistory" }).then((v) => {
        if (v.value) {
          setDeviceHistory(JSON.parse(v.value));
        }
        addDeviceHistory(getDeviceAddress());
      });
      CoreAPI.media().then((v) => {
        setGamesIndex(v.database);
        if (v.active.length > 0) {
          setPlaying(v.active[0]);
        }
      });
      CoreAPI.tokens().then((v) => {
        if (v.last) {
          setLastToken(v.last);
        }
      });
    }
  });

  CoreAPI.setSend(sendMessage);

  useEffect(() => {
    switch (readyState) {
      case ReadyState.OPEN:
        if (!connected) {
          setConnected(true);
          setConnectionError("");
        }
        break;
      case ReadyState.CLOSED:
        if (connected) {
          setConnected(false);
        }
        break;
    }
  }, [readyState, setConnected, connected, setConnectionError]);

  useEffect(() => {
    const mediaStarted = (params: PlayingResponse) => {
      console.log("media.started", params);
      setPlaying(params);
    };

    const mediaStopped = () => {
      console.log("media.stopped");
      setPlaying({
        systemId: "",
        systemName: "",
        mediaPath: "",
        mediaName: ""
      });
    };

    const mediaIndexing = (params: IndexResponse) => {
      console.log("mediaIndexing", params);
      setGamesIndex(params);
    };

    const activeToken = (params: TokenResponse) => {
      console.log("activeToken", params);
      setLastToken(params);
    };

    try {
      const notification = CoreAPI.processReceived(lastMessage);
      if (notification) {
        switch (notification.method) {
          case Notification.MediaStarted:
            mediaStarted(notification.params as PlayingResponse);
            break;
          case Notification.MediaStopped:
            mediaStopped();
            break;
          case Notification.MediaIndexing:
            mediaIndexing(notification.params as IndexResponse);
            break;
          case Notification.TokensScanned:
            activeToken(notification.params as TokenResponse);
            break;
        }
      }
    } catch (e) {
      console.error("Error processing message: " + e);
    }
  }, [lastMessage, setGamesIndex, setLastToken, setPlaying]);

  return null;
}
