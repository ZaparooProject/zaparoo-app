// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { http, HttpResponse } from "msw";
import { expand, extract } from "@noble/hashes/hkdf.js";
import { hmac } from "@noble/hashes/hmac.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { server } from "@/test-setup";
import { performPairing } from "@/lib/crypto/pairing";
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
    it("should retry up to 3 times on 429 then throw PairingError('rate_limited')", async () => {
      vi.useFakeTimers();
      try {
        let callCount = 0;
        server.use(
          http.post(START_URL, () => {
            callCount++;
            return new HttpResponse(null, { status: 429 });
          }),
        );

        const promise = performPairing(HOST, PORT, PIN, CLIENT_NAME);
        // Attach a no-op catch immediately so the rejection isn't observed as
        // unhandled while we drive the fake-timer backoff loop below.
        const settled = promise.catch((e) => e);
        // Drain all backoff timers + interleaved microtasks instantly.
        await vi.runAllTimersAsync();
        const error = await settled;
        expect(error).toMatchObject({
          kind: "rate_limited",
          httpStatus: 429,
        });
        // fetchWithRetry: 4 total attempts (initial + 3 retries on 429).
        expect(callCount).toBe(4);
      } finally {
        vi.useRealTimers();
      }
    });
  });
});
