import {
  AllMappingsResponse,
  HistoryResponse,
  LaunchRequest,
  Method,
  Notification,
  SearchParams,
  SearchResultsResponse,
  SettingsResponse,
  StatusResponse,
  SystemsResponse,
  UpdateSettingsRequest,
  VersionResponse
} from "./models";
import { Preferences } from "@capacitor/preferences";
import { WebSocketMessage } from "react-use-websocket/dist/lib/types";
import { v4 as uuidv4 } from "uuid";
import { Capacitor } from "@capacitor/core";

const RequestTimeout = 30 * 1000;

interface ApiRequest {
  jsonrpc: string;
  id: string;
  timestamp: number;
  method: string;
  params: unknown;
}

interface ApiError {
  code: number;
  message: string;
}

interface ApiResponse {
  jsonrpc: string;
  id: string;
  timestamp: number;
  result?: unknown;
  error?: ApiError;
}

interface NotificationRequest {
  method: Notification;
  params: unknown;
}

interface ResponsePromise {
  resolve: (value: unknown) => void;
  reject: (reason: ApiError) => void;
}

class CoreApi {
  private send: (msg: WebSocketMessage) => void;
  private readonly responsePool: { [key: string]: ResponsePromise };

  constructor() {
    this.send = () => console.warn("WebSocket send is not initialized");
    this.responsePool = {};
  }

  setSend(fn: (msg: WebSocketMessage) => void) {
    this.send = fn;
  }

  call(method: Method, params?: unknown): Promise<unknown> {
    const id = uuidv4();
    const req: ApiRequest = {
      jsonrpc: "2.0",
      id,
      timestamp: Date.now(),
      method,
      params
    };

    const payload = JSON.stringify(req);
    console.debug("Sending request", payload);

    const promise = new Promise<unknown>((resolve, reject) => {
      this.responsePool[id] = { resolve, reject };
    });
    setTimeout(() => {
      delete this.responsePool[id];
    }, RequestTimeout);

    console.debug(payload);
    this.send(payload);

    return promise;
  }

  processReceived(msg: MessageEvent | null): NotificationRequest | void {
    if (!msg) {
      return;
    } else if (msg.data == "pong") {
      console.debug("Received pong");
      return;
    }

    let res: ApiResponse;
    try {
      res = JSON.parse(msg.data);
    } catch {
      console.error("Could not parse JSON: " + msg);
      return;
    }

    if (!res.jsonrpc || res.jsonrpc != "2.0") {
      throw new Error("Not a valid JSON-RPC payload");
    }

    if (!res.id) {
      console.log("Received notification", res);
      const req = res as ApiRequest;
      return {
        method: req.method as Notification,
        params: req.params
      };
    }

    const promise = this.responsePool[res.id];
    if (!promise) {
      throw new Error("Response ID does not exist");
    }

    if (res.error) {
      promise.reject(res.error);
      return;
    }

    promise.resolve(res.result);
  }

  version(): Promise<VersionResponse> {
    return new Promise<VersionResponse>((resolve, reject) => {
      this.call(Method.Version)
        .then((result) => {
          const response = result as VersionResponse;
          console.debug(response);
          resolve(response);
        })
        .catch(reject);
    });
  }

  launch(params: LaunchRequest): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      this.call(Method.Launch, params)
        .then(() => {
          resolve();
        })
        .catch(reject);
    });
  }

  history(): Promise<HistoryResponse> {
    return new Promise<HistoryResponse>((resolve, reject) => {
      this.call(Method.History)
        .then((result) => {
          const response = result as HistoryResponse;
          console.debug(response);
          resolve(response);
        })
        .catch(reject);
    });
  }

  mediaSearch(params: SearchParams): Promise<SearchResultsResponse> {
    return new Promise<SearchResultsResponse>((resolve, reject) => {
      this.call(Method.MediaSearch, params)
        .then((result) => {
          const response = result as SearchResultsResponse;
          console.debug(response);
          resolve(response);
        })
        .catch(reject);
    });
  }

  mediaIndex(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      this.call(Method.MediaIndex)
        .then(() => {
          resolve();
        })
        .catch(reject);
    });
  }

  systems(): Promise<SystemsResponse> {
    return new Promise<SystemsResponse>((resolve, reject) => {
      this.call(Method.Systems)
        .then((result) => {
          const response = result as SystemsResponse;
          console.debug(response);
          resolve(response);
        })
        .catch(reject);
    });
  }

  settings(): Promise<SettingsResponse> {
    return new Promise<SettingsResponse>((resolve, reject) => {
      this.call(Method.Settings)
        .then((result) => {
          const response = result as SettingsResponse;
          console.debug(response);
          resolve(response);
        })
        .catch(reject);
    });
  }

  settingsUpdate(params: UpdateSettingsRequest): Promise<void> {
    console.debug("settings update", params);
    return new Promise<void>((resolve, reject) => {
      this.call(Method.SettingsUpdate, params)
        .then(() => {
          resolve();
        })
        .catch(reject);
    });
  }

  mappings(): Promise<AllMappingsResponse> {
    return new Promise<AllMappingsResponse>((resolve, reject) => {
      this.call(Method.Mappings)
        .then((result) => {
          const response = result as AllMappingsResponse;
          console.debug(response);
          resolve(response);
        })
        .catch(reject);
    });
  }

  // DEPRECATED
  status(): Promise<StatusResponse> {
    return new Promise<StatusResponse>((resolve, reject) => {
      this.call(Method.Status)
        .then((result) => {
          const response = result as StatusResponse;
          console.debug(response);
          resolve(response);
        })
        .catch(reject);
    });
  }
}

export const CoreAPI = new CoreApi();

const addrKey = "deviceAddress";

export function getDeviceAddress() {
  const addr = localStorage.getItem(addrKey) || "";
  if (!Capacitor.isNativePlatform() && addr === "") {
    return window.location.hostname;
  } else {
    return addr;
  }
}

export function setDeviceAddress(addr: string) {
  localStorage.setItem(addrKey, addr);
  Preferences.set({ key: addrKey, value: addr })
    .then(() => console.log("Set device address to: " + addr))
    .catch((e) => console.error("Failed to set device address: " + e));
}

export function getWsUrl() {
  return "ws://" + getDeviceAddress() + ":7497/api/v1.0";
}
