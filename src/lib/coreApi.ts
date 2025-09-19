import { Preferences } from "@capacitor/preferences";
import { v4 as uuidv4 } from "uuid";
import { Capacitor } from "@capacitor/core";
import {
  AddMappingRequest,
  AllMappingsResponse,
  HistoryResponse,
  LaunchRequest,
  LogDownloadResponse,
  MediaActiveUpdateRequest,
  MediaResponse,
  Method,
  Notification,
  ReadersResponse,
  SearchParams,
  SearchResultsResponse,
  SettingsResponse,
  SystemsResponse,
  TokensResponse,
  UpdateMappingRequest,
  UpdateSettingsRequest,
  VersionResponse,
  WriteRequest
} from "./models";

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

export interface NotificationRequest {
  method: Notification;
  params: unknown;
}

interface ResponsePromise {
  resolve: (value: unknown) => void;
  reject: (reason: ApiError | Error) => void;
}

class CoreApi {
  private send: (msg: Parameters<WebSocket["send"]>[0]) => void;
  private readonly responsePool: { [key: string]: ResponsePromise };

  constructor() {
    this.send = () => console.warn("WebSocket send is not initialized");
    this.responsePool = {};
  }

  setSend(fn: (msg: Parameters<WebSocket["send"]>[0]) => void) {
    if (typeof fn !== "function") {
      console.error("Invalid send function provided to CoreAPI");
      this.send = () =>
        console.warn("WebSocket send is not properly initialized");
      return;
    }

    this.send = (msg) => {
      try {
        fn(msg);
      } catch (e) {
        console.error("Error in WebSocket send:", e);
        throw new Error(
          `WebSocket send error: ${e instanceof Error ? e.message : String(e)}`
        );
      }
    };
  }

  call(method: Method, params?: unknown): Promise<unknown> {
    try {
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

      // Add timeout handling with rejection
      setTimeout(() => {
        if (this.responsePool[id]) {
          this.responsePool[id].reject(new Error("Request timeout"));
          delete this.responsePool[id];
        }
      }, RequestTimeout);

      console.debug(payload);

      // Add safe send
      try {
        this.send(payload);
      } catch (e) {
        console.error("Failed to send request:", e);
        delete this.responsePool[id];
        return Promise.reject(
          new Error(
            `Failed to send request: ${e instanceof Error ? e.message : String(e)}`
          )
        );
      }

      return promise;
    } catch (e) {
      console.error("Error in API call:", e);
      return Promise.reject(
        new Error(
          `API call error: ${e instanceof Error ? e.message : String(e)}`
        )
      );
    }
  }

  processReceived(msg: MessageEvent): Promise<NotificationRequest | null> {
    return new Promise<NotificationRequest | null>((resolve, reject) => {
      try {
        if (msg.data == "pong") {
          resolve(null);
          return;
        }

        let res: ApiResponse;
        try {
          res = JSON.parse(msg.data);
        } catch (e) {
          console.error("Could not parse JSON:", msg.data, e);
          reject(
            new Error(
              `Error parsing JSON response: ${e instanceof Error ? e.message : String(e)}`
            )
          );
          return;
        }

        if (!res.jsonrpc || res.jsonrpc != "2.0") {
          reject(new Error("Not a valid JSON-RPC payload."));
          return;
        }

        if (!res.id) {
          console.log("Received notification", res);
          try {
            const req = res as ApiRequest;
            resolve({
              method: req.method as Notification,
              params: req.params
            });
          } catch (e) {
            console.error("Error processing notification:", e);
            reject(
              new Error(
                `Error processing notification: ${e instanceof Error ? e.message : String(e)}`
              )
            );
          }
          return;
        }

        const promise = this.responsePool[res.id];
        if (!promise) {
          console.log("Response ID does not exist:", msg.data);
          resolve(null); // Changed from reject(null) to resolve(null) to prevent unhandled rejection
          return;
        }

        if (res.error) {
          promise.reject(new Error(res.error.message));
          delete this.responsePool[res.id];
          return;
        }

        promise.resolve(res.result);
        delete this.responsePool[res.id];
      } catch (e) {
        console.error("Unexpected error processing message:", e);
        reject(
          new Error(
            `Unexpected error: ${e instanceof Error ? e.message : String(e)}`
          )
        );
      }
    });
  }

  version(): Promise<VersionResponse> {
    return new Promise<VersionResponse>((resolve, reject) => {
      this.call(Method.Version)
        .then((result) => {
          try {
            const response = result as VersionResponse;
            console.debug(response);
            resolve(response);
          } catch (e) {
            console.error("Error processing version response:", e);
            reject(
              new Error(
                `Failed to process version response: ${e instanceof Error ? e.message : String(e)}`
              )
            );
          }
        })
        .catch((error) => {
          console.error("Version API call failed:", error);
          reject(error);
        });
    });
  }


  run(params: LaunchRequest): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      this.call(Method.Run, params)
        .then(() => {
          resolve();
        })
        .catch((error) => {
          console.error("Run API call failed:", error);
          reject(error);
        });
    });
  }

  write(params: WriteRequest): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      this.call(Method.ReadersWrite, params)
        .then(() => {
          resolve();
        })
        .catch((error) => {
          console.error("Write API call failed:", error);
          reject(error);
        });
    });
  }

  history(): Promise<HistoryResponse> {
    return new Promise<HistoryResponse>((resolve, reject) => {
      this.call(Method.History)
        .then((result) => {
          try {
            const response = result as HistoryResponse;
            console.debug(response);
            resolve(response);
          } catch (e) {
            console.error("Error processing history response:", e);
            reject(
              new Error(
                `Failed to process history response: ${e instanceof Error ? e.message : String(e)}`
              )
            );
          }
        })
        .catch((error) => {
          console.error("History API call failed:", error);
          reject(error);
        });
    });
  }

  mediaSearch(params: SearchParams): Promise<SearchResultsResponse> {
    return new Promise<SearchResultsResponse>((resolve, reject) => {
      this.call(Method.MediaSearch, params)
        .then((result) => {
          try {
            const response = result as SearchResultsResponse;
            console.debug(response);
            resolve(response);
          } catch (e) {
            console.error("Error processing media search response:", e);
            reject(
              new Error(
                `Failed to process media search response: ${e instanceof Error ? e.message : String(e)}`
              )
            );
          }
        })
        .catch((error) => {
          console.error("Media search API call failed:", error);
          reject(error);
        });
    });
  }


  mediaGenerate(params?: { systems?: string[] }): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      this.call(Method.MediaGenerate, params)
        .then(() => {
          resolve();
        })
        .catch((error) => {
          console.error("Media generate API call failed:", error);
          reject(error);
        });
    });
  }


  systems(): Promise<SystemsResponse> {
    return new Promise<SystemsResponse>((resolve, reject) => {
      this.call(Method.Systems)
        .then((result) => {
          try {
            const response = result as SystemsResponse;
            console.debug(response);
            resolve(response);
          } catch (e) {
            console.error("Error processing systems response:", e);
            reject(
              new Error(
                `Failed to process systems response: ${e instanceof Error ? e.message : String(e)}`
              )
            );
          }
        })
        .catch((error) => {
          console.error("Systems API call failed:", error);
          reject(error);
        });
    });
  }

  settings(): Promise<SettingsResponse> {
    return new Promise<SettingsResponse>((resolve, reject) => {
      this.call(Method.Settings)
        .then((result) => {
          try {
            const response = result as SettingsResponse;
            console.debug(response);
            resolve(response);
          } catch (e) {
            console.error("Error processing settings response:", e);
            reject(
              new Error(
                `Failed to process settings response: ${e instanceof Error ? e.message : String(e)}`
              )
            );
          }
        })
        .catch((error) => {
          console.error("Settings API call failed:", error);
          reject(error);
        });
    });
  }

  settingsUpdate(params: UpdateSettingsRequest): Promise<void> {
    console.debug("settings update", params);
    return new Promise<void>((resolve, reject) => {
      this.call(Method.SettingsUpdate, params)
        .then(() => {
          resolve();
        })
        .catch((error) => {
          console.error("Settings update API call failed:", error);
          reject(error);
        });
    });
  }

  mappings(): Promise<AllMappingsResponse> {
    return new Promise<AllMappingsResponse>((resolve, reject) => {
      this.call(Method.Mappings)
        .then((result) => {
          try {
            const response = result as AllMappingsResponse;
            console.debug(response);
            resolve(response);
          } catch (e) {
            console.error("Error processing mappings response:", e);
            reject(
              new Error(
                `Failed to process mappings response: ${e instanceof Error ? e.message : String(e)}`
              )
            );
          }
        })
        .catch((error) => {
          console.error("Mappings API call failed:", error);
          reject(error);
        });
    });
  }

  newMapping(params: AddMappingRequest): Promise<void> {
    console.debug("mappings new", params);
    return new Promise<void>((resolve, reject) => {
      this.call(Method.MappingsNew, params)
        .then(() => {
          resolve();
        })
        .catch((error) => {
          console.error("New mapping API call failed:", error);
          reject(error);
        });
    });
  }

  updateMapping(params: UpdateMappingRequest): Promise<void> {
    console.debug("mappings update", params);
    return new Promise<void>((resolve, reject) => {
      this.call(Method.MappingsUpdate, params)
        .then(() => {
          resolve();
        })
        .catch((error) => {
          console.error("Update mapping API call failed:", error);
          reject(error);
        });
    });
  }

  deleteMapping(params: { id: number }): Promise<void> {
    console.debug("mappings delete", params);
    return new Promise<void>((resolve, reject) => {
      this.call(Method.MappingsDelete, params)
        .then(() => {
          resolve();
        })
        .catch((error) => {
          console.error("Delete mapping API call failed:", error);
          reject(error);
        });
    });
  }

  mappingsReload(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      this.call(Method.MappingsReload)
        .then(() => {
          resolve();
        })
        .catch((error) => {
          console.error("Mappings reload API call failed:", error);
          reject(error);
        });
    });
  }

  media(): Promise<MediaResponse> {
    return new Promise<MediaResponse>((resolve, reject) => {
      this.call(Method.Media)
        .then((result) => {
          try {
            const response = result as MediaResponse;
            console.debug(response);
            resolve(response);
          } catch (e) {
            console.error("Error processing media response:", e);
            reject(
              new Error(
                `Failed to process media response: ${e instanceof Error ? e.message : String(e)}`
              )
            );
          }
        })
        .catch((error) => {
          console.error("Media API call failed:", error);
          reject(error);
        });
    });
  }

  tokens(): Promise<TokensResponse> {
    return new Promise<TokensResponse>((resolve, reject) => {
      this.call(Method.Tokens)
        .then((result) => {
          try {
            const response = result as TokensResponse;
            console.debug(response);
            resolve(response);
          } catch (e) {
            console.error("Error processing tokens response:", e);
            reject(
              new Error(
                `Failed to process tokens response: ${e instanceof Error ? e.message : String(e)}`
              )
            );
          }
        })
        .catch((error) => {
          console.error("Tokens API call failed:", error);
          reject(error);
        });
    });
  }

  stop(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      this.call(Method.Stop)
        .then(() => {
          resolve();
        })
        .catch((error) => {
          console.error("Stop API call failed:", error);
          reject(error);
        });
    });
  }

  mediaActive(): Promise<MediaResponse["active"]> {
    return new Promise<MediaResponse["active"]>((resolve, reject) => {
      this.call(Method.MediaActive)
        .then((result) => {
          resolve(result as MediaResponse["active"]);
        })
        .catch((error) => {
          console.error("Media active API call failed:", error);
          reject(error);
        });
    });
  }

  mediaActiveUpdate(params: MediaActiveUpdateRequest): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      this.call(Method.MediaActiveUpdate, params)
        .then(() => {
          resolve();
        })
        .catch((error) => {
          console.error("Media active update API call failed:", error);
          reject(error);
        });
    });
  }


  settingsReload(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      this.call(Method.SettingsReload)
        .then(() => {
          resolve();
        })
        .catch((error) => {
          console.error("Settings reload API call failed:", error);
          reject(error);
        });
    });
  }

  readers(): Promise<ReadersResponse> {
    return new Promise<ReadersResponse>((resolve, reject) => {
      this.call(Method.Readers)
        .then((result) => {
          resolve(result as ReadersResponse);
        })
        .catch((error) => {
          console.error("Readers API call failed:", error);
          reject(error);
        });
    });
  }


  readersWriteCancel(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      this.call(Method.ReadersWriteCancel)
        .then(() => {
          resolve();
        })
        .catch((error) => {
          console.error("Readers write cancel API call failed:", error);
          reject(error);
        });
    });
  }

  launchersRefresh(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      this.call(Method.LaunchersRefresh)
        .then(() => {
          resolve();
        })
        .catch((error) => {
          console.error("Launchers refresh API call failed:", error);
          reject(error);
        });
    });
  }

  settingsLogsDownload(): Promise<LogDownloadResponse> {
    return this.call(Method.SettingsLogsDownload) as Promise<LogDownloadResponse>;
  }
}

export const CoreAPI = new CoreApi();

const addrKey = "deviceAddress";

export function getDeviceAddress() {
  try {
    const addr = localStorage.getItem(addrKey) || "";
    if (!Capacitor.isNativePlatform() && addr === "") {
      return window.location.hostname;
    } else {
      return addr;
    }
  } catch (e) {
    console.error("Error getting device address:", e);
    return "";
  }
}

export function setDeviceAddress(addr: string) {
  try {
    localStorage.setItem(addrKey, addr);
    Preferences.set({ key: addrKey, value: addr })
      .then(() => console.log("Set device address to: " + addr))
      .catch((e) => console.error("Failed to set device address: " + e));
  } catch (e) {
    console.error("Error setting device address:", e);
  }
}

export function getWsUrl() {
  try {
    const address = getDeviceAddress();

    // Parse host and port from address
    let host = address;
    let port = "7497"; // default port

    // Check if address contains a port (format: host:port)
    // For IPv6 addresses, we need to be more careful about colons
    const lastColonIndex = address.lastIndexOf(':');
    if (lastColonIndex > 0 && lastColonIndex < address.length - 1) {
      const potentialPort = address.substring(lastColonIndex + 1);
      // Validate that what follows the colon is a valid port number
      if (/^\d+$/.test(potentialPort) && parseInt(potentialPort) > 0 && parseInt(potentialPort) <= 65535) {
        host = address.substring(0, lastColonIndex);
        port = potentialPort;
      }
    }

    return `ws://${host}:${port}/api/v0.1`;
  } catch (e) {
    console.error("Error getting WebSocket URL:", e);
    return "";
  }
}
