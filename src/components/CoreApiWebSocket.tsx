import { useStatusStore } from "../lib/store.ts";
import { getWsUrl, CoreAPI, getDeviceAddress } from "../lib/coreApi.ts";
import {
  IndexResponse,
  Notification,
  PlayingResponse,
  TokenResponse
} from "../lib/models.ts";
import { useShallow } from "zustand/react/shallow";
import { Preferences } from "@capacitor/preferences";
import WebsocketHeartbeatJs from "websocket-heartbeat-js";

let coreApiWs: WebsocketHeartbeatJs | null = null;

export function CoreApiWebSocket() {
  const {
    setConnected,
    setConnectionError,
    setPlaying,
    setGamesIndex,
    setLastToken,
    addDeviceHistory,
    setDeviceHistory
  } = useStatusStore(
    useShallow((state) => ({
      setConnected: state.setConnected,
      setConnectionError: state.setConnectionError,
      setPlaying: state.setPlaying,
      setGamesIndex: state.setGamesIndex,
      setLastToken: state.setLastToken,
      addDeviceHistory: state.addDeviceHistory,
      setDeviceHistory: state.setDeviceHistory
    }))
  );

  if (coreApiWs !== null) {
    return null;
  }

  coreApiWs = new WebsocketHeartbeatJs({
    url: getWsUrl(),
    reconnectTimeout: 1000,
    pingMsg: "ping"
  });

  coreApiWs.onerror = (e) => {
    setConnectionError("Error communicating with server: " + getWsUrl());
    console.log(e);
  };

  coreApiWs.onopen = () => {
    setConnected(true);
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
  };

  coreApiWs.onclose = () => {
    setConnected(false);
  };

  coreApiWs.onmessage = (e) => {
    console.debug("message", e.data);

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
      const notification = CoreAPI.processReceived(e);
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
  };

  CoreAPI.setSend(coreApiWs.send.bind(coreApiWs));

  return null;
}
