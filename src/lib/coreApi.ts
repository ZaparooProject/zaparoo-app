import { Preferences } from "@capacitor/preferences";
import { v4 as uuidv4 } from "uuid";
import { Capacitor } from "@capacitor/core";
import { logger } from "./logger.ts";
import {
  AddMappingRequest,
  AllMappingsResponse,
  DeleteInboxRequest,
  HistoryResponse,
  InboxResponse,
  InputGamepadRequest,
  InputKeyboardRequest,
  LaunchRequest,
  LogDownloadResponse,
  MediaActiveUpdateRequest,
  MediaResponse,
  MediaCleanOrphansResponse,
  MediaScrapeCancelResponse,
  MediaScrapeParams,
  MediaScrapeResumeResponse,
  MediaTagsResponse,
  Method,
  Notification,
  PlaytimeLimitsConfig,
  PlaytimeLimitsUpdateRequest,
  PlaytimeStatus,
  ReadersResponse,
  ScrapersResponse,
  ScrapingStatusNotification,
  SearchParams,
  SearchResultsResponse,
  ScreenshotResponse,
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

export class CoreApiError extends Error {
  constructor(
    message: string,
    public readonly code: number,
  ) {
    super(message);
    this.name = "CoreApiError";
  }
}

export class MalformedCoreResponseError extends Error {
  constructor(
    public readonly parseMessage: string,
    public readonly requestId: string | null,
    public readonly dataLength: number,
    public readonly dataPreview: string,
  ) {
    super(`Malformed Core JSON response: ${parseMessage}`);
    this.name = "MalformedCoreResponseError";
  }
}

export function isMalformedCoreResponseError(
  error: unknown,
): error is MalformedCoreResponseError {
  return error instanceof MalformedCoreResponseError;
}

function normalizeMessageData(data: unknown): string {
  if (typeof data === "string") return data;
  if (data instanceof ArrayBuffer) {
    return new TextDecoder().decode(data);
  }
  return String(data);
}

function createSanitizedDataPreview(data: string): string {
  let preview = "";

  for (let index = 0; index < data.length && preview.length < 200; ) {
    const codePoint = data.codePointAt(index) ?? 0;
    const charLength = codePoint > 0xffff ? 2 : 1;
    const char = data.slice(index, index + charLength);

    preview += codePoint <= 31 || codePoint === 127 ? " " : char;
    index += charLength;
  }

  return preview;
}

function extractJsonRpcIdFromMalformedData(data: string): string | null {
  const match = data.match(/"id"\s*:\s*"([^"\\\r\n]{1,128})"/);
  return match?.[1] ?? null;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return String(error);
}

export function isUnsupportedMediaApiError(error: unknown): boolean {
  const message = getErrorMessage(error).toLowerCase();
  return (
    (error instanceof CoreApiError && error.code === -32601) ||
    message.includes("method not found") ||
    message === "query or system is required"
  );
}

export function isMissingMediaDatabaseSetupError(error: unknown): boolean {
  const message = getErrorMessage(error).toLowerCase();
  return (
    message.includes("no such table: dbconfig") ||
    message.includes("failed to get optimization status during indexing check")
  );
}

export function isExpectedMediaDatabaseError(error: unknown): boolean {
  return (
    isUnsupportedMediaApiError(error) || isMissingMediaDatabaseSetupError(error)
  );
}

function logMediaApiFailure(
  label: string,
  action: string,
  error: unknown,
  severity: "error" | "warning" = "error",
): void {
  if (isMalformedCoreResponseError(error)) {
    logger.warn(`${label}:`, error, {
      category: "api",
      action,
      severity: "warning",
      requestId: error.requestId,
      dataLength: error.dataLength,
      dataPreview: error.dataPreview,
    });
    return;
  }

  if (isExpectedMediaDatabaseError(error)) {
    logger.warn(`${label}:`, error, {
      category: "api",
      action,
      severity: "warning",
    });
    return;
  }

  logger.error(`${label}:`, error, {
    category: "api",
    action,
    severity,
  });
}

interface ApiError {
  code: number;
  message: string;
}

/**
 * Represents a cancelled API response (request was stale, aborted, or connection reset).
 */
export interface CancelledResponse {
  cancelled: true;
}

/**
 * Type guard to check if a response is a cancelled response.
 * Use this to safely handle API responses that may have been cancelled.
 */
export function isCancelled<T>(
  response: T | CancelledResponse,
): response is CancelledResponse {
  return (
    response !== null &&
    typeof response === "object" &&
    "cancelled" in response &&
    response.cancelled === true
  );
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

        // Check if request was aborted while queued
        if (signal?.aborted) {
          resolve({ cancelled: true });
          return;
        }

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

  private callConnected(
    method: Method,
    params?: unknown,
    signal?: AbortSignal,
  ): Promise<unknown> {
    if (signal?.aborted) {
      return Promise.resolve({ cancelled: true });
    }

    if (!this.transport?.isConnected) {
      return Promise.reject(new Error("Request requires active connection"));
    }

    return this.call(method, params, signal);
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

        const rawData = normalizeMessageData(msg.data);
        let res: ApiResponse;
        try {
          res = JSON.parse(rawData);
        } catch (e) {
          const parseMessage = e instanceof Error ? e.message : String(e);
          const requestId = extractJsonRpcIdFromMalformedData(rawData);
          const error = new MalformedCoreResponseError(
            parseMessage,
            requestId,
            rawData.length,
            createSanitizedDataPreview(rawData),
          );
          if (requestId) {
            const pendingResponse = this.responsePool[requestId];
            if (pendingResponse) {
              if (pendingResponse.timeoutId) {
                clearTimeout(pendingResponse.timeoutId);
              }
              pendingResponse.reject(error);
              delete this.responsePool[requestId];
              if (requestId === this.pendingWriteId) {
                this.pendingWriteId = null;
              }
              resolve(null);
              return;
            }
          }

          reject(error);
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
          promise.reject(new CoreApiError(res.error.message, res.error.code));
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

  confirm(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      this.call(Method.Confirm)
        .then(() => {
          resolve();
        })
        .catch((error) => {
          logger.error("Confirm API call failed:", error);
          reject(error);
        });
    });
  }

  inputKeyboard(params: InputKeyboardRequest): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      this.callConnected(Method.InputKeyboard, params)
        .then(() => {
          resolve();
        })
        .catch((error) => {
          logger.error("Input keyboard API call failed:", error, {
            category: "api",
            action: "inputKeyboard",
            severity: "error",
          });
          reject(error);
        });
    });
  }

  inputGamepad(params: InputGamepadRequest): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      this.callConnected(Method.InputGamepad, params)
        .then(() => {
          resolve();
        })
        .catch((error) => {
          logger.error("Input gamepad API call failed:", error, {
            category: "api",
            action: "inputGamepad",
            severity: "error",
          });
          reject(error);
        });
    });
  }

  screenshot(): Promise<ScreenshotResponse> {
    return new Promise<ScreenshotResponse>((resolve, reject) => {
      this.callConnected(Method.Screenshot)
        .then((response) => {
          if (
            response &&
            typeof response === "object" &&
            "path" in response &&
            "data" in response &&
            "size" in response &&
            typeof response.path === "string" &&
            typeof response.data === "string" &&
            typeof response.size === "number"
          ) {
            resolve(response as ScreenshotResponse);
            return;
          }

          reject(new Error("Invalid screenshot response"));
        })
        .catch((error) => {
          logger.error("Screenshot API call failed:", error, {
            category: "api",
            action: "screenshot",
            severity: "error",
          });
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
          logMediaApiFailure(
            "Media search API call failed",
            "mediaSearch",
            error,
          );
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
          logMediaApiFailure("Media tags API call failed", "mediaTags", error);
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
          logMediaApiFailure(
            "Media generate API call failed",
            "mediaGenerate",
            error,
          );
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
          logMediaApiFailure(
            "Media generate cancel API call failed",
            "mediaGenerateCancel",
            error,
            "warning",
          );
          reject(error);
        });
    });
  }

  mediaGenerateResume(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      this.call(Method.MediaGenerateResume)
        .then(() => {
          resolve();
        })
        .catch((error) => {
          logMediaApiFailure(
            "Media generate resume API call failed",
            "mediaGenerateResume",
            error,
            "warning",
          );
          reject(error);
        });
    });
  }

  mediaCleanOrphans(): Promise<MediaCleanOrphansResponse> {
    return new Promise<MediaCleanOrphansResponse>((resolve, reject) => {
      this.call(Method.MediaCleanOrphans)
        .then((result) => {
          try {
            const response = result as MediaCleanOrphansResponse;
            logger.debug(response);
            resolve(response);
          } catch (e) {
            logger.error("Error processing media clean orphans response:", e, {
              category: "coreApi",
              action: "mediaCleanOrphans",
              severity: "error",
            });
            reject(
              new Error(
                `Failed to process media clean orphans response: ${e instanceof Error ? e.message : String(e)}`,
              ),
            );
          }
        })
        .catch((error) => {
          logMediaApiFailure(
            "Media clean orphans API call failed",
            "mediaCleanOrphans",
            error,
          );
          reject(error);
        });
    });
  }

  scrapers(): Promise<ScrapersResponse> {
    return new Promise<ScrapersResponse>((resolve, reject) => {
      this.call(Method.Scrapers)
        .then((result) => {
          try {
            const response = result as ScrapersResponse;
            logger.debug(response);
            resolve(response);
          } catch (e) {
            logger.error("Error processing scrapers response:", e, {
              category: "coreApi",
              action: "scrapers",
              severity: "error",
            });
            reject(
              new Error(
                `Failed to process scrapers response: ${e instanceof Error ? e.message : String(e)}`,
              ),
            );
          }
        })
        .catch((error) => {
          logMediaApiFailure("Scrapers API call failed", "scrapers", error);
          reject(error);
        });
    });
  }

  mediaScrape(params: MediaScrapeParams): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      this.call(Method.MediaScrape, params)
        .then(() => {
          resolve();
        })
        .catch((error) => {
          logMediaApiFailure(
            "Media scrape API call failed",
            "mediaScrape",
            error,
          );
          reject(error);
        });
    });
  }

  mediaScrapeStatus(): Promise<ScrapingStatusNotification> {
    return new Promise<ScrapingStatusNotification>((resolve, reject) => {
      this.call(Method.MediaScrapeStatus)
        .then((result) => {
          try {
            const response = result as ScrapingStatusNotification;
            logger.debug(response);
            resolve(response);
          } catch (e) {
            logger.error("Error processing media scrape status response:", e, {
              category: "coreApi",
              action: "mediaScrapeStatus",
              severity: "error",
            });
            reject(
              new Error(
                `Failed to process media scrape status response: ${e instanceof Error ? e.message : String(e)}`,
              ),
            );
          }
        })
        .catch((error) => {
          logMediaApiFailure(
            "Media scrape status API call failed",
            "mediaScrapeStatus",
            error,
            "warning",
          );
          reject(error);
        });
    });
  }

  mediaScrapeCancel(): Promise<MediaScrapeCancelResponse> {
    return new Promise<MediaScrapeCancelResponse>((resolve, reject) => {
      this.call(Method.MediaScrapeCancel)
        .then((result) => {
          try {
            const response = result as MediaScrapeCancelResponse;
            logger.debug(response);
            resolve(response);
          } catch (e) {
            logger.error("Error processing media scrape cancel response:", e, {
              category: "coreApi",
              action: "mediaScrapeCancel",
              severity: "error",
            });
            reject(
              new Error(
                `Failed to process media scrape cancel response: ${e instanceof Error ? e.message : String(e)}`,
              ),
            );
          }
        })
        .catch((error) => {
          logMediaApiFailure(
            "Media scrape cancel API call failed",
            "mediaScrapeCancel",
            error,
            "warning",
          );
          reject(error);
        });
    });
  }

  mediaScrapeResume(): Promise<MediaScrapeResumeResponse> {
    return new Promise<MediaScrapeResumeResponse>((resolve, reject) => {
      this.call(Method.MediaScrapeResume)
        .then((result) => {
          try {
            const response = result as MediaScrapeResumeResponse;
            logger.debug(response);
            resolve(response);
          } catch (e) {
            logger.error("Error processing media scrape resume response:", e, {
              category: "coreApi",
              action: "mediaScrapeResume",
              severity: "error",
            });
            reject(
              new Error(
                `Failed to process media scrape resume response: ${e instanceof Error ? e.message : String(e)}`,
              ),
            );
          }
        })
        .catch((error) => {
          logMediaApiFailure(
            "Media scrape resume API call failed",
            "mediaScrapeResume",
            error,
            "warning",
          );
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
          logMediaApiFailure("Media API call failed", "media", error);
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
          logMediaApiFailure(
            "Media active API call failed",
            "mediaActive",
            error,
          );
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
          logMediaApiFailure(
            "Media active update API call failed",
            "mediaActiveUpdate",
            error,
          );
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

  /**
   * Synchronously check if the transport is currently connected.
   * Useful for determining write method without making async API calls.
   */
  isConnected(): boolean {
    return this.transport?.isConnected ?? false;
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

  inbox(): Promise<InboxResponse> {
    return new Promise<InboxResponse>((resolve, reject) => {
      this.call(Method.Inbox)
        .then((result) => {
          try {
            const response = result as InboxResponse;
            logger.debug(response);
            resolve(response);
          } catch (e) {
            logger.error("Error processing inbox response:", e, {
              category: "api",
              action: "inbox.process",
              severity: "error",
            });
            reject(
              new Error(
                `Failed to process inbox response: ${e instanceof Error ? e.message : String(e)}`,
              ),
            );
          }
        })
        .catch((error) => {
          logger.error("Inbox API call failed:", error, {
            category: "api",
            action: "inbox.fetch",
            severity: "error",
          });
          reject(error);
        });
    });
  }

  inboxDelete(params: DeleteInboxRequest): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      this.call(Method.InboxDelete, params)
        .then(() => {
          resolve();
        })
        .catch((error) => {
          logger.error("Inbox delete API call failed:", error, {
            category: "api",
            action: "inbox.delete",
            severity: "error",
          });
          reject(error);
        });
    });
  }

  inboxClear(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      this.call(Method.InboxClear)
        .then(() => {
          resolve();
        })
        .catch((error) => {
          logger.error("Inbox clear API call failed:", error, {
            category: "api",
            action: "inbox.clear",
            severity: "error",
          });
          reject(error);
        });
    });
  }
}

export const CoreAPI = new CoreApi();

const addrKey = "deviceAddress";
const DEFAULT_DEVICE_PORT = 7497;
const INVALID_DEVICE_ADDRESS_MESSAGE = "Invalid device address";

export class InvalidDeviceAddressError extends Error {
  constructor(message = INVALID_DEVICE_ADDRESS_MESSAGE) {
    super(message);
    this.name = "InvalidDeviceAddressError";
  }
}

export interface ValidDeviceAddress {
  ok: true;
  address: string;
  host: string;
  port: number;
  wsUrl: string;
}

export interface InvalidDeviceAddress {
  ok: false;
  errorKey: "settings.deviceAddressRequired" | "settings.deviceAddressInvalid";
  message: string;
}

export type DeviceAddressValidationResult =
  | ValidDeviceAddress
  | InvalidDeviceAddress;

function invalidDeviceAddress(
  errorKey: InvalidDeviceAddress["errorKey"] = "settings.deviceAddressInvalid",
): InvalidDeviceAddress {
  return {
    ok: false,
    errorKey,
    message:
      errorKey === "settings.deviceAddressRequired"
        ? "Enter a device address"
        : INVALID_DEVICE_ADDRESS_MESSAGE,
  };
}

function parsePort(port: string | undefined): number | null {
  if (port === undefined) return DEFAULT_DEVICE_PORT;
  if (!/^\d+$/.test(port)) return null;

  const parsed = Number(port);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) return null;
  return parsed;
}

function isValidIPv4(host: string): boolean {
  const octets = host.split(".");
  return (
    octets.length === 4 &&
    octets.every((octet) => {
      if (!/^\d+$/.test(octet)) return false;
      if (octet.length > 1 && octet.startsWith("0")) return false;
      const parsed = Number(octet);
      return parsed >= 0 && parsed <= 255;
    })
  );
}

function isValidIPv6(host: string): boolean {
  try {
    new URL(`ws://[${host}]`);
    return true;
  } catch {
    return false;
  }
}

function isValidHostname(host: string): boolean {
  if (host.length === 0 || host.length > 253) return false;
  if (/^[0-9.]+$/.test(host)) return false;

  const labels = host.split(".");
  return labels.every(
    (label) =>
      label.length > 0 &&
      label.length <= 63 &&
      /^[a-zA-Z0-9-]+$/.test(label) &&
      !label.startsWith("-") &&
      !label.endsWith("-"),
  );
}

function validateHost(host: string): boolean {
  if (isValidIPv4(host) || isValidHostname(host)) return true;

  if (/^[0-9.]+$/.test(host)) return false;
  return false;
}

type DeviceAddressScheme = "http" | "https" | "ws" | "wss";

type WebSocketScheme = "ws" | "wss";

function formatDeviceAddress(
  host: string,
  port: number,
  scheme?: DeviceAddressScheme,
): string {
  const hostPart = host.includes(":") ? `[${host}]` : host;
  const address =
    port === DEFAULT_DEVICE_PORT ? hostPart : `${hostPart}:${port}`;
  return scheme ? `${scheme}://${address}` : address;
}

function formatWsUrl(
  host: string,
  port: number,
  scheme: WebSocketScheme = "ws",
): string {
  const hostPart = host.includes(":") ? `[${host}]` : host;
  return `${scheme}://${hostPart}:${port}/api/v0.1`;
}

function validateHostAndPort(
  host: string,
  port: number | null,
  addressScheme?: DeviceAddressScheme,
  wsScheme?: WebSocketScheme,
): DeviceAddressValidationResult {
  if (port === null) return invalidDeviceAddress();
  if (!validateHost(host)) return invalidDeviceAddress();

  return {
    ok: true,
    address: formatDeviceAddress(host, port, addressScheme),
    host,
    port,
    wsUrl: formatWsUrl(host, port, wsScheme),
  };
}

function normalizeUrlInput(
  input: string,
): DeviceAddressValidationResult | null {
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(input)) return null;

  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return invalidDeviceAddress();
  }

  if (!["ws:", "wss:", "http:", "https:"].includes(url.protocol)) {
    return invalidDeviceAddress();
  }
  if (url.username || url.password || url.search || url.hash) {
    return invalidDeviceAddress();
  }
  if (!["", "/", "/api/v0.1"].includes(url.pathname)) {
    return invalidDeviceAddress();
  }

  const addressScheme = url.protocol.slice(0, -1) as DeviceAddressScheme;
  const wsScheme: WebSocketScheme = ["https:", "wss:"].includes(url.protocol)
    ? "wss"
    : "ws";
  const host = url.hostname.replace(/^\[|\]$/g, "");
  const port = parsePort(url.port || undefined);
  if (host.includes(":")) {
    if (port === null || !isValidIPv6(host)) return invalidDeviceAddress();
    return {
      ok: true,
      address: formatDeviceAddress(host, port, addressScheme),
      host,
      port,
      wsUrl: formatWsUrl(host, port, wsScheme),
    };
  }

  return validateHostAndPort(host, port, addressScheme, wsScheme);
}

export function validateDeviceAddress(
  input: string,
): DeviceAddressValidationResult {
  const address = input.trim();
  if (!address) return invalidDeviceAddress("settings.deviceAddressRequired");

  const urlResult = normalizeUrlInput(address);
  if (urlResult) return urlResult;

  if (/\s/.test(address)) return invalidDeviceAddress();

  if (address.startsWith("[")) {
    const match = /^\[([^\]]+)](?::([^:]+))?$/.exec(address);
    if (!match) return invalidDeviceAddress();

    const [, host, portInput] = match;
    if (!host || !isValidIPv6(host)) return invalidDeviceAddress();

    const port = parsePort(portInput);
    if (port === null) return invalidDeviceAddress();

    return {
      ok: true,
      address: formatDeviceAddress(host, port),
      host,
      port,
      wsUrl: formatWsUrl(host, port),
    };
  }

  const colonCount = (address.match(/:/g) || []).length;
  if (colonCount > 1) {
    if (!isValidIPv6(address)) return invalidDeviceAddress();
    return {
      ok: true,
      address: formatDeviceAddress(address, DEFAULT_DEVICE_PORT),
      host: address,
      port: DEFAULT_DEVICE_PORT,
      wsUrl: formatWsUrl(address, DEFAULT_DEVICE_PORT),
    };
  }

  if (colonCount === 1) {
    const [host, portInput] = address.split(":");
    if (!host || !portInput) return invalidDeviceAddress();
    return validateHostAndPort(host, parsePort(portInput));
  }

  return validateHostAndPort(address, DEFAULT_DEVICE_PORT);
}

export function isInvalidDeviceAddressError(error: unknown): boolean {
  return (
    error instanceof InvalidDeviceAddressError ||
    (error instanceof Error && error.message === INVALID_DEVICE_ADDRESS_MESSAGE)
  );
}

export function getDeviceAddress() {
  const addr = localStorage.getItem(addrKey) || "";
  if (!Capacitor.isNativePlatform() && addr === "") {
    return window.location.hostname;
  }
  return addr;
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

/** Parse a device address into host and numeric port. Handles IPv4, hostname, and IPv6. */
export function parseDeviceAddress(address: string): {
  host: string;
  port: number;
} {
  const result = validateDeviceAddress(address);
  if (result.ok) return { host: result.host, port: result.port };
  return { host: "", port: DEFAULT_DEVICE_PORT };
}

export function getWsUrl() {
  const address = getDeviceAddress();
  if (!address) return "";

  const result = validateDeviceAddress(address);
  if (!result.ok) {
    logger.warn(`Invalid device address format: ${address}`);
    return "";
  }

  return result.wsUrl;
}
