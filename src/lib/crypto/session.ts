// Per-connection encrypted session using WebCrypto AES-256-GCM.
// Port of zaparoo-mcp/src/crypto/session.ts with Node crypto replaced by SubtleCrypto.
// WebSocket carries the JSON envelope; Bluetooth LE carries the binary envelope.

import { hkdf } from "@noble/hashes/hkdf.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { base64Decode, base64Encode } from "./base64";

const PROTOCOL_VERSION = 1;
const SALT_LENGTH = 16;
const GCM_TAG_LENGTH = 16;
const MAX_TOKEN_LENGTH = 255;

// The transport label bound into the AAD. A frame encrypted for one transport
// fails authentication on the other.
export type SessionTransport = "ws" | "ble";

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
  readonly transport: SessionTransport;
  private aad: Uint8Array;

  private constructor(
    authToken: string,
    sessionSalt: Uint8Array,
    keys: SessionKeys,
    transport: SessionTransport,
  ) {
    this.authToken = authToken;
    this.sessionSalt = sessionSalt;
    this.keys = keys;
    this.transport = transport;
    this.aad = enc.encode(`${authToken}:${transport}`);
  }

  static async create(
    authToken: string,
    pairingKey: Uint8Array,
    transport: SessionTransport = "ws",
  ): Promise<EncryptedSession> {
    const sessionSalt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
    const raw = deriveSessionKeyBytes(pairingKey, sessionSalt);
    const keys = await importSessionKeys(raw);
    return new EncryptedSession(authToken, sessionSalt, keys, transport);
  }

  // Encrypt plaintext and return base64(ciphertext || 16-byte tag).
  // WebCrypto encrypt output is [ciphertext || tag] in one ArrayBuffer,
  // byte-identical to Node createCipheriv layout.
  async encrypt(plaintext: string): Promise<string> {
    return base64Encode(await this.encryptBytes(plaintext));
  }

  // Encrypt plaintext and return the raw ciphertext || 16-byte tag.
  async encryptBytes(plaintext: string): Promise<Uint8Array> {
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
    return new Uint8Array(ct);
  }

  // Decrypt base64(ciphertext || 16-byte tag) and return plaintext.
  async decrypt(ciphertext: string): Promise<string> {
    return this.decryptBytes(base64Decode(ciphertext));
  }

  // Decrypt raw ciphertext || 16-byte tag and return plaintext.
  async decryptBytes(data: Uint8Array): Promise<string> {
    const nonce = buildNonce(this.keys.s2cBase, this.recvCounter);
    this.recvCounter++;

    if (data.length < GCM_TAG_LENGTH) throw new Error("Ciphertext too short");

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

  // Binary envelope. The first frame is
  // [version][16-byte salt][token length][token][ciphertext]; every later
  // frame is the ciphertext alone.
  async encryptAndFrameBinary(plaintext: string): Promise<Uint8Array> {
    const ciphertext = await this.encryptBytes(plaintext);
    if (this.firstFrameSent) {
      return ciphertext;
    }
    const token = enc.encode(this.authToken);
    if (token.length < 1 || token.length > MAX_TOKEN_LENGTH) {
      throw new Error("Auth token length out of range for binary envelope");
    }
    this.firstFrameSent = true;
    const frame = new Uint8Array(
      1 + SALT_LENGTH + 1 + token.length + ciphertext.length,
    );
    frame[0] = PROTOCOL_VERSION;
    frame.set(this.sessionSalt, 1);
    frame[1 + SALT_LENGTH] = token.length;
    frame.set(token, 2 + SALT_LENGTH);
    frame.set(ciphertext, 2 + SALT_LENGTH + token.length);
    return frame;
  }
}
