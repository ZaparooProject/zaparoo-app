// Device addresses can contain `:` and `/` (e.g. `wss://host:7497`), which
// don't survive a single-segment route param. Encode to base64url so the
// router only ever sees `[A-Za-z0-9_-]`. UTF-8-encode first so non-Latin1
// characters (IDN hostnames, accidental user input) don't make btoa throw.
export function encodeDeviceAddress(address: string): string {
  const bytes = new TextEncoder().encode(address);
  let bin = "";
  for (const byte of bytes) bin += String.fromCharCode(byte);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function decodeDeviceAddress(encoded: string): string {
  const padded = encoded.replace(/-/g, "+").replace(/_/g, "/");
  const padding = (4 - (padded.length % 4)) % 4;
  const bin = atob(padded + "=".repeat(padding));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}
