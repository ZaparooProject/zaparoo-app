// HTTP PAKE pairing flow — browser port of zaparoo-mcp/src/crypto/pairing.ts.
// Uses fetch, WebCrypto HMAC, and our own base64/constant-time helpers.

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
  | "malformed"
  | "server_hmac_bad"
  | "network"
  | "unknown";

export class PairingError extends Error {
  readonly kind: PairingErrorKind;
  readonly httpStatus?: number;

  constructor(kind: PairingErrorKind, message: string, httpStatus?: number) {
    super(message);
    this.name = "PairingError";
    this.kind = kind;
    this.httpStatus = httpStatus;
  }
}

const HTTP_ERROR_KINDS: Record<number, PairingErrorKind> = {
  400: "malformed",
  401: "wrong_pin",
  403: "limit_reached",
  404: "session_unknown",
  410: "pin_expired",
  429: "rate_limited",
};

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

// The server limits /api/pair/* at 1 req/sec per IP. /pair/start consumes the
// token, so /pair/finish may immediately 429 — retry with a 1100ms gap.
// Each attempt has its own AbortController so one slow attempt can't hang the
// whole flow indefinitely.
async function fetchWithRetry(
  url: string,
  init: Parameters<typeof fetch>[1],
  maxAttempts = 4,
  timeoutMs = 10000,
): Promise<Response> {
  for (let attempt = 1; ; attempt++) {
    if (attempt > 1) await new Promise((r) => setTimeout(r, 1100));
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const resp = await fetch(url, { ...init, signal: controller.signal });
      if (resp.status !== 429 || attempt >= maxAttempts) return resp;
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

export async function performPairing(
  host: string,
  port: number,
  pin: string,
  clientName = "Zaparoo App",
): Promise<PairingResult> {
  const client = new PakeClient(pin);
  // msgA must be captured before update() — the HMAC transcript uses the original wire bytes.
  const msgA = client.bytes();

  const startUrl = `http://${formatHost(host)}:${port}/api/pair/start`;
  let startResp: Response;
  try {
    startResp = await fetchWithRetry(startUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pake: base64Encode(msgA), name: clientName }),
    });
  } catch (err) {
    throw new PairingError(
      "network",
      err instanceof Error ? err.message : "Network error",
    );
  }

  if (!startResp.ok) {
    const kind = HTTP_ERROR_KINDS[startResp.status] ?? "unknown";
    throw new PairingError(
      kind,
      `Pairing start failed (${startResp.status})`,
      startResp.status,
    );
  }

  const startResult = parseStartResult(await startResp.json());
  // msgB must be the exact decoded bytes from the server response.
  const msgB = base64Decode(startResult.pake);

  client.update(msgB);
  const sessionKey = client.sessionKey();

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

  const finishUrl = `http://${formatHost(host)}:${port}/api/pair/finish`;
  let finishResp: Response;
  try {
    finishResp = await fetchWithRetry(finishUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        session: startResult.session,
        confirm: base64Encode(clientHmac),
      }),
    });
  } catch (err) {
    throw new PairingError(
      "network",
      err instanceof Error ? err.message : "Network error",
    );
  }

  if (!finishResp.ok) {
    const kind = HTTP_ERROR_KINDS[finishResp.status] ?? "unknown";
    throw new PairingError(
      kind,
      `Pairing finish failed (${finishResp.status})`,
      finishResp.status,
    );
  }

  const finishResult = parseFinishResult(await finishResp.json());

  const serverTranscript = buildHmacTranscript(
    "server",
    clientName,
    msgA,
    msgB,
  );
  const expectedServerHmac = hmac(sha256, confirmKeyB, serverTranscript);
  const serverHmac = base64Decode(finishResult.confirm);

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
