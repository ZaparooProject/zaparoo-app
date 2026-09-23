// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { http, HttpResponse } from "msw";
import { expand, extract } from "@noble/hashes/hkdf.js";
import { hmac } from "@noble/hashes/hmac.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { server } from "@/test-setup";
import {
  PAIRING_CLIENT_NAME_MAX_BYTES,
  PAIRING_REQUEST_INTERVAL_MS,
  performPairing as performPairingRequest,
  truncateClientName,
} from "@/lib/crypto/pairing";
import { base64Encode } from "@/lib/crypto/base64";
import { buildHmacTranscript } from "@/lib/crypto/hmacTranscript";

const HOST = "127.0.0.1";
const PORT = 7497;
const PIN = "123456";
const CLIENT_NAME = "Test Client";
const START_URL = `http://${HOST}:${PORT}/api/pair/start`;
const FINISH_URL = `http://${HOST}:${PORT}/api/pair/finish`;

// Fixed PAKE outputs injected via the mock below.
const MOCK_MSG_A = new Uint8Array([0x01, 0x02, 0x03, 0x04]);
const MOCK_MSG_B = new Uint8Array([0x05, 0x06, 0x07, 0x08]);
const MOCK_SESSION_KEY = new Uint8Array(32).fill(0x42);
const SESSION_ID = "session-abc";
const AUTH_TOKEN = "11111111-2222-3333-4444-555555555555";
const CLIENT_ID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";

// Mock PakeClient to return fixed bytes so we can compute expected HMACs.
// Values are duplicated inside the factory because vi.mock is hoisted above const declarations.
vi.mock("@/lib/crypto/pake", () => ({
  PakeClient: class MockPakeClient {
    bytes() {
      return new Uint8Array([0x01, 0x02, 0x03, 0x04]);
    }
    update(_serverBytes: Uint8Array) {}
    sessionKey() {
      return new Uint8Array(32).fill(0x42);
    }
  },
}));

function computeServerConfirm(
  msgA: Uint8Array,
  msgB: Uint8Array,
  sessionKey: Uint8Array,
  clientName: string,
): Uint8Array {
  const hkdfSalt = new Uint8Array(msgA.length + msgB.length);
  hkdfSalt.set(msgA, 0);
  hkdfSalt.set(msgB, msgA.length);
  const prk = extract(sha256, sessionKey, hkdfSalt);
  const confirmKeyB = expand(
    sha256,
    prk,
    new TextEncoder().encode("zaparoo-confirm-B"),
    32,
  );
  const transcript = buildHmacTranscript("server", clientName, msgA, msgB);
  return hmac(sha256, confirmKeyB, transcript);
}

function performPairing(
  host: string,
  port: number,
  pin: string,
  clientName: string,
) {
  return performPairingRequest(host, port, pin, clientName, {
    requestIntervalMs: 0,
  });
}

function successHandlers() {
  return [
    http.post(START_URL, () =>
      HttpResponse.json({
        session: SESSION_ID,
        pake: base64Encode(MOCK_MSG_B),
      }),
    ),
    http.post(FINISH_URL, () => {
      const serverConfirm = computeServerConfirm(
        MOCK_MSG_A,
        MOCK_MSG_B,
        MOCK_SESSION_KEY,
        CLIENT_NAME,
      );
      return HttpResponse.json({
        authToken: AUTH_TOKEN,
        clientId: CLIENT_ID,
        confirm: base64Encode(serverConfirm),
      });
    }),
  ];
}

describe("performPairing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("success path", () => {
    it("should return authToken, clientId, and pairingKey", async () => {
      server.use(...successHandlers());

      const result = await performPairing(HOST, PORT, PIN, CLIENT_NAME);

      expect(result.authToken).toBe(AUTH_TOKEN);
      expect(result.clientId).toBe(CLIENT_ID);
      expect(result.pairingKey).toBeInstanceOf(Uint8Array);
      expect(result.pairingKey.length).toBe(32);
    });
  });

  describe("network errors", () => {
    it("should throw PairingError('network') when /pair/start fetch fails", async () => {
      server.use(http.post(START_URL, () => HttpResponse.error()));

      await expect(
        performPairing(HOST, PORT, PIN, CLIENT_NAME),
      ).rejects.toMatchObject({
        kind: "network",
      });
    });

    it("should throw PairingError('network') when /pair/finish fetch fails", async () => {
      server.use(
        http.post(START_URL, () =>
          HttpResponse.json({
            session: SESSION_ID,
            pake: base64Encode(MOCK_MSG_B),
          }),
        ),
        http.post(FINISH_URL, () => HttpResponse.error()),
      );

      await expect(
        performPairing(HOST, PORT, PIN, CLIENT_NAME),
      ).rejects.toMatchObject({
        kind: "network",
      });
    });
  });

  describe("HTTP error codes on /pair/start", () => {
    it.each([
      [400, "malformed"],
      [401, "wrong_pin"],
      [403, "limit_reached"],
      [404, "session_unknown"],
      [410, "pin_expired"],
    ] as [number, string][])(
      "should throw PairingError('%s') for HTTP %d",
      async (status, kind) => {
        server.use(
          http.post(START_URL, () => new HttpResponse(null, { status })),
        );

        await expect(
          performPairing(HOST, PORT, PIN, CLIENT_NAME),
        ).rejects.toMatchObject({
          kind,
          httpStatus: status,
        });
      },
    );
  });

  describe("HTTP error codes on /pair/finish", () => {
    it.each([
      [400, "malformed"],
      [401, "wrong_pin"],
      [403, "limit_reached"],
      [404, "session_unknown"],
      [410, "pin_expired"],
    ] as [number, string][])(
      "should throw PairingError('%s') for HTTP %d on finish",
      async (status, kind) => {
        server.use(
          http.post(START_URL, () =>
            HttpResponse.json({
              session: SESSION_ID,
              pake: base64Encode(MOCK_MSG_B),
            }),
          ),
          http.post(FINISH_URL, () => new HttpResponse(null, { status })),
        );

        await expect(
          performPairing(HOST, PORT, PIN, CLIENT_NAME),
        ).rejects.toMatchObject({
          kind,
          httpStatus: status,
        });
      },
    );
  });

  describe("Core error messages", () => {
    // Core pairs each status with a JSON `error` message; the message is what
    // tells the user whether retrying the same PIN can work.
    it.each([
      ["start", 400, "no pairing in progress", "no_pairing"],
      ["start", 410, "pairing expired", "pin_expired"],
      ["start", 403, "too many failed attempts", "limit_reached"],
      ["start", 400, "client name too long", "malformed"],
      ["finish", 403, "maximum paired clients reached", "too_many_clients"],
      ["finish", 403, "too many failed attempts", "limit_reached"],
      ["finish", 404, "unknown pairing session", "session_unknown"],
      ["finish", 401, "wrong PIN", "wrong_pin"],
      ["finish", 500, "internal error", "unknown"],
    ] as const)(
      "should map %s %d %j to PairingError('%s')",
      async (step, status, message, kind) => {
        const errorResponse = () =>
          HttpResponse.json({ error: message }, { status });
        server.use(
          step === "start"
            ? http.post(START_URL, errorResponse)
            : http.post(START_URL, () =>
                HttpResponse.json({
                  session: SESSION_ID,
                  pake: base64Encode(MOCK_MSG_B),
                }),
              ),
          http.post(FINISH_URL, errorResponse),
        );

        await expect(
          performPairing(HOST, PORT, PIN, CLIENT_NAME),
        ).rejects.toMatchObject({
          kind,
          httpStatus: status,
        });
      },
    );
  });

  describe("malformed response shape", () => {
    it("should throw PairingError('malformed') when /pair/start session is not a string", async () => {
      server.use(
        http.post(START_URL, () =>
          HttpResponse.json({
            session: 123,
            pake: base64Encode(MOCK_MSG_B),
          }),
        ),
      );

      await expect(
        performPairing(HOST, PORT, PIN, CLIENT_NAME),
      ).rejects.toMatchObject({
        kind: "malformed",
      });
    });

    it("should throw PairingError('malformed') when /pair/finish confirm is missing", async () => {
      server.use(
        http.post(START_URL, () =>
          HttpResponse.json({
            session: SESSION_ID,
            pake: base64Encode(MOCK_MSG_B),
          }),
        ),
        http.post(FINISH_URL, () =>
          HttpResponse.json({
            authToken: AUTH_TOKEN,
            clientId: CLIENT_ID,
            // confirm intentionally omitted
          }),
        ),
      );

      await expect(
        performPairing(HOST, PORT, PIN, CLIENT_NAME),
      ).rejects.toMatchObject({
        kind: "malformed",
      });
    });
  });

  describe("fetch timeout", () => {
    it("should abort and surface as PairingError('network') after retries when /pair/start hangs", async () => {
      vi.useFakeTimers();
      try {
        server.use(
          http.post(
            START_URL,
            () => new Promise<Response>(() => {}), // never resolves
          ),
        );

        const promise = performPairing(HOST, PORT, PIN, CLIENT_NAME);
        const settled = promise.catch((e) => e);
        await vi.runAllTimersAsync();
        const error = await settled;
        expect(error).toMatchObject({ kind: "network" });
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe("server HMAC mismatch", () => {
    it("should throw PairingError('server_hmac_bad') when server HMAC is wrong", async () => {
      server.use(
        http.post(START_URL, () =>
          HttpResponse.json({
            session: SESSION_ID,
            pake: base64Encode(MOCK_MSG_B),
          }),
        ),
        http.post(FINISH_URL, () =>
          HttpResponse.json({
            authToken: AUTH_TOKEN,
            clientId: CLIENT_ID,
            confirm: base64Encode(new Uint8Array(32).fill(0xff)), // bad HMAC
          }),
        ),
      );

      await expect(
        performPairing(HOST, PORT, PIN, CLIENT_NAME),
      ).rejects.toMatchObject({
        kind: "server_hmac_bad",
      });
    });
  });

  describe("rate limiting", () => {
    it("should pace start and finish requests before sending them", async () => {
      vi.useFakeTimers();
      try {
        const requestTimes: number[] = [];
        server.use(
          http.post(START_URL, () => {
            requestTimes.push(Date.now());
            return HttpResponse.json({
              session: SESSION_ID,
              pake: base64Encode(MOCK_MSG_B),
            });
          }),
          http.post(FINISH_URL, () => {
            requestTimes.push(Date.now());
            return HttpResponse.json({
              authToken: AUTH_TOKEN,
              clientId: CLIENT_ID,
              confirm: base64Encode(
                computeServerConfirm(
                  MOCK_MSG_A,
                  MOCK_MSG_B,
                  MOCK_SESSION_KEY,
                  CLIENT_NAME,
                ),
              ),
            });
          }),
        );

        const promise = performPairingRequest(HOST, PORT, PIN, CLIENT_NAME);
        await vi.runAllTimersAsync();
        await promise;

        expect(requestTimes).toHaveLength(2);
        expect(requestTimes[1]! - requestTimes[0]!).toBeGreaterThanOrEqual(
          PAIRING_REQUEST_INTERVAL_MS,
        );
      } finally {
        vi.useRealTimers();
      }
    });

    it.each([
      [
        "Core response without a header",
        undefined,
        PAIRING_REQUEST_INTERVAL_MS,
      ],
      ["Retry-After header", "3", 3000],
    ])(
      "should stop after one 429 and expose retry timing from %s",
      async (_scenario, retryAfter, expectedDelay) => {
        let callCount = 0;
        server.use(
          http.post(START_URL, () => {
            callCount++;
            return new HttpResponse(null, {
              status: 429,
              headers:
                retryAfter === undefined
                  ? undefined
                  : { "Retry-After": retryAfter },
            });
          }),
        );

        const error = await performPairing(HOST, PORT, PIN, CLIENT_NAME).catch(
          (caught: unknown) => caught,
        );

        expect(error).toMatchObject({
          kind: "rate_limited",
          httpStatus: 429,
          retryAfterMs: expectedDelay,
        });
        expect(callCount).toBe(1);
      },
    );
  });
});

describe("truncateClientName", () => {
  const byteLength = (value: string) => new TextEncoder().encode(value).length;

  it("should keep names within Core's byte limit unchanged", () => {
    const name = "a".repeat(PAIRING_CLIENT_NAME_MAX_BYTES);

    expect(truncateClientName(name)).toBe(name);
  });

  it("should cap multi-byte names by UTF-8 bytes", () => {
    const truncated = truncateClientName("é".repeat(100));

    expect(truncated).toBe("é".repeat(64));
    expect(byteLength(truncated)).toBe(PAIRING_CLIENT_NAME_MAX_BYTES);
  });

  it("should drop a code point that would cross the limit instead of splitting it", () => {
    const prefix = "a".repeat(PAIRING_CLIENT_NAME_MAX_BYTES - 2);

    expect(truncateClientName(`${prefix}😀b`)).toBe(prefix);
  });
});
