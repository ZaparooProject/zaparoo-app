import { describe, expect, it } from "vitest";
import { buildHmacTranscript, lengthPrefix } from "@/lib/crypto/hmacTranscript";

describe("lengthPrefix", () => {
  it("prepends 4-byte big-endian length", () => {
    const data = new TextEncoder().encode("hi");
    const result = lengthPrefix(data);
    // Length = 2, big-endian uint32 = [0,0,0,2]
    expect(result[0]).toBe(0);
    expect(result[1]).toBe(0);
    expect(result[2]).toBe(0);
    expect(result[3]).toBe(2);
    expect(result[4]).toBe("h".charCodeAt(0));
    expect(result[5]).toBe("i".charCodeAt(0));
  });

  it("handles empty data", () => {
    const result = lengthPrefix(new Uint8Array(0));
    expect(result).toEqual(new Uint8Array([0, 0, 0, 0]));
  });

  it("encodes length 256 correctly (big-endian)", () => {
    const data = new Uint8Array(256);
    const result = lengthPrefix(data);
    // 256 = 0x00_00_01_00
    expect(result[0]).toBe(0);
    expect(result[1]).toBe(0);
    expect(result[2]).toBe(1);
    expect(result[3]).toBe(0);
  });
});

describe("buildHmacTranscript", () => {
  it("returns a non-empty Uint8Array", () => {
    const msgA = new TextEncoder().encode("msgA");
    const msgB = new TextEncoder().encode("msgB");
    const result = buildHmacTranscript("client", "TestApp", msgA, msgB);
    expect(result).toBeInstanceOf(Uint8Array);
    expect(result.length).toBeGreaterThan(0);
  });

  it("produces different bytes for different roles", () => {
    const msgA = new TextEncoder().encode("a");
    const msgB = new TextEncoder().encode("b");
    const client = buildHmacTranscript("client", "App", msgA, msgB);
    const server = buildHmacTranscript("server", "App", msgA, msgB);
    expect(client).not.toEqual(server);
  });

  it("includes zaparoo-v1 prefix at the start", () => {
    const msgA = new Uint8Array(1);
    const msgB = new Uint8Array(1);
    const result = buildHmacTranscript("client", "App", msgA, msgB);
    // First 4 bytes = length of "zaparoo-v1" = 10
    const view = new DataView(result.buffer, result.byteOffset);
    expect(view.getUint32(0, false)).toBe(10);
    // Next 10 bytes spell "zaparoo-v1"
    const prefix = new TextDecoder().decode(result.slice(4, 14));
    expect(prefix).toBe("zaparoo-v1");
  });
});
