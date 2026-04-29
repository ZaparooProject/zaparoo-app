// Binary-safe base64 encode/decode. Wraps atob/btoa with a Latin-1 charcode
// loop so arbitrary 0–255 byte values round-trip correctly (the naive
// atob/btoa contract is otherwise UTF-16-string-shaped and corrupts binary).

export function base64Encode(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i] as number);
  }
  return btoa(binary);
}

export function base64Decode(s: string): Uint8Array {
  const binary = atob(s);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}
