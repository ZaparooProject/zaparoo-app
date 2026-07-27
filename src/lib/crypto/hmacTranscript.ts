// HMAC confirmation transcript for the pairing handshake.
// Length-prefix encoding is 4-byte big-endian uint32 — matching the Go spec.

const enc = new TextEncoder();

export function lengthPrefix(data: Uint8Array): Uint8Array {
  const result = new Uint8Array(4 + data.length);
  const view = new DataView(
    result.buffer,
    result.byteOffset,
    result.byteLength,
  );
  view.setUint32(0, data.length, false /* big-endian */);
  result.set(data, 4);
  return result;
}

export function buildHmacTranscript(
  role: string,
  clientName: string,
  msgA: Uint8Array,
  msgB: Uint8Array,
): Uint8Array {
  const parts = [
    lengthPrefix(enc.encode("zaparoo-v1")),
    lengthPrefix(enc.encode("p256")),
    lengthPrefix(enc.encode(role)),
    lengthPrefix(enc.encode(clientName)),
    lengthPrefix(msgA),
    lengthPrefix(msgB),
  ];
  const total = parts.reduce((sum, p) => sum + p.length, 0);
  const buf = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    buf.set(part, offset);
    offset += part.length;
  }
  return buf;
}
