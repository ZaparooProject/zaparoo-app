/**
 * Chunk framing for Zaparoo Core's Bluetooth LE API, a port of Core's
 * `pkg/bluetooth/apigatt/frame.go`. A message is split into chunks that each
 * fit one attribute write or notification; every chunk carries a sequence
 * number so the receiver can put chunks back in order.
 *
 *   byte 0    flags: bits 7..4 version, bit 2 ACK, bit 1 LAST, bit 0 FIRST
 *   byte 1-2  seq, big-endian, counts every data chunk and wraps at 65536
 *   byte 3-4  tag, big-endian, random per connection
 *   byte 5-8  total message length, big-endian, FIRST chunk only
 */

import {
  BLE_ATT_HEADER_SIZE,
  BLE_DEFAULT_MTU,
  BLE_MAX_CHUNK_SIZE,
  BLE_MAX_HELD_BYTES,
  BLE_MAX_PROTOCOL_ERRORS,
  BLE_PROTOCOL_VERSION,
  BLE_REORDER_WINDOW,
} from "./constants";

export const HEADER_SIZE = 5;
export const FIRST_HEADER_SIZE = 9;

const FLAG_FIRST = 0x01;
const FLAG_LAST = 0x02;
const FLAG_ACK = 0x04;
const FLAG_RESERVED = 0x08;
const VERSION_SHIFT = 4;
const MAX_UINT32 = 0xffffffff;

export type FrameErrorKind =
  | "malformed"
  | "too_large"
  | "length_mismatch"
  | "sequence"
  | "too_many_errors"
  | "empty";

export class FrameError extends Error {
  constructor(
    readonly kind: FrameErrorKind,
    message: string,
  ) {
    super(message);
    this.name = "FrameError";
  }
}

export interface ChunkHeader {
  version: number;
  first: boolean;
  last: boolean;
  ack: boolean;
  seq: number;
  tag: number;
  /** Total message length, set only on a FIRST chunk. */
  length: number;
}

export interface ParsedChunk {
  header: ChunkHeader;
  payload: Uint8Array;
}

function readUint16(bytes: Uint8Array, offset: number): number {
  return ((bytes[offset]! << 8) | bytes[offset + 1]!) >>> 0;
}

function readUint32(bytes: Uint8Array, offset: number): number {
  return (
    ((bytes[offset]! << 24) >>> 0) +
    ((bytes[offset + 1]! << 16) |
      (bytes[offset + 2]! << 8) |
      bytes[offset + 3]!)
  );
}

/** Splits one chunk into its header and payload, rejecting malformed ones. */
export function parseChunk(chunk: Uint8Array): ParsedChunk {
  if (chunk.length < HEADER_SIZE) {
    throw new FrameError("malformed", `chunk is ${chunk.length} bytes`);
  }
  const flags = chunk[0]!;
  const header: ChunkHeader = {
    version: flags >> VERSION_SHIFT,
    first: (flags & FLAG_FIRST) !== 0,
    last: (flags & FLAG_LAST) !== 0,
    ack: (flags & FLAG_ACK) !== 0,
    seq: readUint16(chunk, 1),
    tag: readUint16(chunk, 3),
    length: 0,
  };
  if (header.version !== BLE_PROTOCOL_VERSION) {
    throw new FrameError("malformed", `version ${header.version}`);
  }
  if ((flags & FLAG_RESERVED) !== 0) {
    throw new FrameError("malformed", "reserved flag bits set");
  }
  if (header.ack) {
    if (header.first || header.last || chunk.length !== HEADER_SIZE) {
      throw new FrameError("malformed", "acknowledgement carries data");
    }
    return { header, payload: new Uint8Array(0) };
  }
  let headerSize = HEADER_SIZE;
  if (header.first) {
    if (chunk.length < FIRST_HEADER_SIZE) {
      throw new FrameError("malformed", `first chunk is ${chunk.length} bytes`);
    }
    header.length = readUint32(chunk, 5);
    headerSize = FIRST_HEADER_SIZE;
    if (header.length === 0) {
      throw new FrameError("malformed", "zero length");
    }
  }
  if (chunk.length === headerSize) {
    throw new FrameError("malformed", "empty payload");
  }
  return { header, payload: chunk.subarray(headerSize) };
}

export function encodeChunk(
  header: Pick<ChunkHeader, "first" | "last" | "seq" | "tag" | "length">,
  payload: Uint8Array,
): Uint8Array {
  const size = header.first ? FIRST_HEADER_SIZE : HEADER_SIZE;
  const out = new Uint8Array(size + payload.length);
  let flags = BLE_PROTOCOL_VERSION << VERSION_SHIFT;
  if (header.first) flags |= FLAG_FIRST;
  if (header.last) flags |= FLAG_LAST;
  out[0] = flags;
  out[1] = (header.seq >> 8) & 0xff;
  out[2] = header.seq & 0xff;
  out[3] = (header.tag >> 8) & 0xff;
  out[4] = header.tag & 0xff;
  if (header.first) {
    out[5] = (header.length >>> 24) & 0xff;
    out[6] = (header.length >>> 16) & 0xff;
    out[7] = (header.length >>> 8) & 0xff;
    out[8] = header.length & 0xff;
  }
  out.set(payload, size);
  return out;
}

/** An acknowledgement naming the next data chunk expected from the peer. */
export function encodeAck(tag: number, next: number): Uint8Array {
  return new Uint8Array([
    (BLE_PROTOCOL_VERSION << VERSION_SHIFT) | FLAG_ACK,
    (next >> 8) & 0xff,
    next & 0xff,
    (tag >> 8) & 0xff,
    tag & 0xff,
  ]);
}

/** Payload bytes one chunk carries at a given ATT MTU. */
export function chunkPayloadSize(mtu: number, headerSize: number): number {
  const effective = Math.max(mtu, BLE_DEFAULT_MTU);
  return (
    Math.min(effective - BLE_ATT_HEADER_SIZE, BLE_MAX_CHUNK_SIZE) - headerSize
  );
}

/** Splits outgoing messages, numbering chunks across the whole connection. */
export class Chunker {
  private seq: number;

  constructor(
    readonly tag: number,
    startSeq = 0,
  ) {
    this.seq = startSeq & 0xffff;
  }

  get next(): number {
    return this.seq;
  }

  split(message: Uint8Array, mtu: number): Uint8Array[] {
    if (message.length === 0) {
      throw new FrameError("empty", "empty message");
    }
    if (message.length > MAX_UINT32) {
      throw new FrameError("too_large", `${message.length} bytes`);
    }
    const chunks: Uint8Array[] = [];
    let offset = 0;
    while (offset < message.length) {
      const first = offset === 0;
      const size = Math.min(
        chunkPayloadSize(mtu, first ? FIRST_HEADER_SIZE : HEADER_SIZE),
        message.length - offset,
      );
      chunks.push(
        encodeChunk(
          {
            first,
            last: offset + size === message.length,
            seq: this.seq,
            tag: this.tag,
            length: first ? message.length : 0,
          },
          message.subarray(offset, offset + size),
        ),
      );
      this.seq = (this.seq + 1) & 0xffff;
      offset += size;
    }
    return chunks;
  }
}

interface HeldChunk {
  header: ChunkHeader;
  payload: Uint8Array;
}

/**
 * Puts incoming chunks back in order and joins them into messages. A chunk up
 * to 256 places early is held until the gap fills; anything else that does not
 * fit is a fatal sequence error, as on Core.
 */
export class Reassembler {
  private readonly held = new Map<number, HeldChunk>();
  private parts: Uint8Array[] = [];
  private received = 0;
  private heldBytes = 0;
  private errors = 0;
  private expected = 0;
  private nextSeq = 0;
  private inProgress = false;
  private maxMessage: number;

  constructor(maxMessage = 0, startSeq = 0) {
    this.maxMessage = 0;
    this.setMaxMessage(maxMessage);
    this.nextSeq = startSeq & 0xffff;
  }

  /** Zero or less means no limit, which is how a client receives from Core. */
  setMaxMessage(maxMessage: number): void {
    this.maxMessage =
      maxMessage <= 0 || maxMessage > MAX_UINT32 ? MAX_UINT32 : maxMessage;
  }

  get protocolErrors(): number {
    return this.errors;
  }

  get next(): number {
    return this.nextSeq;
  }

  get heldCount(): number {
    return this.held.size;
  }

  /** Accepts one data chunk and returns every message it completes. */
  push(header: ChunkHeader, payload: Uint8Array): Uint8Array[] {
    if (header.ack) {
      throw new FrameError("malformed", "acknowledgement is not data");
    }
    const distance = (header.seq - this.nextSeq) & 0xffff;
    if (distance === 0) return this.drain(header, payload);
    if (distance < BLE_REORDER_WINDOW) {
      if (this.held.has(header.seq)) {
        throw new FrameError("sequence", `duplicate chunk ${header.seq}`);
      }
      if (this.heldBytes + payload.length > BLE_MAX_HELD_BYTES) {
        throw new FrameError(
          "sequence",
          `too much held waiting for chunk ${this.nextSeq}`,
        );
      }
      this.held.set(header.seq, { header, payload: payload.slice() });
      this.heldBytes += payload.length;
      return [];
    }
    throw new FrameError(
      "sequence",
      `chunk ${header.seq}, expected ${this.nextSeq}`,
    );
  }

  private drain(header: ChunkHeader, payload: Uint8Array): Uint8Array[] {
    const messages: Uint8Array[] = [];
    let current: HeldChunk = { header, payload };
    for (;;) {
      const message = this.apply(current.header, current.payload);
      if (message) messages.push(message);
      const next = this.held.get(this.nextSeq);
      if (!next) return messages;
      this.held.delete(this.nextSeq);
      this.heldBytes -= next.payload.length;
      current = next;
    }
  }

  private apply(header: ChunkHeader, payload: Uint8Array): Uint8Array | null {
    this.nextSeq = (this.nextSeq + 1) & 0xffff;
    if (header.first) {
      if (this.inProgress) this.recoverable();
      if (header.length > this.maxMessage) {
        throw new FrameError(
          "too_large",
          `declared ${header.length} bytes, limit ${this.maxMessage}`,
        );
      }
      this.parts = [];
      this.received = 0;
      this.expected = header.length;
      this.inProgress = true;
    } else if (!this.inProgress) {
      // A continuation with no message in progress is dropped.
      this.recoverable();
      return null;
    }

    if (this.received + payload.length > this.expected) {
      throw new FrameError(
        "length_mismatch",
        `${this.received + payload.length} bytes exceeds declared ${this.expected}`,
      );
    }
    this.parts.push(payload.slice());
    this.received += payload.length;
    if (!header.last) return null;
    if (this.received !== this.expected) {
      throw new FrameError(
        "length_mismatch",
        `got ${this.received} bytes, declared ${this.expected}`,
      );
    }
    const message = new Uint8Array(this.received);
    let offset = 0;
    for (const part of this.parts) {
      message.set(part, offset);
      offset += part.length;
    }
    this.parts = [];
    this.received = 0;
    this.expected = 0;
    this.inProgress = false;
    return message;
  }

  private recoverable(): void {
    this.errors++;
    if (this.errors >= BLE_MAX_PROTOCOL_ERRORS) {
      throw new FrameError("too_many_errors", "too many protocol errors");
    }
  }
}
