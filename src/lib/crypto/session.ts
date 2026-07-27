// Per-WebSocket encrypted session using WebCrypto AES-256-GCM.
// Port of zaparoo-mcp/src/crypto/session.ts with Node crypto replaced by SubtleCrypto.

import { hkdf } from "@noble/hashes/hkdf.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { base64Decode, base64Encode } from "./base64";

const PROTOCOL_VERSION = 1;

// Raw key bytes — returned from deriveSessionKeyBytes for test interop.
export interface SessionKeyBytes {
  c2sKey: Uint8Array;
  s2cKey: Uint8Array;
  c2sBase: Uint8Array;
  s2cBase: Uint8Array;
}

// Imported CryptoKey objects — used by EncryptedSession internally.
interface SessionKeys {
  c2sKey: CryptoKey;
  s2cKey: CryptoKey;
  c2sBase: Uint8Array;
  s2cBase: Uint8Array;
}

const enc = new TextEncoder();

// Export raw bytes for test oracles (e.g., Node createDecipheriv comparison).
export function deriveSessionKeyBytes(
  pairingKey: Uint8Array,
  sessionSalt: Uint8Array,
): SessionKeyBytes {
  const derive = (info: string, len: number) =>
    hkdf(sha256, pairingKey, sessionSalt, enc.encode(info), len);
  return {
    c2sKey: derive("zaparoo-c2s-v1", 32),
    s2cKey: derive("zaparoo-s2c-v1", 32),
    c2sBase: derive("zaparoo-c2s-nonce-v1", 12),
    s2cBase: derive("zaparoo-s2c-nonce-v1", 12),
  };
}

async function importSessionKeys(raw: SessionKeyBytes): Promise<SessionKeys> {
  const [c2sKey, s2cKey] = await Promise.all([
    crypto.subtle.importKey(
      "raw",
      raw.c2sKey as unknown as Uint8Array<ArrayBuffer>,
      "AES-GCM",
      false,
      ["encrypt"],
    ),
    crypto.subtle.importKey(
      "raw",
      raw.s2cKey as unknown as Uint8Array<ArrayBuffer>,
      "AES-GCM",
      false,
      ["decrypt"],
    ),
  ]);
  return { c2sKey, s2cKey, c2sBase: raw.c2sBase, s2cBase: raw.s2cBase };
}

// Nonce = base[0..4] unchanged || base[4..12] XOR big-endian uint64(counter).
export function buildNonce(base: Uint8Array, counter: bigint): Uint8Array {
  const nonce = new Uint8Array(12);
  nonce.set(base);
  const view = new DataView(nonce.buffer, nonce.byteOffset, nonce.byteLength);
  const hi = Number((counter >> 32n) & 0xffffffffn);
  const lo = Number(counter & 0xffffffffn);
  view.setUint32(4, view.getUint32(4, false) ^ hi, false);
  view.setUint32(8, view.getUint32(8, false) ^ lo, false);
  return nonce;
}

export class EncryptedSession {
  private keys: SessionKeys;
  private sendCounter = 0n;
  private recvCounter = 0n;
  private firstFrameSent = false;
  readonly authToken: string;
  readonly sessionSalt: Uint8Array;
  private aad: Uint8Array;

  private constructor(
    authToken: string,
    sessionSalt: Uint8Array,
    keys: SessionKeys,
  ) {
    this.authToken = authToken;
    this.sessionSalt = sessionSalt;
    this.keys = keys;
    this.aad = enc.encode(`${authToken}:ws`);
  }

  static async create(
    authToken: string,
    pairingKey: Uint8Array,
  ): Promise<EncryptedSession> {
    const sessionSalt = crypto.getRandomValues(new Uint8Array(16));
    const raw = deriveSessionKeyBytes(pairingKey, sessionSalt);
    const keys = await importSessionKeys(raw);
    return new EncryptedSession(authToken, sessionSalt, keys);
  }

  // Encrypt plaintext and return base64(ciphertext || 16-byte tag).
  // WebCrypto encrypt output is [ciphertext || tag] in one ArrayBuffer,
  // byte-identical to Node createCipheriv layout.
  async encrypt(plaintext: string): Promise<string> {
    const nonce = buildNonce(this.keys.c2sBase, this.sendCounter);
    this.sendCounter++;

    const ct = await crypto.subtle.encrypt(
      {
        name: "AES-GCM",
        iv: nonce as unknown as Uint8Array<ArrayBuffer>,
        additionalData: this.aad as unknown as Uint8Array<ArrayBuffer>,
        tagLength: 128,
      },
      this.keys.c2sKey,
      enc.encode(plaintext),
    );
    return base64Encode(new Uint8Array(ct));
  }

  // Decrypt base64(ciphertext || 16-byte tag) and return plaintext.
  async decrypt(ciphertext: string): Promise<string> {
    const nonce = buildNonce(this.keys.s2cBase, this.recvCounter);
    this.recvCounter++;

    const data = base64Decode(ciphertext);
    if (data.length < 16) throw new Error("Ciphertext too short");

    const pt = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: nonce as unknown as Uint8Array<ArrayBuffer>,
        additionalData: this.aad as unknown as Uint8Array<ArrayBuffer>,
        tagLength: 128,
      },
      this.keys.s2cKey,
      data as unknown as Uint8Array<ArrayBuffer>,
    );
    return new TextDecoder().decode(pt);
  }

  async encryptAndFrame(plaintext: string): Promise<string> {
    const encrypted = await this.encrypt(plaintext);
    if (!this.firstFrameSent) {
      this.firstFrameSent = true;
      return JSON.stringify({
        v: PROTOCOL_VERSION,
        e: encrypted,
        t: this.authToken,
        s: base64Encode(this.sessionSalt),
      });
    }
    return JSON.stringify({ e: encrypted });
  }
}
