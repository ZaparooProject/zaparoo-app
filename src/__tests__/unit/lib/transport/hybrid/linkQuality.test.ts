import { describe, expect, it } from "vitest";
import {
  LinkQuality,
  probeDelay,
  shouldPreferWebSocket,
  type LinkQualitySnapshot,
} from "@/lib/transport/hybrid/linkQuality";

const snapshot = (
  value: Partial<LinkQualitySnapshot> = {},
): LinkQualitySnapshot => ({
  rttMs: null,
  failures: 0,
  throughput: null,
  ...value,
});

describe("LinkQuality", () => {
  it("takes the first round trip as is, then smooths", () => {
    const quality = new LinkQuality();
    quality.recordRtt(100);
    expect(quality.snapshot().rttMs).toBe(100);
    quality.recordRtt(200);
    expect(quality.snapshot().rttMs).toBeCloseTo(130);
  });

  it("ignores invalid round trips", () => {
    const quality = new LinkQuality();
    quality.recordRtt(-1);
    quality.recordRtt(Number.NaN);
    expect(quality.snapshot().rttMs).toBeNull();
  });

  it("clears failures on a round trip or a success", () => {
    const quality = new LinkQuality();
    quality.recordFailure();
    quality.recordFailure();
    expect(quality.snapshot().failures).toBe(2);
    quality.recordRtt(50);
    expect(quality.snapshot().failures).toBe(0);
    quality.recordFailure();
    quality.recordSuccess();
    expect(quality.snapshot().failures).toBe(0);
  });

  it("smooths throughput and ignores zero", () => {
    const quality = new LinkQuality();
    quality.recordThroughput(0);
    expect(quality.snapshot().throughput).toBeNull();
    quality.recordThroughput(1000);
    quality.recordThroughput(2000);
    expect(quality.snapshot().throughput).toBeCloseTo(1300);
  });

  it("forgets everything on reset", () => {
    const quality = new LinkQuality();
    quality.recordRtt(50);
    quality.recordThroughput(10);
    quality.recordFailure();
    quality.reset();
    expect(quality.snapshot()).toEqual(snapshot());
  });
});

describe("shouldPreferWebSocket", () => {
  it("prefers Wi-Fi with nothing measured", () => {
    expect(shouldPreferWebSocket(snapshot(), snapshot())).toBe(true);
  });

  it("keeps a healthy Bluetooth link while Wi-Fi is failing", () => {
    expect(
      shouldPreferWebSocket(snapshot({ failures: 1 }), snapshot({ rttMs: 80 })),
    ).toBe(false);
  });

  it("switches from a failing Bluetooth link even to a failing Wi-Fi one", () => {
    expect(
      shouldPreferWebSocket(
        snapshot({ failures: 1 }),
        snapshot({ rttMs: 80, failures: 2 }),
      ),
    ).toBe(true);
  });

  it("stays on Bluetooth while Wi-Fi is more than twice as slow", () => {
    expect(
      shouldPreferWebSocket(snapshot({ rttMs: 300 }), snapshot({ rttMs: 100 })),
    ).toBe(false);
  });

  it("switches when Wi-Fi is no more than twice as slow", () => {
    expect(
      shouldPreferWebSocket(snapshot({ rttMs: 200 }), snapshot({ rttMs: 100 })),
    ).toBe(true);
  });
});

describe("probeDelay", () => {
  it("doubles with each quick drop", () => {
    expect(probeDelay(60000, 0)).toBe(60000);
    expect(probeDelay(60000, 1)).toBe(120000);
    expect(probeDelay(60000, 3)).toBe(480000);
  });

  it("caps at ten minutes", () => {
    expect(probeDelay(60000, 10)).toBe(600000);
  });
});
