import { Preferences } from "@capacitor/preferences";
import { v4 as uuidv4 } from "uuid";
import { Capacitor } from "@capacitor/core";
import { logger } from "./logger.ts";
import {
  AddMappingRequest,
  AllMappingsResponse,
  HistoryResponse,
  LaunchRequest,
  LogDownloadResponse,
  MediaActiveUpdateRequest,
  MediaResponse,
  MediaTagsResponse,
  Method,
  Notification,
  PlaytimeLimitsConfig,
  PlaytimeLimitsUpdateRequest,
  PlaytimeStatus,
  ReadersResponse,
  SearchParams,
  SearchResultsResponse,
  SettingsResponse,
  SystemsResponse,
  TokensResponse,
  UpdateMappingRequest,
  UpdateSettingsRequest,
  VersionResponse,
  WriteRequest,
} from "./models";

/**
 * Interface for transport compatibility.
 * Both WebSocketTransport and the old WebSocketManager implement this.
 */
interface TransportLike {
  send(data: string): void;
  readonly isConnected: boolean;
  readonly currentState?: string;
}

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
  private transport: TransportLike | null = null;
  private requestQueue: QueuedRequest[] = [];

  constructor() {
    this.send = () => logger.warn("WebSocket send is not initialized");
    this.responsePool = {};
  }

  setWsInstance(transport: TransportLike) {
    if (!transport || typeof transport.send !== "function") {
      logger.error("Invalid transport instance provided to CoreAPI");
      this.transport = null;
      this.send = () =>
        logger.warn("Transport send is not properly initialized");
      return;
    }

    this.transport = transport;
    this.send = (msg) => {
      try {
        transport.send(String(msg));
      } catch (e) {
        logger.error("Error in transport send:", e);
        throw new Error(
          `Transport send error: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    };

    // Immediately try to flush the queue when a new instance is set
    this.flushQueue();
  }

  // Backward compatibility method for tests
  setSend(fn: (msg: Parameters<WebSocket["send"]>[0]) => void) {
    if (typeof fn !== "function") {
      logger.error("Invalid send function provided to CoreAPI");
      this.send = () =>
        logger.warn("WebSocket send is not properly initialized");
      return;
    }

    this.send = (msg) => {
      try {
        fn(msg);
      } catch (e) {
        logger.error("Error in WebSocket send:", e);
        throw new Error(
          `WebSocket send error: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    };
  }

  // Method to flush queue - can be called externally
  flushQueue() {
    if (this.transport?.isConnected && this.requestQueue.length > 0) {
      const now = Date.now();
      const MAX_QUEUE_AGE_MS = 10000; // 10 seconds - drop stale requests

      // Filter out stale requests before processing
      const freshRequests = this.requestQueue.filter((queued) => {
        const age = now - queued.req.timestamp;
        if (age > MAX_QUEUE_AGE_MS) {
          logger.warn(
            `Dropping stale request ${queued.req.method} (age: ${age}ms)`,
          );
          // Resolve with cancelled status instead of rejecting to prevent error handlers
          queued.promiseHandlers.resolve({ cancelled: true });
          return false;
        }
        return true;
      });

      this.requestQueue = []; // Clear the queue

      if (freshRequests.length === 0) {
        return;
      }

      logger.log(`Flushing ${freshRequests.length} queued requests.`);

      freshRequests.forEach((queued) => {
        const { req, promiseHandlers, signal } = queued;
        const { resolve, reject } = promiseHandlers;

        // Re-initialize promise handling for the now-sent request
        const poolEntry = {
          resolve,
          reject,
          timeoutId: undefined as ReturnType<typeof setTimeout> | undefined,
        };
        this.responsePool[req.id] = poolEntry;

        const timeoutId = setTimeout(() => {
          const entry = this.responsePool[req.id];
          if (entry) {
            entry.reject(
              new Error("Request timeout (after queueing and sending)"),
            );
            delete this.responsePool[req.id];
          }
        }, RequestTimeout);
        poolEntry.timeoutId = timeoutId;

        if (signal) {
          const abortHandler = () => {
            const entry = this.responsePool[req.id];
            if (entry) {
              if (entry.timeoutId) {
                clearTimeout(entry.timeoutId);
              }
              entry.resolve({ cancelled: true });
              delete this.responsePool[req.id];
            }
          };
          signal.addEventListener("abort", abortHandler, { once: true });
        }

        try {
          this.send(JSON.stringify(req));
        } catch (e) {
          logger.error("Failed to send queued request during flush:", e);
          // If send fails even during flush, reject the original promise
          const entry = this.responsePool[req.id];
          if (entry) {
            if (entry.timeoutId) {
              clearTimeout(entry.timeoutId);
            }
            entry.reject(
              new Error(
                `Failed to send queued request: ${e instanceof Error ? e.message : String(e)}`,
              ),
            );
            delete this.responsePool[req.id];
          }
        }
      });
    }
  }

  // Method to reset all internal state - useful when reconnecting to a different device
  reset() {
    logger.log("Resetting CoreAPI state");

    const cancelError = new Error("Request cancelled: connection reset");

    // Clear all pending response promises with rejection
    Object.keys(this.responsePool).forEach((id) => {
      const responsePromise = this.responsePool[id];
      if (!responsePromise) return;
      if (responsePromise.timeoutId) {
        clearTimeout(responsePromise.timeoutId);
      }
      responsePromise.reject(cancelError);
    });

    // Clear response pool contents
    Object.keys(this.responsePool).forEach((id) => {
      delete this.responsePool[id];
    });

    // Clear request queue
    this.requestQueue.forEach((queued) => {
      queued.promiseHandlers.reject(cancelError);
    });
    this.requestQueue = [];

    // Clear pending write ID
    this.pendingWriteId = null;

    // Reset WebSocket manager (will be set by new connection)
    this.transport = null;
    this.send = () => logger.warn("WebSocket send is not initialized");
  }

  call(
    method: Method,
    params?: unknown,
    signal?: AbortSignal,
  ): Promise<unknown> {
    try {
      const id = uuidv4();
      const req: ApiRequest = {
        jsonrpc: "2.0",
        id,
        timestamp: Date.now(),
        method,
        params,
      };

      // Check if already aborted
      if (signal?.aborted) {
        return Promise.resolve({ cancelled: true });
      }

      // Check WebSocket state
      if (this.transport?.isConnected) {
        // Connection is open, send immediately
        const payload = JSON.stringify(req);
        logger.debug("Sending request", payload);

        let poolEntry: ResponsePromise | undefined;
        const promise = new Promise<unknown>((resolve, reject) => {
          poolEntry = { resolve, reject };
          this.responsePool[id] = poolEntry;
        });

        // Add timeout handling with rejection
        const timeoutId = setTimeout(() => {
          const entry = this.responsePool[id];
          if (entry) {
            entry.reject(new Error("Request timeout"));
            delete this.responsePool[id];
          }
        }, RequestTimeout);
        poolEntry!.timeoutId = timeoutId;

        // Add abort signal handling
        if (signal) {
          const abortHandler = () => {
            const entry = this.responsePool[id];
            if (entry) {
              if (entry.timeoutId) {
                clearTimeout(entry.timeoutId);
              }
              entry.resolve({ cancelled: true });
              delete this.responsePool[id];
            }
          };
          signal.addEventListener("abort", abortHandler, { once: true });
        }

        try {
          this.send(payload);
        } catch (e) {
          logger.error("Failed to send request:", e);
          delete this.responsePool[id];
          return Promise.reject(
            new Error(
              `Failed to send request: ${e instanceof Error ? e.message : String(e)}`,
            ),
          );
        }
        return promise;
      } else {
        // Connection not open, queue the request
        logger.debug(
          `Queueing request ${req.method} (ID: ${id}). Current state: ${this.transport?.currentState}`,
        );
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
      logger.error("Error in API call:", e, {
        category: "api",
        action: "call",
        method,
      });
      return Promise.reject(
        new Error(
          `API call error: ${e instanceof Error ? e.message : String(e)}`,
        ),
      );
    }
  }

  callWithTracking(
    method: Method,
    params?: unknown,
    signal?: AbortSignal,
  ): { id: string; promise: Promise<unknown> } {
    try {
      const id = uuidv4();
      const req: ApiRequest = {
        jsonrpc: "2.0",
        id,
        timestamp: Date.now(),
        method,
        params,
      };

      const payload = JSON.stringify(req);
      logger.debug("Sending tracked request", payload);

      // Check if already aborted
      if (signal?.aborted) {
        return { id, promise: Promise.resolve({ cancelled: true }) };
      }

      let poolEntry: ResponsePromise | undefined;
      const promise = new Promise<unknown>((resolve, reject) => {
        poolEntry = { resolve, reject };
        this.responsePool[id] = poolEntry;
      });

      // Add timeout handling with rejection
      const timeoutId = setTimeout(() => {
        const entry = this.responsePool[id];
        if (entry) {
          entry.reject(new Error("Request timeout"));
          delete this.responsePool[id];
        }
      }, RequestTimeout);

      // Store the timeout ID so it can be cleared if needed
      poolEntry!.timeoutId = timeoutId;

      // Add abort signal handling
      if (signal) {
        const abortHandler = () => {
          const entry = this.responsePool[id];
          if (entry) {
            // Clear timeout and resolve with cancelled status
            if (entry.timeoutId) {
              clearTimeout(entry.timeoutId);
            }
            entry.resolve({ cancelled: true });
            delete this.responsePool[id];
          }
        };

        signal.addEventListener("abort", abortHandler, { once: true });
        poolEntry!.abortController = new AbortController();
      }

      logger.debug(payload);

      // Add safe send
      try {
        this.send(payload);
      } catch (e) {
        logger.error("Failed to send tracked request:", e);
        delete this.responsePool[id];
        throw new Error(
          `Failed to send request: ${e instanceof Error ? e.message : String(e)}`,
        );
      }

      return { id, promise };
    } catch (e) {
      logger.error("Error in tracked API call:", e, {
        category: "api",
        action: "callWithTracking",
        method,
      });
      throw new Error(
        `API call error: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  cancelWrite(): void {
    const entry = this.pendingWriteId
      ? this.responsePool[this.pendingWriteId]
      : undefined;
    if (this.pendingWriteId && entry) {
      logger.debug("Cancelling write request:", this.pendingWriteId);

      // Clear the timeout to prevent it from firing
      if (entry.timeoutId) {
        clearTimeout(entry.timeoutId);
      }

      // Resolve with cancelled status instead of rejecting
      entry.resolve({ cancelled: true });
      delete this.responsePool[this.pendingWriteId];
      this.pendingWriteId = null;

      // Also send the cancel command to the API
      this.readersWriteCancel().catch((error) => {
        logger.error("Failed to send write cancel command:", error);
      });
    }
  }

  processReceived(msg: MessageEvent): Promise<NotificationRequest | null> {
    return new Promise<NotificationRequest | null>((resolve, reject) => {
      try {
        if (msg.data === "pong") {
          resolve(null);
          return;
        }

        let res: ApiResponse;
        try {
          res = JSON.parse(msg.data);
        } catch (e) {
          logger.error("Could not parse JSON:", msg.data, e, {
            category: "api",
            action: "parseJSON",
            severity: "critical",
            dataPreview: String(msg.data).slice(0, 100),
          });
          reject(
            new Error(
              `Error parsing JSON response: ${e instanceof Error ? e.message : String(e)}`,
            ),
          );
          return;
        }

        if (!res.jsonrpc || res.jsonrpc != "2.0") {
          reject(new Error("Not a valid JSON-RPC payload."));
          return;
        }

        if (!res.id) {
          logger.log("Received notification", res);
          try {
            const req = res as ApiRequest;
            resolve({
              method: req.method as Notification,
              params: req.params,
            });
          } catch (e) {
            logger.error("Error processing notification:", e);
            reject(
              new Error(
                `Error processing notification: ${e instanceof Error ? e.message : String(e)}`,
              ),
            );
          }
          return;
        }

        const promise = this.responsePool[res.id];
        if (!promise) {
          logger.log("Response ID does not exist:", msg.data);
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
        logger.error("Unexpected error processing message:", e, {
          category: "api",
          action: "processReceived",
        });
        reject(
          new Error(
            `Unexpected error: ${e instanceof Error ? e.message : String(e)}`,
          ),
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
            logger.debug(response);
            resolve(response);
          } catch (e) {
            logger.error("Error processing version response:", e);
            reject(
              new Error(
                `Failed to process version response: ${e instanceof Error ? e.message : String(e)}`,
              ),
            );
          }
        })
        .catch((error) => {
          logger.error("Version API call failed:", error);
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
          logger.error("Run API call failed:", error);
          reject(error);
        });
    });
  }

  write(
    params: WriteRequest,
    signal?: AbortSignal,
  ): Promise<void | { cancelled: true }> {
    return new Promise<void | { cancelled: true }>((resolve, reject) => {
      const writeResult = this.callWithTracking(
        Method.ReadersWrite,
        params,
        signal,
      );
      this.pendingWriteId = writeResult.id;

      writeResult.promise
        .then((result) => {
          // Clear pendingWriteId since the operation completed (success or cancellation)
          if (this.pendingWriteId === writeResult.id) {
            this.pendingWriteId = null;
          }

          // Check if the result indicates cancellation
          if (result && typeof result === "object" && "cancelled" in result) {
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
          logger.error("Write API call failed:", error);
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
            logger.debug(response);
            resolve(response);
          } catch (e) {
            logger.error("Error processing history response:", e);
            reject(
              new Error(
                `Failed to process history response: ${e instanceof Error ? e.message : String(e)}`,
              ),
            );
          }
        })
        .catch((error) => {
          logger.error("History API call failed:", error);
          reject(error);
        });
    });
  }

  mediaSearch(
    params: SearchParams,
    signal?: AbortSignal,
  ): Promise<SearchResultsResponse> {
    return new Promise<SearchResultsResponse>((resolve, reject) => {
      this.call(Method.MediaSearch, params, signal)
        .then((result) => {
          try {
            const response = result as SearchResultsResponse;
            logger.debug(response);
            resolve(response);
          } catch (e) {
            logger.error("Error processing media search response:", e);
            reject(
              new Error(
                `Failed to process media search response: ${e instanceof Error ? e.message : String(e)}`,
              ),
            );
          }
        })
        .catch((error) => {
          logger.error("Media search API call failed:", error);
          reject(error);
        });
    });
  }

  mediaTags(systems?: string[]): Promise<MediaTagsResponse> {
    return new Promise<MediaTagsResponse>((resolve, reject) => {
      const params = systems ? { systems } : {};
      this.call(Method.MediaTags, params)
        .then((result) => {
          try {
            const response = result as MediaTagsResponse;
            logger.debug(response);
            resolve(response);
          } catch (e) {
            logger.error("Error processing media tags response:", e);
            reject(
              new Error(
                `Failed to process media tags response: ${e instanceof Error ? e.message : String(e)}`,
              ),
            );
          }
        })
        .catch((error) => {
          logger.error("Media tags API call failed:", error);
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
          logger.error("Media generate API call failed:", error);
          reject(error);
        });
    });
  }

  mediaGenerateCancel(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      this.call(Method.MediaGenerateCancel)
        .then(() => {
          resolve();
        })
        .catch((error) => {
          logger.error("Media generate cancel API call failed:", error);
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
            logger.debug(response);
            resolve(response);
          } catch (e) {
            logger.error("Error processing systems response:", e);
            reject(
              new Error(
                `Failed to process systems response: ${e instanceof Error ? e.message : String(e)}`,
              ),
            );
          }
        })
        .catch((error) => {
          logger.error("Systems API call failed:", error);
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
            logger.debug(response);
            resolve(response);
          } catch (e) {
            logger.error("Error processing settings response:", e);
            reject(
              new Error(
                `Failed to process settings response: ${e instanceof Error ? e.message : String(e)}`,
              ),
            );
          }
        })
        .catch((error) => {
          logger.error("Settings API call failed:", error);
          reject(error);
        });
    });
  }

  settingsUpdate(params: UpdateSettingsRequest): Promise<void> {
    logger.debug("settings update", params);
    return new Promise<void>((resolve, reject) => {
      this.call(Method.SettingsUpdate, params)
        .then(() => {
          resolve();
        })
        .catch((error) => {
          logger.error("Settings update API call failed:", error);
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
            logger.debug(response);
            resolve(response);
          } catch (e) {
            logger.error("Error processing mappings response:", e);
            reject(
              new Error(
                `Failed to process mappings response: ${e instanceof Error ? e.message : String(e)}`,
              ),
            );
          }
        })
        .catch((error) => {
          logger.error("Mappings API call failed:", error);
          reject(error);
        });
    });
  }

  newMapping(params: AddMappingRequest): Promise<void> {
    logger.debug("mappings new", params);
    return new Promise<void>((resolve, reject) => {
      this.call(Method.MappingsNew, params)
        .then(() => {
          resolve();
        })
        .catch((error) => {
          logger.error("New mapping API call failed:", error);
          reject(error);
        });
    });
  }

  updateMapping(params: UpdateMappingRequest): Promise<void> {
    logger.debug("mappings update", params);
    return new Promise<void>((resolve, reject) => {
      this.call(Method.MappingsUpdate, params)
        .then(() => {
          resolve();
        })
        .catch((error) => {
          logger.error("Update mapping API call failed:", error);
          reject(error);
        });
    });
  }

  deleteMapping(params: { id: number }): Promise<void> {
    logger.debug("mappings delete", params);
    return new Promise<void>((resolve, reject) => {
      this.call(Method.MappingsDelete, params)
        .then(() => {
          resolve();
        })
        .catch((error) => {
          logger.error("Delete mapping API call failed:", error);
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
          logger.error("Mappings reload API call failed:", error);
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
            logger.debug(response);
            resolve(response);
          } catch (e) {
            logger.error("Error processing media response:", e);
            reject(
              new Error(
                `Failed to process media response: ${e instanceof Error ? e.message : String(e)}`,
              ),
            );
          }
        })
        .catch((error) => {
          logger.error("Media API call failed:", error);
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
            logger.debug(response);
            resolve(response);
          } catch (e) {
            logger.error("Error processing tokens response:", e);
            reject(
              new Error(
                `Failed to process tokens response: ${e instanceof Error ? e.message : String(e)}`,
              ),
            );
          }
        })
        .catch((error) => {
          logger.error("Tokens API call failed:", error);
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
          logger.error("Stop API call failed:", error);
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
          logger.error("Media active API call failed:", error);
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
          logger.error("Media active update API call failed:", error);
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
          logger.error("Settings reload API call failed:", error);
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
          logger.error("Readers API call failed:", error);
          reject(error);
        });
    });
  }

  async hasWriteCapableReader(): Promise<boolean> {
    try {
      const response = await this.readers();
      if (!response?.readers || !Array.isArray(response.readers)) {
        return false;
      }
      return response.readers.some(
        (reader) =>
          reader.connected &&
          Array.isArray(reader.capabilities) &&
          reader.capabilities.some((capability) =>
            capability.toLowerCase().includes("write"),
          ),
      );
    } catch (error) {
      logger.error("Failed to check write capable readers:", error);
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
          logger.error("Readers write cancel API call failed:", error);
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
          logger.error("Launchers refresh API call failed:", error);
          reject(error);
        });
    });
  }

  settingsLogsDownload(): Promise<LogDownloadResponse> {
    return this.call(
      Method.SettingsLogsDownload,
    ) as Promise<LogDownloadResponse>;
  }

  playtime(): Promise<PlaytimeStatus> {
    return new Promise<PlaytimeStatus>((resolve, reject) => {
      this.call(Method.Playtime)
        .then((result) => {
          try {
            const response = result as PlaytimeStatus;
            logger.debug(response);
            resolve(response);
          } catch (e) {
            logger.error("Error processing playtime response:", e);
            reject(
              new Error(
                `Failed to process playtime response: ${e instanceof Error ? e.message : String(e)}`,
              ),
            );
          }
        })
        .catch((error) => {
          logger.error("Playtime API call failed:", error);
          reject(error);
        });
    });
  }

  playtimeLimits(): Promise<PlaytimeLimitsConfig> {
    return new Promise<PlaytimeLimitsConfig>((resolve, reject) => {
      this.call(Method.PlaytimeLimits)
        .then((result) => {
          try {
            const response = result as PlaytimeLimitsConfig;
            logger.debug(response);
            resolve(response);
          } catch (e) {
            logger.error("Error processing playtime limits response:", e);
            reject(
              new Error(
                `Failed to process playtime limits response: ${e instanceof Error ? e.message : String(e)}`,
              ),
            );
          }
        })
        .catch((error) => {
          logger.error("Playtime limits API call failed:", error);
          reject(error);
        });
    });
  }

  playtimeLimitsUpdate(params: PlaytimeLimitsUpdateRequest): Promise<void> {
    logger.debug("playtime limits update", params);
    return new Promise<void>((resolve, reject) => {
      this.call(Method.PlaytimeLimitsUpdate, params)
        .then(() => {
          resolve();
        })
        .catch((error) => {
          logger.error("Playtime limits update API call failed:", error);
          reject(error);
        });
    });
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
    logger.error("Error getting device address:", e);
    return "";
  }
}

export function setDeviceAddress(addr: string) {
  try {
    localStorage.setItem(addrKey, addr);
    Preferences.set({ key: addrKey, value: addr })
      .then(() => logger.log("Set device address to: " + addr))
      .catch((e) => logger.error("Failed to set device address: " + e));
  } catch (e) {
    logger.error("Error setting device address:", e);
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
    const lastColonIndex = address.lastIndexOf(":");
    if (lastColonIndex > 0 && lastColonIndex < address.length - 1) {
      const potentialPort = address.substring(lastColonIndex + 1);
      // Validate that what follows the colon is a valid port number
      if (
        /^\d+$/.test(potentialPort) &&
        parseInt(potentialPort) > 0 &&
        parseInt(potentialPort) <= 65535
      ) {
        host = address.substring(0, lastColonIndex);
        port = potentialPort;
      }
    }

    return `ws://${host}:${port}/api/v0.1`;
  } catch (e) {
    logger.error("Error getting WebSocket URL:", e);
    return "";
  }
}
