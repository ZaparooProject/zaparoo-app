// BigInt utilities matching Go's big.Int.Bytes() behaviour (variable-length, no leading zeros).

export function bytesToScalar(bytes: Uint8Array): bigint {
  let result = 0n;
  for (const byte of bytes) {
    result = (result << 8n) | BigInt(byte);
  }
  return result;
}

// Produces variable-length big-endian bytes with no leading zeros.
// Zero returns an empty array — matching Go big.Int.Bytes() exactly.
// Do NOT use @noble/curves' numberToBytesBE here — it pads to a fixed length
// which breaks the PAKE K-hash and HMAC transcript.
export function bigintToBytes(value: bigint): Uint8Array {
  if (value === 0n) return new Uint8Array(0);
  const hex = value.toString(16);
  const padded = hex.length % 2 ? `0${hex}` : hex;
  const bytes = new Uint8Array(padded.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = Number.parseInt(padded.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}
