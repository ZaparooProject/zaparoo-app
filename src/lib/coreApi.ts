import { Preferences } from "@capacitor/preferences";
import { v4 as uuidv4 } from "uuid";
import { Capacitor } from "@capacitor/core";
import { WebSocketManager } from "./websocketManager.ts";
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
  timeoutId?: ReturnType<typeof setTimeout>;
  abortController?: AbortController;
}

interface QueuedRequest {
  req: ApiRequest;
  promiseHandlers: {
    resolve: (value: unknown) => void;
    reject: (reason: ApiError | Error) => void;
  };
  signal?: AbortSignal;
}

class CoreApi {
  private send: (msg: Parameters<WebSocket["send"]>[0]) => void;
  private readonly responsePool: { [key: string]: ResponsePromise };
  private pendingWriteId: string | null = null;
  private wsManager: WebSocketManager | null = null;
  private requestQueue: QueuedRequest[] = [];

  constructor() {
    this.send = () => console.warn("WebSocket send is not initialized");
    this.responsePool = {};
  }

  setWsInstance(wsManager: WebSocketManager) {
    if (!wsManager || typeof wsManager.send !== "function") {
      console.error("Invalid WebSocketManager instance provided to CoreAPI");
      this.wsManager = null;
      this.send = () =>
        console.warn("WebSocket send is not properly initialized");
      return;
    }

    this.wsManager = wsManager;
    this.send = (msg) => {
      try {
        wsManager.send(String(msg));
      } catch (e) {
        console.error("Error in WebSocket send:", e);
        throw new Error(
          `WebSocket send error: ${e instanceof Error ? e.message : String(e)}`
        );
      }
    };

    // Immediately try to flush the queue when a new instance is set
    this.flushQueue();
  }

  // Backward compatibility method for tests
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

  // Method to flush queue - can be called externally
  flushQueue() {
    if (this.wsManager?.isConnected && this.requestQueue.length > 0) {
      console.log(`Flushing ${this.requestQueue.length} queued requests.`);
      const requestsToProcess = [...this.requestQueue];
      this.requestQueue = []; // Clear the queue

      requestsToProcess.forEach(queued => {
        const { req, promiseHandlers, signal } = queued;
        const { resolve, reject } = promiseHandlers;

        // Re-initialize promise handling for the now-sent request
        this.responsePool[req.id] = { resolve, reject };

        const timeoutId = setTimeout(() => {
          if (this.responsePool[req.id]) {
            this.responsePool[req.id].reject(new Error("Request timeout (after queueing and sending)"));
            delete this.responsePool[req.id];
          }
        }, RequestTimeout);
        this.responsePool[req.id].timeoutId = timeoutId;

        if (signal) {
          const abortHandler = () => {
            if (this.responsePool[req.id]) {
              if (this.responsePool[req.id].timeoutId) {
                clearTimeout(this.responsePool[req.id].timeoutId);
              }
              this.responsePool[req.id].resolve({ cancelled: true });
              delete this.responsePool[req.id];
            }
          };
          signal.addEventListener('abort', abortHandler, { once: true });
        }

        try {
          this.send(JSON.stringify(req));
        } catch (e) {
          console.error("Failed to send queued request during flush:", e);
          // If send fails even during flush, reject the original promise
          if (this.responsePool[req.id]) {
            clearTimeout(this.responsePool[req.id].timeoutId!);
            this.responsePool[req.id].reject(new Error(`Failed to send queued request: ${e instanceof Error ? e.message : String(e)}`));
            delete this.responsePool[req.id];
          }
        }
      });
    }
  }

  call(method: Method, params?: unknown, signal?: AbortSignal): Promise<unknown> {
    try {
      const id = uuidv4();
      const req: ApiRequest = {
        jsonrpc: "2.0",
        id,
        timestamp: Date.now(),
        method,
        params
      };

      // Check if already aborted
      if (signal?.aborted) {
        return Promise.resolve({ cancelled: true });
      }

      // Check WebSocket state
      if (this.wsManager?.isConnected) {
        // Connection is open, send immediately
        const payload = JSON.stringify(req);
        console.debug("Sending request", payload);

        const promise = new Promise<unknown>((resolve, reject) => {
          this.responsePool[id] = { resolve, reject };
        });

        // Add timeout handling with rejection
        const timeoutId = setTimeout(() => {
          if (this.responsePool[id]) {
            this.responsePool[id].reject(new Error("Request timeout"));
            delete this.responsePool[id];
          }
        }, RequestTimeout);
        this.responsePool[id].timeoutId = timeoutId;

        // Add abort signal handling
        if (signal) {
          const abortHandler = () => {
            if (this.responsePool[id]) {
              if (this.responsePool[id].timeoutId) {
                clearTimeout(this.responsePool[id].timeoutId);
              }
              this.responsePool[id].resolve({ cancelled: true });
              delete this.responsePool[id];
            }
          };
          signal.addEventListener('abort', abortHandler, { once: true });
        }

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
      } else {
        // Connection not open, queue the request
        console.debug(`Queueing request ${req.method} (ID: ${id}). Current state: ${this.wsManager?.currentState}`);
        const promise = new Promise<unknown>((resolve, reject) => {
          this.requestQueue.push({
            req,
            promiseHandlers: { resolve, reject },
            signal,
          });
        });
        return promise;
      }
    } catch (e) {
      console.error("Error in API call:", e);
      return Promise.reject(
        new Error(
          `API call error: ${e instanceof Error ? e.message : String(e)}`
        )
      );
    }
  }

  callWithTracking(method: Method, params?: unknown, signal?: AbortSignal): { id: string; promise: Promise<unknown> } {
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
      console.debug("Sending tracked request", payload);

      // Check if already aborted
      if (signal?.aborted) {
        return { id, promise: Promise.resolve({ cancelled: true }) };
      }

      const promise = new Promise<unknown>((resolve, reject) => {
        this.responsePool[id] = { resolve, reject };
      });

      // Add timeout handling with rejection
      const timeoutId = setTimeout(() => {
        if (this.responsePool[id]) {
          this.responsePool[id].reject(new Error("Request timeout"));
          delete this.responsePool[id];
        }
      }, RequestTimeout);

      // Store the timeout ID so it can be cleared if needed
      this.responsePool[id].timeoutId = timeoutId;

      // Add abort signal handling
      if (signal) {
        const abortHandler = () => {
          if (this.responsePool[id]) {
            // Clear timeout and resolve with cancelled status
            if (this.responsePool[id].timeoutId) {
              clearTimeout(this.responsePool[id].timeoutId);
            }
            this.responsePool[id].resolve({ cancelled: true });
            delete this.responsePool[id];
          }
        };

        signal.addEventListener('abort', abortHandler, { once: true });
        this.responsePool[id].abortController = new AbortController();
      }

      console.debug(payload);

      // Add safe send
      try {
        this.send(payload);
      } catch (e) {
        console.error("Failed to send tracked request:", e);
        delete this.responsePool[id];
        throw new Error(
          `Failed to send request: ${e instanceof Error ? e.message : String(e)}`
        );
      }

      return { id, promise };
    } catch (e) {
      console.error("Error in tracked API call:", e);
      throw new Error(
        `API call error: ${e instanceof Error ? e.message : String(e)}`
      );
    }
  }

  cancelWrite(): void {
    if (this.pendingWriteId && this.responsePool[this.pendingWriteId]) {
      console.debug("Cancelling write request:", this.pendingWriteId);

      // Clear the timeout to prevent it from firing
      if (this.responsePool[this.pendingWriteId].timeoutId) {
        clearTimeout(this.responsePool[this.pendingWriteId].timeoutId);
      }

      // Resolve with cancelled status instead of rejecting
      this.responsePool[this.pendingWriteId].resolve({ cancelled: true });
      delete this.responsePool[this.pendingWriteId];
      this.pendingWriteId = null;

      // Also send the cancel command to the API
      this.readersWriteCancel().catch((error) => {
        console.error("Failed to send write cancel command:", error);
      });
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

        // Clear timeout since we received a response
        if (promise.timeoutId) {
          clearTimeout(promise.timeoutId);
        }

        if (res.error) {
          promise.reject(new Error(res.error.message));
          delete this.responsePool[res.id];

          // Clear pendingWriteId if this error response is for the pending write
          if (res.id === this.pendingWriteId) {
            this.pendingWriteId = null;
          }
          return;
        }

        promise.resolve(res.result);
        delete this.responsePool[res.id];

        // Clear pendingWriteId if this response is for the pending write
        if (res.id === this.pendingWriteId) {
          this.pendingWriteId = null;
        }
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

  write(params: WriteRequest, signal?: AbortSignal): Promise<void | { cancelled: true }> {
    return new Promise<void | { cancelled: true }>((resolve, reject) => {
      const writeResult = this.callWithTracking(Method.ReadersWrite, params, signal);
      this.pendingWriteId = writeResult.id;

      writeResult.promise
        .then((result) => {
          // Clear pendingWriteId since the operation completed (success or cancellation)
          if (this.pendingWriteId === writeResult.id) {
            this.pendingWriteId = null;
          }

          // Check if the result indicates cancellation
          if (result && typeof result === 'object' && 'cancelled' in result) {
            resolve(result as { cancelled: true });
          } else {
            resolve();
          }
        })
        .catch((error) => {
          // Clear pendingWriteId since the operation failed
          if (this.pendingWriteId === writeResult.id) {
            this.pendingWriteId = null;
          }
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

  async hasWriteCapableReader(): Promise<boolean> {
    try {
      const response = await this.readers();
      return response.readers.some(reader =>
        reader.connected &&
        reader.capabilities.some(capability =>
          capability.toLowerCase().includes('write')
        )
      );
    } catch (error) {
      console.error("Failed to check write capable readers:", error);
      return false;
    }
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
