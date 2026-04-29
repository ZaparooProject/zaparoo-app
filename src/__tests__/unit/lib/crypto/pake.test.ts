import { describe, expect, it } from "vitest";
import { PakeClient } from "@/lib/crypto/pake";

describe("PakeClient", () => {
  const fixedAlpha = new Uint8Array(32);
  fixedAlpha[31] = 42;

  it("should construct with a PIN and produce bytes", () => {
    const client = new PakeClient("123456", fixedAlpha);
    const bytes = client.bytes();
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes.length).toBeGreaterThan(0);
  });

  it("should serialize to valid JSON with expected fields", () => {
    const client = new PakeClient("123456", fixedAlpha);
    const parsed = JSON.parse(new TextDecoder().decode(client.bytes()));

    expect(parsed.role).toBe(0);
    expect(typeof parsed.ux).toBe("string");
    expect(typeof parsed.uy).toBe("string");
    expect(typeof parsed.vx).toBe("string");
    expect(typeof parsed.vy).toBe("string");
    expect(typeof parsed.xx).toBe("string");
    expect(typeof parsed.xy).toBe("string");
    expect(parsed.yx).toBe("0");
    expect(parsed.yy).toBe("0");
  });

  it("should produce different X values for different PINs", () => {
    const c1 = new PakeClient("123456", fixedAlpha);
    const c2 = new PakeClient("654321", fixedAlpha);
    const p1 = JSON.parse(new TextDecoder().decode(c1.bytes()));
    const p2 = JSON.parse(new TextDecoder().decode(c2.bytes()));
    expect(p1.xx).not.toBe(p2.xx);
  });

  it("should produce different X values for different random bytes", () => {
    const a1 = new Uint8Array(32);
    a1[31] = 1;
    const a2 = new Uint8Array(32);
    a2[31] = 2;
    const p1 = JSON.parse(
      new TextDecoder().decode(new PakeClient("123456", a1).bytes()),
    );
    const p2 = JSON.parse(
      new TextDecoder().decode(new PakeClient("123456", a2).bytes()),
    );
    expect(p1.xx).not.toBe(p2.xx);
  });

  it("should throw when calling sessionKey before update", () => {
    const client = new PakeClient("123456", fixedAlpha);
    expect(() => client.sessionKey()).toThrow("call update() first");
  });

  it("should throw when server message has same role", () => {
    const client = new PakeClient("123456", fixedAlpha);
    const fakeServer = JSON.stringify({
      role: 0,
      ux: "1",
      uy: "1",
      vx: "1",
      vy: "1",
      xx: "1",
      xy: "1",
      yx: "1",
      yy: "1",
    });
    expect(() => client.update(new TextEncoder().encode(fakeServer))).toThrow(
      "Expected server role 1",
    );
  });

  it("should produce known-answer bytes() output for fixed inputs (regression guard)", () => {
    // Golden values captured 2026-04-19 with @noble/curves on P-256.
    // A change here means the PAKE wire format changed — check Go interop.
    const client = new PakeClient("123456", fixedAlpha);
    const parsed = JSON.parse(new TextDecoder().decode(client.bytes()));
    expect(parsed.xx).toBe(
      "83498509005245465819322201009119001868389827660965897708978743717998135289327",
    );
    expect(parsed.xy).toBe(
      "41379864250107820918826313680313454691537935235393631370474724158168248276403",
    );
    expect(parsed.vx).toBe("1086685267857089638167386722555472967068468061489");
    expect(parsed.vy).toBe(
      "9157340230202296554417312816309453883742349874205386245733062928888341584123",
    );
  });

  it("should throw when server message has zero Y values", () => {
    const client = new PakeClient("123456", fixedAlpha);
    const fakeServer = JSON.stringify({
      role: 1,
      ux: "1",
      uy: "1",
      vx: "1",
      vy: "1",
      xx: "1",
      xy: "1",
      yx: "0",
      yy: "0",
    });
    expect(() => client.update(new TextEncoder().encode(fakeServer))).toThrow(
      "missing Y values",
    );
  });

  it("should return a defensive copy from sessionKey()", () => {
    const client = new PakeClient("123456", fixedAlpha);
    // Inject a derived key directly — bypasses needing a real server response
    // (a valid Y point requires server-side curve math).
    (client as unknown as { K: Uint8Array }).K = new Uint8Array(32).fill(7);

    const first = client.sessionKey();
    first.fill(0);
    const second = client.sessionKey();

    // Mutating the returned key must not affect the stored K.
    expect(second[0]).toBe(7);
    expect(second).not.toBe(first);
  });

  it("should reject a server Y point that is not on the P-256 curve", () => {
    // (1, 1) parses as integers but does not satisfy y^2 = x^3 - 3x + b on P-256,
    // so YPoint.assertValidity() must throw — guarding against invalid-curve attacks.
    const client = new PakeClient("123456", fixedAlpha);
    const fakeServer = JSON.stringify({
      role: 1,
      ux: "1",
      uy: "1",
      vx: "1",
      vy: "1",
      xx: "1",
      xy: "1",
      yx: "1",
      yy: "1",
    });
    expect(() =>
      client.update(new TextEncoder().encode(fakeServer)),
    ).toThrowError(/invalid|point|curve|assertValidity/i);
  });
});
