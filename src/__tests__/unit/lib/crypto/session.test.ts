// @vitest-environment node
// Node environment required for createDecipheriv/createCipheriv server oracle.
// Production code uses WebCrypto; this test proves wire compatibility with the Go server.

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { base64Decode, base64Encode } from "@/lib/crypto/base64";
import {
  buildNonce,
  deriveSessionKeyBytes,
  EncryptedSession,
} from "@/lib/crypto/session";

describe("deriveSessionKeyBytes", () => {
  const pairingKey = randomBytes(32);
  const sessionSalt = randomBytes(16);

  it("derives four distinct keys", () => {
    const keys = deriveSessionKeyBytes(pairingKey, sessionSalt);
    expect(keys.c2sKey).toHaveLength(32);
    expect(keys.s2cKey).toHaveLength(32);
    expect(keys.c2sBase).toHaveLength(12);
    expect(keys.s2cBase).toHaveLength(12);
    expect(Buffer.from(keys.c2sKey).toString("hex")).not.toBe(
      Buffer.from(keys.s2cKey).toString("hex"),
    );
  });

  it("is deterministic for the same inputs", () => {
    const k1 = deriveSessionKeyBytes(pairingKey, sessionSalt);
    const k2 = deriveSessionKeyBytes(pairingKey, sessionSalt);
    expect(Buffer.from(k1.c2sKey)).toEqual(Buffer.from(k2.c2sKey));
  });

  it("differs for different salts", () => {
    const k1 = deriveSessionKeyBytes(pairingKey, sessionSalt);
    const k2 = deriveSessionKeyBytes(pairingKey, randomBytes(16));
    expect(Buffer.from(k1.c2sKey).toString("hex")).not.toBe(
      Buffer.from(k2.c2sKey).toString("hex"),
    );
  });
});

describe("buildNonce", () => {
  it("returns base unchanged for counter 0", () => {
    const base = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(buildNonce(base, 0n)).toEqual(base);
  });

  it("XORs counter into last 8 bytes only", () => {
    const base = new Uint8Array(12).fill(0);
    const nonce = buildNonce(base, 1n);
    expect(nonce[0]).toBe(0);
    expect(nonce[3]).toBe(0);
    expect(nonce[11]).toBe(1);
    expect(nonce[10]).toBe(0);
  });

  it("handles 2^32 counter", () => {
    const base = new Uint8Array(12).fill(0);
    const nonce = buildNonce(base, 0x100000000n);
    expect(nonce[7]).toBe(1);
    expect(nonce[11]).toBe(0);
  });

  it("does not mutate the original base", () => {
    const base = new Uint8Array(12).fill(0xff);
    const original = new Uint8Array(base);
    buildNonce(base, 42n);
    expect(base).toEqual(original);
  });
});

describe("EncryptedSession", () => {
  const pairingKey = randomBytes(32);
  const authToken = "550e8400-e29b-41d4-a716-446655440000";

  it("first frame includes v/t/s fields", async () => {
    const session = await EncryptedSession.create(authToken, pairingKey);
    const frame = await session.encryptAndFrame(
      '{"jsonrpc":"2.0","method":"version","id":1}',
    );
    const parsed = JSON.parse(frame);
    expect(parsed.v).toBe(1);
    expect(parsed.t).toBe(authToken);
    expect(typeof parsed.e).toBe("string");
    expect(base64Decode(parsed.s)).toHaveLength(16);
  });

  it("subsequent frames omit v/t/s", async () => {
    const session = await EncryptedSession.create(authToken, pairingKey);
    await session.encryptAndFrame("first");
    const frame = await session.encryptAndFrame("second");
    const parsed = JSON.parse(frame);
    expect(parsed.v).toBeUndefined();
    expect(parsed.t).toBeUndefined();
    expect(parsed.s).toBeUndefined();
    expect(typeof parsed.e).toBe("string");
  });

  it("client→server round-trip: WebCrypto encrypt, Node createDecipheriv decrypt", async () => {
    const session = await EncryptedSession.create(authToken, pairingKey);
    const plaintext = '{"jsonrpc":"2.0","method":"version","id":1}';
    const encrypted = await session.encrypt(plaintext);

    // Server oracle: derive same keys and decrypt with Node crypto
    const raw = deriveSessionKeyBytes(pairingKey, session.sessionSalt);
    const nonce = buildNonce(raw.c2sBase, 0n);
    const aad = Buffer.from(`${authToken}:ws`);

    const data = Buffer.from(base64Decode(encrypted));
    const ct = data.subarray(0, data.length - 16);
    const tag = data.subarray(data.length - 16);
    const decipher = createDecipheriv("aes-256-gcm", raw.c2sKey, nonce, {
      authTagLength: 16,
    });
    decipher.setAAD(aad);
    decipher.setAuthTag(tag);
    const decrypted = Buffer.concat([
      decipher.update(ct),
      decipher.final(),
    ]).toString("utf8");

    expect(decrypted).toBe(plaintext);
  });

  it("server→client round-trip: Node createCipheriv encrypt, WebCrypto decrypt", async () => {
    const session = await EncryptedSession.create(authToken, pairingKey);
    const plaintext = '{"jsonrpc":"2.0","result":{"version":"2.0.0"}}';
    const raw = deriveSessionKeyBytes(pairingKey, session.sessionSalt);

    // Server oracle: encrypt with Node crypto (s2c direction, counter 0)
    const nonce = buildNonce(raw.s2cBase, 0n);
    const aad = Buffer.from(`${authToken}:ws`);
    const cipher = createCipheriv("aes-256-gcm", raw.s2cKey, nonce, {
      authTagLength: 16,
    });
    cipher.setAAD(aad);
    const ct = cipher.update(Buffer.from(plaintext, "utf8"));
    cipher.final();
    const tag = cipher.getAuthTag();
    const frame = base64Encode(new Uint8Array([...ct, ...tag]));

    const decrypted = await session.decrypt(frame);
    expect(decrypted).toBe(plaintext);
  });

  it("counter-based nonces produce different ciphertexts for same plaintext", async () => {
    const session = await EncryptedSession.create(authToken, pairingKey);
    const ct1 = await session.encrypt("hello");
    const ct2 = await session.encrypt("hello");
    expect(ct1).not.toBe(ct2);
  });

  it("throws on too-short ciphertext", async () => {
    const session = await EncryptedSession.create(authToken, pairingKey);
    const short = base64Encode(new Uint8Array(15));
    await expect(session.decrypt(short)).rejects.toThrow(
      "Ciphertext too short",
    );
  });

  it("throws on tampered ciphertext", async () => {
    const session = await EncryptedSession.create(authToken, pairingKey);
    const fake = base64Encode(new Uint8Array(randomBytes(48)));
    await expect(session.decrypt(fake)).rejects.toThrow();
  });

  it("throws when ciphertext was encrypted with a different pairingKey", async () => {
    const session = await EncryptedSession.create(authToken, pairingKey);
    const wrongKey = randomBytes(32);
    const raw = deriveSessionKeyBytes(wrongKey, session.sessionSalt);
    const nonce = buildNonce(raw.s2cBase, 0n);
    const aad = Buffer.from(`${authToken}:ws`);
    const cipher = createCipheriv("aes-256-gcm", raw.s2cKey, nonce, {
      authTagLength: 16,
    });
    cipher.setAAD(aad);
    const ct = cipher.update(Buffer.from("secret", "utf8"));
    cipher.final();
    const frame = base64Encode(new Uint8Array([...ct, ...cipher.getAuthTag()]));

    await expect(session.decrypt(frame)).rejects.toThrow();
  });

  it("throws when AAD (authToken) differs from session authToken", async () => {
    const session = await EncryptedSession.create(authToken, pairingKey);
    const raw = deriveSessionKeyBytes(pairingKey, session.sessionSalt);
    const nonce = buildNonce(raw.s2cBase, 0n);
    const wrongAad = Buffer.from("wrong-token:ws");
    const cipher = createCipheriv("aes-256-gcm", raw.s2cKey, nonce, {
      authTagLength: 16,
    });
    cipher.setAAD(wrongAad);
    const ct = cipher.update(Buffer.from("secret", "utf8"));
    cipher.final();
    const frame = base64Encode(new Uint8Array([...ct, ...cipher.getAuthTag()]));

    await expect(session.decrypt(frame)).rejects.toThrow();
  });

  it("generates unique session salts per instance", async () => {
    const s1 = await EncryptedSession.create(authToken, pairingKey);
    const s2 = await EncryptedSession.create(authToken, pairingKey);
    expect(base64Encode(s1.sessionSalt)).not.toBe(base64Encode(s2.sessionSalt));
  });
});
