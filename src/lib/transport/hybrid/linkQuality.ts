/**
 * Per-link health, used to decide whether Wi-Fi is worth switching to. Wi-Fi
 * is preferred unless it is failing while Bluetooth is healthy, or is much
 * slower than Bluetooth right now.
 */

const RTT_SMOOTHING = 0.3;
/** Wi-Fi this many times slower than Bluetooth is not worth switching to. */
const SLOWER_FACTOR = 2;
const MAX_PROBE_BACKOFF_MS = 10 * 60 * 1000;

export interface LinkQualitySnapshot {
  /** Smoothed heartbeat round trip in ms, null before the first one. */
  rttMs: number | null;
  /** Failures since the last success. */
  failures: number;
  /** Smoothed delivery rate in bytes per second, null when unmeasured. */
  throughput: number | null;
}

export class LinkQuality {
  private rtt: number | null = null;
  private rate: number | null = null;
  private failureCount = 0;

  recordRtt(ms: number): void {
    if (!Number.isFinite(ms) || ms < 0) return;
    this.rtt =
      this.rtt === null ? ms : this.rtt + RTT_SMOOTHING * (ms - this.rtt);
    this.failureCount = 0;
  }

  recordThroughput(bytesPerSecond: number): void {
    if (!Number.isFinite(bytesPerSecond) || bytesPerSecond <= 0) return;
    this.rate =
      this.rate === null
        ? bytesPerSecond
        : this.rate + RTT_SMOOTHING * (bytesPerSecond - this.rate);
  }

  recordSuccess(): void {
    this.failureCount = 0;
  }

  recordFailure(): void {
    this.failureCount++;
  }

  reset(): void {
    this.rtt = null;
    this.rate = null;
    this.failureCount = 0;
  }

  snapshot(): LinkQualitySnapshot {
    return {
      rttMs: this.rtt,
      failures: this.failureCount,
      throughput: this.rate,
    };
  }
}

/** Whether a working Wi-Fi route should replace a Bluetooth link. */
export function shouldPreferWebSocket(
  wifi: LinkQualitySnapshot,
  bluetooth: LinkQualitySnapshot,
): boolean {
  const bluetoothHealthy = bluetooth.failures === 0 && bluetooth.rttMs !== null;
  if (wifi.failures > 0 && bluetoothHealthy) return false;
  if (
    wifi.rttMs !== null &&
    bluetooth.rttMs !== null &&
    bluetoothHealthy &&
    wifi.rttMs > bluetooth.rttMs * SLOWER_FACTOR
  ) {
    return false;
  }
  return true;
}

/**
 * How long to wait before probing Wi-Fi again. Each time Wi-Fi was dropped
 * soon after switching to it, the wait doubles, up to ten minutes.
 */
export function probeDelay(baseMs: number, quickDrops: number): number {
  return Math.min(baseMs * 2 ** Math.max(0, quickDrops), MAX_PROBE_BACKOFF_MS);
}
