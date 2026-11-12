import { describe, expect, it } from "vitest";
import {
  BLE_MAX_PROTOCOL_ERRORS,
  BLE_REORDER_WINDOW,
} from "@/lib/transport/ble/constants";
import {
  Chunker,
  FrameError,
  Reassembler,
  encodeAck,
  encodeChunk,
  parseChunk,
} from "@/lib/transport/ble/frame";

// Vectors and cases mirror Core's pkg/bluetooth/apigatt/frame_test.go.

function testMessage(n: number): Uint8Array {
  const out = new Uint8Array(n);
  for (let i = 0; i < n; i++) out[i] = (i * 7 + Math.floor(i / 251)) & 0xff;
  return out;
}

const text = (value: string) => new TextEncoder().encode(value);

function push(reassembler: Reassembler, chunk: Uint8Array): Uint8Array[] {
  const { header, payload } = parseChunk(chunk);
  return reassembler.push(header, payload);
}

function pushAll(reassembler: Reassembler, chunks: Uint8Array[]) {
  return chunks.flatMap((chunk) => push(reassembler, chunk));
}

function chunk(
  header: Partial<{
    first: boolean;
    last: boolean;
    seq: number;
    tag: number;
    length: number;
  }>,
  payload: Uint8Array,
) {
  return encodeChunk(
    {
      first: false,
      last: false,
      seq: 0,
      tag: 0,
      length: 0,
      ...header,
    },
    payload,
  );
}

function errorKind(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (error) {
    return error instanceof FrameError ? error.kind : "other";
  }
  return undefined;
}

describe("Bluetooth LE framing", () => {
  it("encodes a single-chunk message byte for byte like Core", () => {
    const [only] = new Chunker(0xbeef).split(text("abc"), 512);
    expect(Array.from(only!)).toEqual([
      0x13, 0x00, 0x00, 0xbe, 0xef, 0x00, 0x00, 0x00, 0x03, 0x61, 0x62, 0x63,
    ]);
  });

  it("encodes and parses an acknowledgement", () => {
    const ack = encodeAck(0x1234, 0xfffe);
    expect(Array.from(ack)).toEqual([0x14, 0xff, 0xfe, 0x12, 0x34]);
    const { header, payload } = parseChunk(ack);
    expect(payload).toHaveLength(0);
    expect(header).toMatchObject({
      version: 1,
      ack: true,
      first: false,
      last: false,
      seq: 0xfffe,
      tag: 0x1234,
    });
    expect(errorKind(() => new Reassembler().push(header, payload))).toBe(
      "malformed",
    );
  });

  it.each([
    ["empty", []],
    ["short", [0x10, 0, 0, 0]],
    ["wrong version", [0x20, 0, 0, 0, 0, 0x78]],
    ["reserved bit", [0x18, 0, 0, 0, 0, 0x78]],
    ["no payload", [0x10, 0, 0, 0, 0]],
    ["short first", [0x11, 0, 0, 0, 0, 0, 0]],
    ["first no payload", [0x11, 0, 0, 0, 0, 0, 0, 0, 1]],
    ["zero length", [0x11, 0, 0, 0, 0, 0, 0, 0, 0, 0x78]],
    ["ack with payload", [0x14, 0, 0, 0, 0, 0x78]],
    ["ack with first flag", [0x15, 0, 0, 0, 0]],
    ["ack with last flag", [0x16, 0, 0, 0, 0]],
  ])("rejects a malformed chunk: %s", (_name, bytes) => {
    expect(errorKind(() => parseChunk(new Uint8Array(bytes)))).toBe(
      "malformed",
    );
  });

  it("round-trips every size at every MTU", () => {
    for (const mtu of [0, 23, 100, 185, 247, 512, 517]) {
      for (const size of [1, 10, 11, 12, 100, 1000, 70000]) {
        const chunker = new Chunker(0xbeef);
        const message = testMessage(size);
        const chunks = chunker.split(message, mtu);
        const limit = Math.min(Math.max(mtu, 23) - 3, 512);
        for (const part of chunks) {
          expect(part.length).toBeLessThanOrEqual(limit);
          expect(parseChunk(part).header.tag).toBe(0xbeef);
        }
        const messages = pushAll(new Reassembler(), chunks);
        expect(messages).toHaveLength(1);
        expect(messages[0]).toEqual(message);
      }
    }
  });

  it("rejects an empty message", () => {
    expect(errorKind(() => new Chunker(1).split(new Uint8Array(0), 512))).toBe(
      "empty",
    );
  });

  it("continues the sequence across messages and wraps at 65536", () => {
    const chunker = new Chunker(0, 65530);
    const reassembler = new Reassembler(0, 65530);
    const first = testMessage(100);
    const second = testMessage(77);
    const chunks = [...chunker.split(first, 23), ...chunker.split(second, 23)];
    expect(chunks.length).toBeGreaterThan(6);
    const last = parseChunk(chunks[chunks.length - 1]!).header.seq;
    expect(last).toBe((chunker.next - 1) & 0xffff);
    expect(last).toBeLessThan(100);

    const messages = pushAll(reassembler, chunks);
    expect(messages).toEqual([first, second]);
    expect(reassembler.next).toBe(chunker.next);
  });

  it("puts shuffled chunks back in sending order across messages", () => {
    let seed = 1;
    const random = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };
    for (let round = 0; round < 50; round++) {
      const chunker = new Chunker(3);
      const want: Uint8Array[] = [];
      const chunks: Uint8Array[] = [];
      for (let i = 0; i < 12; i++) {
        const size =
          i % 4 === 0
            ? 40 + Math.floor(random() * 60)
            : 1 + Math.floor(random() * 8);
        const message = testMessage(size + round);
        want.push(message);
        chunks.push(...chunker.split(message, 23));
      }
      expect(chunks.length).toBeLessThan(BLE_REORDER_WINDOW);
      for (let i = chunks.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        [chunks[i], chunks[j]] = [chunks[j]!, chunks[i]!];
      }
      expect(pushAll(new Reassembler(), chunks)).toEqual(want);
    }
  });

  it("releases several held messages at once", () => {
    const chunker = new Chunker(0);
    const chunks = ["one", "two", "three"].flatMap((value) =>
      chunker.split(text(value), 512),
    );
    expect(chunks).toHaveLength(3);
    const reassembler = new Reassembler();
    expect(push(reassembler, chunks[2]!)).toEqual([]);
    expect(push(reassembler, chunks[1]!)).toEqual([]);
    expect(push(reassembler, chunks[0]!)).toEqual([
      text("one"),
      text("two"),
      text("three"),
    ]);
    expect(reassembler.next).toBe(3);
  });

  it("rejects a chunk beyond the window or already consumed", () => {
    expect(
      errorKind(() =>
        push(new Reassembler(), chunk({ seq: BLE_REORDER_WINDOW }, text("x"))),
      ),
    ).toBe("sequence");

    const reassembler = new Reassembler();
    const chunks = new Chunker(0).split(text("done"), 512);
    pushAll(reassembler, chunks);
    expect(errorKind(() => push(reassembler, chunks[0]!))).toBe("sequence");
  });

  it("rejects a duplicate held chunk", () => {
    const reassembler = new Reassembler();
    const early = chunk({ seq: 2 }, text("x"));
    push(reassembler, early);
    expect(errorKind(() => push(reassembler, early))).toBe("sequence");
  });

  it("caps the bytes held for a missing chunk", () => {
    const reassembler = new Reassembler();
    const payload = new Uint8Array(4096);
    let kind: string | undefined;
    for (let seq = 1; seq < BLE_REORDER_WINDOW && kind === undefined; seq++) {
      kind = errorKind(() => push(reassembler, chunk({ seq }, payload)));
    }
    expect(kind).toBe("sequence");
  });

  it("rejects a message whose length does not add up", () => {
    expect(
      errorKind(() =>
        push(
          new Reassembler(),
          chunk({ first: true, last: true, length: 10 }, text("abc")),
        ),
      ),
    ).toBe("length_mismatch");
    expect(
      errorKind(() =>
        push(new Reassembler(), chunk({ first: true, length: 2 }, text("abc"))),
      ),
    ).toBe("length_mismatch");
  });

  it("enforces the message limit and treats zero as none", () => {
    expect(
      errorKind(() =>
        push(new Reassembler(8), chunk({ first: true, length: 9 }, text("a"))),
      ),
    ).toBe("too_large");

    const reassembler = new Reassembler(8);
    reassembler.setMaxMessage(64);
    const message = testMessage(64);
    expect(pushAll(reassembler, new Chunker(0).split(message, 23))).toEqual([
      message,
    ]);
    reassembler.setMaxMessage(0);
    expect(
      errorKind(() =>
        push(
          reassembler,
          chunk(
            { seq: reassembler.next, first: true, length: 0xffffffff },
            text("a"),
          ),
        ),
      ),
    ).toBeUndefined();
  });

  it("budgets recoverable errors", () => {
    const reassembler = new Reassembler();
    for (let seq = 0; seq < BLE_MAX_PROTOCOL_ERRORS - 1; seq++) {
      expect(push(reassembler, chunk({ seq }, text("x")))).toEqual([]);
    }
    expect(
      errorKind(() =>
        push(
          reassembler,
          chunk({ seq: BLE_MAX_PROTOCOL_ERRORS - 1 }, text("x")),
        ),
      ),
    ).toBe("too_many_errors");

    const restarted = new Reassembler();
    push(restarted, chunk({ first: true, length: 100 }, text("abandoned")));
    expect(
      push(
        restarted,
        chunk({ seq: 1, first: true, last: true, length: 3 }, text("new")),
      ),
    ).toEqual([text("new")]);
    expect(restarted.protocolErrors).toBe(1);
  });
});
