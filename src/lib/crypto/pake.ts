// PAKE2 over P-256 client — direct port of zaparoo-mcp/src/crypto/pake.ts.
// Uses @noble/curves for point arithmetic and @noble/hashes for SHA-256.

import { p256 } from "@noble/curves/nist.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { bigintToBytes, bytesToScalar } from "./bigint";

type Point = ReturnType<typeof p256.Point.fromAffine>;

// Fixed P-256 curve points from schollz/pake v3 (role 0 = U, role 1 = V).
const U = p256.Point.fromAffine({
  x: 793136080485469241208656611513609866400481671852n,
  y: 59748757929350367369315811184980635230185250460108398961713395032485227207304n,
});

const V = p256.Point.fromAffine({
  x: 1086685267857089638167386722555472967068468061489n,
  y: 9157340230202296554417312816309453883742349874205386245733062928888341584123n,
});

interface PakeWire {
  role: number;
  ux: string;
  uy: string;
  vx: string;
  vy: string;
  xx: string;
  xy: string;
  yx: string;
  yy: string;
}

export class PakeClient {
  private pw: Uint8Array;
  private alpha: Uint8Array;
  private X: { x: bigint; y: bigint };
  private Vpw: Point;
  private K: Uint8Array | null = null;

  constructor(pin: string, randomBytes?: Uint8Array) {
    this.pw = new TextEncoder().encode(pin);
    const pwScalar = bytesToScalar(this.pw);

    const UpwPoint = U.multiply(pwScalar);
    this.Vpw = V.multiply(pwScalar);

    this.alpha = randomBytes ?? p256.utils.randomSecretKey();

    const alphaG = p256.Point.BASE.multiply(bytesToScalar(this.alpha));
    const XPoint = UpwPoint.add(alphaG);
    this.X = XPoint.toAffine();
  }

  // Returns the wire bytes for this client's PAKE message.
  // Cache these bytes before calling update() — the spec requires the original
  // wire bytes in the HMAC transcript, not a re-serialization.
  bytes(): Uint8Array {
    const Ua = U.toAffine();
    const Va = V.toAffine();
    const wire: PakeWire = {
      role: 0,
      ux: Ua.x.toString(),
      uy: Ua.y.toString(),
      vx: Va.x.toString(),
      vy: Va.y.toString(),
      xx: this.X.x.toString(),
      xy: this.X.y.toString(),
      yx: "0",
      yy: "0",
    };
    return new TextEncoder().encode(JSON.stringify(wire));
  }

  update(serverBytes: Uint8Array): void {
    let q: PakeWire;
    try {
      q = JSON.parse(new TextDecoder().decode(serverBytes)) as PakeWire;
    } catch (err) {
      throw new Error("Failed to parse PAKE server message", { cause: err });
    }

    if (q.role !== 1) throw new Error("Expected server role 1");
    if (!q.yx || q.yx === "0" || !q.yy || q.yy === "0")
      throw new Error("Server PAKE message missing Y values");

    const Y = { x: BigInt(q.yx), y: BigInt(q.yy) };
    const YPoint = p256.Point.fromAffine(Y);
    // Reject off-curve peer points — guards against invalid-curve attacks
    // where a malicious server crafts Y on a related curve to leak bits of
    // the shared secret. Mirrors schollz/pake's `IsOnCurve` server-side check.
    YPoint.assertValidity();

    const diff = YPoint.add(this.Vpw.negate());
    const ZPoint = diff.multiply(bytesToScalar(this.alpha));
    const Z = ZPoint.toAffine();

    this.alpha.fill(0);

    // K = SHA-256(pw || X.x || X.y || Y.x || Y.y || Z.x || Z.y)
    // bigintToBytes is used for variable-length Go-compatible serialization.
    const parts = [
      this.pw,
      bigintToBytes(this.X.x),
      bigintToBytes(this.X.y),
      bigintToBytes(Y.x),
      bigintToBytes(Y.y),
      bigintToBytes(Z.x),
      bigintToBytes(Z.y),
    ];
    const total = parts.reduce((sum, p) => sum + p.length, 0);
    const buf = new Uint8Array(total);
    let offset = 0;
    for (const part of parts) {
      buf.set(part, offset);
      offset += part.length;
    }
    this.K = sha256(buf);
    this.pw = new Uint8Array(0);
  }

  sessionKey(): Uint8Array {
    if (!this.K)
      throw new Error("Session key not yet derived — call update() first");
    return this.K;
  }
}
