import { useCallback, useEffect, useRef, useState } from "react";
import { logger } from "@/lib/logger";
import {
  canOpenBluetoothFixSettings,
  getBluetoothReadiness,
  isBluetoothTransportSupported,
  openBluetoothFixSettings,
  type BluetoothReadiness,
} from "@/lib/transport/ble/bluetooth";
import {
  startBluetoothScan,
  type BluetoothScan,
  type NearbyBluetoothDevice,
} from "@/lib/transport/ble/scanner";

/**
 * Nearby Cores over Bluetooth while `active`, for `durationMs` per scan.
 * Readiness problems (off, no permission) are returned for inline display.
 */
export function useBluetoothScan(active: boolean, durationMs: number) {
  const supported = isBluetoothTransportSupported();
  const [devices, setDevices] = useState<NearbyBluetoothDevice[]>([]);
  const [readiness, setReadiness] = useState<BluetoothReadiness | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const scanRef = useRef<BluetoothScan | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const runRef = useRef(0);

  const stop = useCallback(() => {
    runRef.current++;
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const scan = scanRef.current;
    scanRef.current = null;
    if (scan) void scan.stop();
    setIsScanning(false);
  }, []);

  const start = useCallback(async () => {
    if (!supported) return;
    stop();
    const run = runRef.current;
    setIsScanning(true);
    const ready = await getBluetoothReadiness({ request: true });
    if (run !== runRef.current) return;
    setReadiness(ready);
    if (ready !== "ready") {
      setIsScanning(false);
      return;
    }
    setDevices([]);
    try {
      const scan = await startBluetoothScan((device) => {
        if (run !== runRef.current) return;
        setDevices((current) => [
          ...current.filter((d) => d.peripheralId !== device.peripheralId),
          device,
        ]);
      });
      if (run !== runRef.current) {
        void scan.stop();
        return;
      }
      scanRef.current = scan;
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        if (run === runRef.current) stop();
      }, durationMs);
    } catch (error) {
      logger.warn("Bluetooth scan failed", error, {
        category: "bluetooth",
        action: "scan",
      });
      if (run === runRef.current) setIsScanning(false);
    }
  }, [durationMs, stop, supported]);

  useEffect(() => {
    // Turning inactive runs the previous cleanup, which stops the scan.
    if (!active || !supported) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Scanning is an external system this effect starts and stops.
    void start();
    return stop;
  }, [active, start, stop, supported]);

  const openSettings = useCallback(() => {
    if (readiness) void openBluetoothFixSettings(readiness);
  }, [readiness]);

  return {
    supported,
    devices,
    readiness,
    isScanning,
    rescan: start,
    canOpenSettings:
      readiness !== null && canOpenBluetoothFixSettings(readiness),
    openSettings,
  };
}
