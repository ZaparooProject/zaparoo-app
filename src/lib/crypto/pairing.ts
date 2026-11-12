// PAKE pairing flow — browser port of zaparoo-mcp/src/crypto/pairing.ts.
// Runs over HTTP or over a Bluetooth LE JSON-RPC link; the crypto is shared.

import { expand, extract } from "@noble/hashes/hkdf.js";
import { hmac } from "@noble/hashes/hmac.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { base64Decode, base64Encode } from "@/lib/crypto/base64";
import { buildHmacTranscript } from "@/lib/crypto/hmacTranscript";
import { PakeClient } from "@/lib/crypto/pake";

export interface PairingResult {
  authToken: string;
  clientId: string;
  pairingKey: Uint8Array;
}

export type PairingErrorKind =
  | "wrong_pin"
  | "limit_reached"
  | "session_unknown"
  | "pin_expired"
  | "rate_limited"
  | "no_pairing"
  | "too_many_clients"
  | "malformed"
  | "server_hmac_bad"
  | "network"
  | "unknown";

export class PairingError extends Error {
  readonly kind: PairingErrorKind;
  readonly httpStatus?: number;
  readonly retryAfterMs?: number;

  constructor(
    kind: PairingErrorKind,
    message: string,
    httpStatus?: number,
    retryAfterMs?: number,
  ) {
    super(message);
    this.name = "PairingError";
    this.kind = kind;
    this.httpStatus = httpStatus;
    this.retryAfterMs = retryAfterMs;
  }
}

// Outcomes of the user's input, Core's own limits, or the local network, not
// defects: a mistyped or stale PIN, too many attempts, or no route to Core.
const EXPECTED_PAIRING_ERROR_KINDS: ReadonlySet<PairingErrorKind> = new Set([
  "wrong_pin",
  "limit_reached",
  "session_unknown",
  "pin_expired",
  "rate_limited",
  "no_pairing",
  "too_many_clients",
  "network",
]);

/** Whether a pairing failure is an expected outcome rather than a defect. */
export function isExpectedPairingError(error: PairingError): boolean {
  return EXPECTED_PAIRING_ERROR_KINDS.has(error.kind);
}

// Core permits one pairing request per second per IP with a burst of one.
// Extra margin avoids racing the token refill at exactly one second.
export const PAIRING_REQUEST_INTERVAL_MS = 1100;
const MAX_RETRY_AFTER_MS = 5 * 60 * 1000;

const HTTP_ERROR_KINDS: Record<number, PairingErrorKind> = {
  400: "malformed",
  401: "wrong_pin",
  403: "limit_reached",
  404: "session_unknown",
  410: "pin_expired",
  429: "rate_limited",
};

// Core's JSON `error` messages (pkg/api/pairing.go). A status code alone is
// ambiguous: 400 also means no PIN is active, and 403 also means the client
// limit was reached.
const CORE_ERROR_KINDS: Record<string, PairingErrorKind> = {
  "no pairing in progress": "no_pairing",
  "pairing expired": "pin_expired",
  "too many failed attempts": "limit_reached",
  "unknown pairing session": "session_unknown",
  "maximum paired clients reached": "too_many_clients",
  "wrong PIN": "wrong_pin",
};

/** Core rejects client names longer than this many UTF-8 bytes. */
export const PAIRING_CLIENT_NAME_MAX_BYTES = 128;

function utf8Length(codePoint: number): number {
  if (codePoint <= 0x7f) return 1;
  if (codePoint <= 0x7ff) return 2;
  // Lone surrogates are sent as U+FFFD, which is also three bytes.
  if (codePoint <= 0xffff) return 3;
  return 4;
}

/** Truncate a client name to Core's byte limit without splitting a code point. */
export function truncateClientName(name: string): string {
  let bytes = 0;
  let end = 0;
  for (const char of name) {
    bytes += utf8Length(char.codePointAt(0)!);
    if (bytes > PAIRING_CLIENT_NAME_MAX_BYTES) break;
    end += char.length;
  }
  return name.slice(0, end);
}

async function readCoreError(resp: Response): Promise<string | undefined> {
  try {
    const body: unknown = await resp.json();
    if (
      typeof body === "object" &&
      body !== null &&
      typeof (body as { error?: unknown }).error === "string"
    ) {
      return (body as { error: string }).error;
    }
  } catch {
    // Not Core's JSON error body; the status code is all there is to go on.
  }
  return undefined;
}

function retryAfterMs(resp: Response): number | undefined {
  const value = resp.headers.get("Retry-After")?.trim();
  if (!value) return undefined;

  const seconds = Number(value);
  const delay = Number.isFinite(seconds)
    ? seconds * 1000
    : Date.parse(value) - Date.now();
  if (!Number.isFinite(delay) || delay < 0) return undefined;
  return Math.min(Math.ceil(delay), MAX_RETRY_AFTER_MS);
}

async function pairingHttpError(
  step: "start" | "finish",
  resp: Response,
): Promise<PairingError> {
  const coreError = await readCoreError(resp);
  const kind =
    (coreError === undefined ? undefined : CORE_ERROR_KINDS[coreError]) ??
    HTTP_ERROR_KINDS[resp.status] ??
    "unknown";
  const detail = coreError === undefined ? "" : `: ${coreError}`;
  return new PairingError(
    kind,
    `Pairing ${step} failed (${resp.status}${detail})`,
    resp.status,
    kind === "rate_limited"
      ? (retryAfterMs(resp) ?? PAIRING_REQUEST_INTERVAL_MS)
      : undefined,
  );
}

// Bracket IPv6 hosts in URLs (mirrors coreApi.ts:getWsUrl).
function formatHost(h: string): string {
  return h.includes(":") && !h.startsWith("[") ? `[${h}]` : h;
}

// Validators for /pair/start and /pair/finish JSON shapes. We can't trust the
// network — fall back to PairingError("malformed") on any unexpected shape.
function parseStartResult(json: unknown): { session: string; pake: string } {
  if (
    typeof json !== "object" ||
    json === null ||
    typeof (json as { session?: unknown }).session !== "string" ||
    typeof (json as { pake?: unknown }).pake !== "string"
  ) {
    throw new PairingError("malformed", "Invalid /pair/start response shape");
  }
  return json as { session: string; pake: string };
}

function parseFinishResult(json: unknown): {
  authToken: string;
  clientId: string;
  confirm: string;
} {
  if (
    typeof json !== "object" ||
    json === null ||
    typeof (json as { authToken?: unknown }).authToken !== "string" ||
    typeof (json as { clientId?: unknown }).clientId !== "string" ||
    typeof (json as { confirm?: unknown }).confirm !== "string"
  ) {
    throw new PairingError("malformed", "Invalid /pair/finish response shape");
  }
  return json as { authToken: string; clientId: string; confirm: string };
}

interface PairingRequestPacer {
  intervalMs: number;
  nextRequestAt: number;
}

async function waitForRequestSlot(pacer: PairingRequestPacer): Promise<void> {
  const waitMs = Math.max(0, pacer.nextRequestAt - Date.now());
  if (waitMs > 0) {
    await new Promise((resolve) => setTimeout(resolve, waitMs));
  }
  pacer.nextRequestAt = Date.now() + pacer.intervalMs;
}

// Pairing endpoints share a one-request-per-second budget. Pace every HTTP
// attempt before sending it, rather than deliberately causing a 429 and then
// recovering. Each attempt gets its own timeout so one slow request cannot
// hang the whole flow indefinitely.
async function fetchWithRetry(
  url: string,
  init: Parameters<typeof fetch>[1],
  pacer: PairingRequestPacer,
  maxAttempts = 4,
  timeoutMs = 10000,
): Promise<Response> {
  for (let attempt = 1; ; attempt++) {
    await waitForRequestSlot(pacer);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(url, { ...init, signal: controller.signal });
    } catch (err) {
      // Only retry on AbortError (per-attempt timeout) so genuine network
      // failures surface immediately.
      const isAbort =
        err instanceof Error &&
        (err.name === "AbortError" || err.name === "TimeoutError");
      if (!isAbort || attempt >= maxAttempts) throw err;
    } finally {
      clearTimeout(timer);
    }
  }
}

// Constant-time byte comparison to prevent timing attacks on HMAC verification.
function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++)
    diff |= (a[i] as number) ^ (b[i] as number);
  return diff === 0;
}

const enc = new TextEncoder();

interface PairingOptions {
  requestIntervalMs?: number;
}

export interface PairingStartRequest {
  pake: string;
  name: string;
}

export interface PairingFinishRequest {
  session: string;
  confirm: string;
}

/**
 * Carries the two pairing exchanges to Core. The PAKE, HKDF and HMAC steps are
 * identical on every carrier; only how the two messages travel differs. Both
 * methods return the parsed JSON response and throw PairingError on failure.
 */
export interface PairingCarrier {
  start(request: PairingStartRequest): Promise<unknown>;
  finish(request: PairingFinishRequest): Promise<unknown>;
}

function createPacer(options: PairingOptions): PairingRequestPacer {
  return {
    intervalMs:
      options.requestIntervalMs === undefined
        ? PAIRING_REQUEST_INTERVAL_MS
        : Math.max(0, options.requestIntervalMs),
    nextRequestAt: 0,
  };
}

function networkError(err: unknown): PairingError {
  return new PairingError(
    "network",
    err instanceof Error ? err.message : "Network error",
  );
}

/** Pairing over Core's HTTP endpoints, /api/pair/start and /api/pair/finish. */
export function createHttpPairingCarrier(
  host: string,
  port: number,
  options: PairingOptions = {},
): PairingCarrier {
  const pacer = createPacer(options);
  const base = `http://${formatHost(host)}:${port}/api/pair`;

  const post = async (
    step: "start" | "finish",
    body: PairingStartRequest | PairingFinishRequest,
  ): Promise<unknown> => {
    let resp: Response;
    try {
      resp = await fetchWithRetry(
        `${base}/${step}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
        pacer,
      );
    } catch (err) {
      throw networkError(err);
    }
    if (!resp.ok) {
      throw await pairingHttpError(step, resp);
    }
    try {
      return await resp.json();
    } catch (err) {
      throw new PairingError(
        "malformed",
        err instanceof Error
          ? `Failed to read /pair/${step} response: ${err.message}`
          : `Failed to read /pair/${step} response`,
      );
    }
  };

  return {
    start: (request) => post("start", request),
    finish: (request) => post("finish", request),
  };
}

/** JSON-RPC error code Core returns when pair.start or pair.finish fails. */
export const PAIRING_FAILED_RPC_CODE = -32005;

/** A JSON-RPC error as received from Core. */
export interface RpcCallError {
  code: number;
  message: string;
  data?: unknown;
}

export function isRpcCallError(value: unknown): value is RpcCallError {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { code?: unknown }).code === "number" &&
    typeof (value as { message?: unknown }).message === "string"
  );
}

/** Sends one plaintext JSON-RPC call; rejects with an RpcCallError on error. */
export type RpcCall = (method: string, params: unknown) => Promise<unknown>;

function rpcPairingError(
  step: "start" | "finish",
  error: RpcCallError,
): PairingError {
  const data =
    typeof error.data === "object" && error.data !== null
      ? (error.data as { status?: unknown; message?: unknown })
      : {};
  const status = typeof data.status === "number" ? data.status : undefined;
  const coreError =
    typeof data.message === "string" ? data.message : error.message;
  const kind =
    CORE_ERROR_KINDS[coreError] ??
    (status === undefined ? undefined : HTTP_ERROR_KINDS[status]) ??
    "unknown";
  return new PairingError(
    kind,
    `Pairing ${step} failed (${status ?? error.code}: ${coreError})`,
    status,
    kind === "rate_limited" ? PAIRING_REQUEST_INTERVAL_MS : undefined,
  );
}

/**
 * Pairing over a Bluetooth LE link, using the plaintext JSON-RPC methods
 * pair.start and pair.finish. Core limits these per connection, so requests
 * are paced the same way as the HTTP carrier.
 */
export function createRpcPairingCarrier(
  call: RpcCall,
  options: PairingOptions = {},
): PairingCarrier {
  const pacer = createPacer(options);

  const send = async (
    step: "start" | "finish",
    params: PairingStartRequest | PairingFinishRequest,
  ): Promise<unknown> => {
    await waitForRequestSlot(pacer);
    try {
      return await call(`pair.${step}`, params);
    } catch (err) {
      if (isRpcCallError(err) && err.code === PAIRING_FAILED_RPC_CODE) {
        throw rpcPairingError(step, err);
      }
      if (err instanceof PairingError) throw err;
      throw networkError(isRpcCallError(err) ? new Error(err.message) : err);
    }
  };

  return {
    start: (request) => send("start", request),
    finish: (request) => send("finish", request),
  };
}

export async function performPairing(
  host: string,
  port: number,
  pin: string,
  clientName = "Zaparoo App",
  options: PairingOptions = {},
): Promise<PairingResult> {
  return performPairingWithCarrier(
    createHttpPairingCarrier(host, port, options),
    pin,
    clientName,
  );
}

export async function performPairingWithCarrier(
  carrier: PairingCarrier,
  pin: string,
  clientName = "Zaparoo App",
): Promise<PairingResult> {
  const client = new PakeClient(pin);
  // msgA must be captured before update() — the HMAC transcript uses the original wire bytes.
  const msgA = client.bytes();

  const startJson = await carrier.start({
    pake: base64Encode(msgA),
    name: clientName,
  });

  let startResult: { session: string; pake: string };
  let msgB: Uint8Array;
  let sessionKey: Uint8Array;
  try {
    startResult = parseStartResult(startJson);
    // msgB must be the exact decoded bytes from the server response.
    msgB = base64Decode(startResult.pake);
    client.update(msgB);
    sessionKey = client.sessionKey();
  } catch (err) {
    if (err instanceof PairingError) throw err;
    throw new PairingError(
      "malformed",
      err instanceof Error
        ? `Failed to process /pair/start response: ${err.message}`
        : "Failed to process /pair/start response",
    );
  }

  // HKDF salt = msgA || msgB (raw wire bytes).
  const hkdfSalt = new Uint8Array(msgA.length + msgB.length);
  hkdfSalt.set(msgA, 0);
  hkdfSalt.set(msgB, msgA.length);
  const prk = extract(sha256, sessionKey, hkdfSalt);
  const confirmKeyA = expand(sha256, prk, enc.encode("zaparoo-confirm-A"), 32);
  const confirmKeyB = expand(sha256, prk, enc.encode("zaparoo-confirm-B"), 32);
  const pairingKey = expand(sha256, prk, enc.encode("zaparoo-pairing-v1"), 32);

  const clientTranscript = buildHmacTranscript(
    "client",
    clientName,
    msgA,
    msgB,
  );
  const clientHmac = hmac(sha256, confirmKeyA, clientTranscript);

  const finishJson = await carrier.finish({
    session: startResult.session,
    confirm: base64Encode(clientHmac),
  });

  let finishResult: { authToken: string; clientId: string; confirm: string };
  let serverHmac: Uint8Array;
  try {
    finishResult = parseFinishResult(finishJson);
    serverHmac = base64Decode(finishResult.confirm);
  } catch (err) {
    if (err instanceof PairingError) throw err;
    throw new PairingError(
      "malformed",
      err instanceof Error
        ? `Failed to process /pair/finish response: ${err.message}`
        : "Failed to process /pair/finish response",
    );
  }

  const serverTranscript = buildHmacTranscript(
    "server",
    clientName,
    msgA,
    msgB,
  );
  const expectedServerHmac = hmac(sha256, confirmKeyB, serverTranscript);

  if (!constantTimeEqual(expectedServerHmac, serverHmac)) {
    throw new PairingError(
      "server_hmac_bad",
      "Server HMAC verification failed — possible MITM attack",
    );
  }

  return {
    authToken: finishResult.authToken,
    clientId: finishResult.clientId,
    pairingKey: new Uint8Array(pairingKey),
  };
}
