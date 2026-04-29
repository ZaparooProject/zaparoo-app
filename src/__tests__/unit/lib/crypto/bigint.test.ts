import { describe, expect, it } from "vitest";
import { bigintToBytes, bytesToScalar } from "@/lib/crypto/bigint";

describe("bigintToBytes", () => {
  it("returns empty array for zero", () => {
    expect(bigintToBytes(0n)).toEqual(new Uint8Array(0));
  });

  it("strips leading zeros — matches Go big.Int.Bytes()", () => {
    // 0x00123456 must produce [0x12, 0x34, 0x56], not [0x00, 0x12, 0x34, 0x56]
    expect(bigintToBytes(0x123456n)).toEqual(
      new Uint8Array([0x12, 0x34, 0x56]),
    );
  });

  it("handles carry byte correctly", () => {
    expect(bigintToBytes(0x100n)).toEqual(new Uint8Array([0x01, 0x00]));
  });

  it("handles single byte", () => {
    expect(bigintToBytes(0xffn)).toEqual(new Uint8Array([0xff]));
  });

  it("round-trips through bytesToScalar", () => {
    const values = [1n, 127n, 255n, 256n, 65535n, 2n ** 64n - 1n];
    for (const v of values) {
      expect(bytesToScalar(bigintToBytes(v))).toBe(v);
    }
  });
});

describe("bytesToScalar", () => {
  it("decodes big-endian bytes to bigint", () => {
    expect(bytesToScalar(new Uint8Array([0x01, 0x00]))).toBe(0x100n);
    expect(bytesToScalar(new Uint8Array([0xff]))).toBe(255n);
    expect(bytesToScalar(new Uint8Array([]))).toBe(0n);
  });
});
