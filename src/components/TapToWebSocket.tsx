import { useStatusStore } from "../lib/store.ts";
import useWebSocket, { ReadyState } from "react-use-websocket";
import { getWsUrl, TTA } from "../lib/api.ts";
import { useEffect } from "react";
import {
  IndexResponse,
  Notification,
  PlayingResponse,
  TokenResponse
} from "../lib/models.ts";
import { useShallow } from "zustand/react/shallow";

export function TapToWebSocket() {
  const { connected, setConnected, setConnectionError, setPlaying, setGamesIndex, setLastToken } =
    useStatusStore(useShallow((state) => ({
      connected: state.connected,
      setConnected: state.setConnected,
      setConnectionError: state.setConnectionError,
      setPlaying: state.setPlaying,
      setGamesIndex: state.setGamesIndex,
      setLastToken: state.setLastToken
    })));

  const { lastMessage, readyState, sendMessage } = useWebSocket(getWsUrl, {
    shouldReconnect: () => true,
    retryOnError: true,
    reconnectInterval: 250,
    reconnectAttempts: Infinity,
    share: true,
    heartbeat: true,
    onError: (e: WebSocketEventMap["error"]) => {
      setConnectionError("Could not connect to server: "+getWsUrl());
      console.log(e);
    }
  });

  TTA.setSend(sendMessage);

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
      const notification = TTA.processReceived(lastMessage);
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
          case Notification.TokensActive:
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
