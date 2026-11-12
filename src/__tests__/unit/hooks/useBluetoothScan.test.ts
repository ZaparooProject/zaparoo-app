import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import type { NearbyBluetoothDevice } from "@/lib/transport/ble/scanner";

const mocks = vi.hoisted(() => ({
  supported: true,
  readiness: "ready" as string,
  canOpen: true,
  openSettings: vi.fn(() => Promise.resolve()),
  getReadiness: vi.fn(),
  startScan: vi.fn(),
  stopScan: vi.fn(() => Promise.resolve()),
  onDevice: null as ((device: NearbyBluetoothDevice) => void) | null,
}));

vi.mock("@/lib/transport/ble/bluetooth", () => ({
  isBluetoothTransportSupported: () => mocks.supported,
  getBluetoothReadiness: mocks.getReadiness,
  canOpenBluetoothFixSettings: () => mocks.canOpen,
  openBluetoothFixSettings: mocks.openSettings,
}));

vi.mock("@/lib/transport/ble/scanner", () => ({
  startBluetoothScan: mocks.startScan,
}));

import { useBluetoothScan } from "@/hooks/useBluetoothScan";

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("useBluetoothScan", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mocks.supported = true;
    mocks.readiness = "ready";
    mocks.canOpen = true;
    mocks.onDevice = null;
    mocks.openSettings.mockClear();
    mocks.stopScan.mockClear();
    mocks.getReadiness.mockReset();
    mocks.getReadiness.mockImplementation(() =>
      Promise.resolve(mocks.readiness),
    );
    mocks.startScan.mockReset();
    mocks.startScan.mockImplementation(
      (onDevice: (device: NearbyBluetoothDevice) => void) => {
        mocks.onDevice = onDevice;
        return Promise.resolve({ stop: mocks.stopScan });
      },
    );
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should do nothing when Bluetooth is not supported", async () => {
    mocks.supported = false;
    const { result } = renderHook(() => useBluetoothScan(true, 5000));
    await flush();

    expect(result.current.supported).toBe(false);
    expect(mocks.getReadiness).not.toHaveBeenCalled();
    expect(mocks.startScan).not.toHaveBeenCalled();
  });

  it("should not scan while inactive", async () => {
    renderHook(() => useBluetoothScan(false, 5000));
    await flush();

    expect(mocks.startScan).not.toHaveBeenCalled();
  });

  it("should list devices found and replace repeats by peripheral", async () => {
    const { result } = renderHook(() => useBluetoothScan(true, 5000));
    await flush();

    expect(mocks.getReadiness).toHaveBeenCalledWith({ request: true });
    expect(result.current.readiness).toBe("ready");
    expect(result.current.isScanning).toBe(true);

    act(() => {
      mocks.onDevice!({ peripheralId: "AA", name: "Core A", rssi: -70 });
      mocks.onDevice!({ peripheralId: "BB", name: "Core B" });
      mocks.onDevice!({ peripheralId: "AA", name: "Core A", rssi: -50 });
    });

    expect(result.current.devices).toEqual([
      { peripheralId: "BB", name: "Core B" },
      { peripheralId: "AA", name: "Core A", rssi: -50 },
    ]);
  });

  it("should stop scanning after the duration", async () => {
    const { result } = renderHook(() => useBluetoothScan(true, 5000));
    await flush();

    act(() => {
      vi.advanceTimersByTime(5000);
    });

    expect(mocks.stopScan).toHaveBeenCalledTimes(1);
    expect(result.current.isScanning).toBe(false);
  });

  it("should report a readiness problem without scanning", async () => {
    mocks.readiness = "disabled";
    const { result } = renderHook(() => useBluetoothScan(true, 5000));
    await flush();

    expect(result.current.readiness).toBe("disabled");
    expect(result.current.isScanning).toBe(false);
    expect(result.current.canOpenSettings).toBe(true);
    expect(mocks.startScan).not.toHaveBeenCalled();

    act(() => {
      result.current.openSettings();
    });
    expect(mocks.openSettings).toHaveBeenCalledWith("disabled");
  });

  it("should not offer settings before readiness is known", () => {
    mocks.getReadiness.mockImplementation(() => new Promise(() => {}));
    const { result } = renderHook(() => useBluetoothScan(true, 5000));

    expect(result.current.canOpenSettings).toBe(false);
    act(() => {
      result.current.openSettings();
    });
    expect(mocks.openSettings).not.toHaveBeenCalled();
  });

  it("should clear the list and scan again on rescan", async () => {
    const { result } = renderHook(() => useBluetoothScan(true, 5000));
    await flush();
    act(() => {
      mocks.onDevice!({ peripheralId: "AA", name: "Core A" });
    });

    await act(async () => {
      await result.current.rescan();
    });

    expect(mocks.stopScan).toHaveBeenCalledTimes(1);
    expect(mocks.startScan).toHaveBeenCalledTimes(2);
    expect(result.current.devices).toEqual([]);
    expect(result.current.isScanning).toBe(true);
  });

  it("should stop the scan when it becomes inactive", async () => {
    const { result, rerender } = renderHook(
      ({ active }) => useBluetoothScan(active, 5000),
      { initialProps: { active: true } },
    );
    await flush();

    rerender({ active: false });

    expect(mocks.stopScan).toHaveBeenCalledTimes(1);
    expect(result.current.isScanning).toBe(false);
  });

  it("should ignore devices from a scan that was stopped", async () => {
    const { result, rerender } = renderHook(
      ({ active }) => useBluetoothScan(active, 5000),
      { initialProps: { active: true } },
    );
    await flush();
    const staleCallback = mocks.onDevice!;

    rerender({ active: false });
    act(() => {
      staleCallback({ peripheralId: "AA", name: "Core A" });
    });

    expect(result.current.devices).toEqual([]);
  });

  it("should stop a scan that started after it was cancelled", async () => {
    let resolveScan: (scan: { stop: () => Promise<void> }) => void = () => {};
    mocks.startScan.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveScan = resolve;
        }),
    );
    const { rerender } = renderHook(
      ({ active }) => useBluetoothScan(active, 5000),
      { initialProps: { active: true } },
    );
    await flush();

    rerender({ active: false });
    await act(async () => {
      resolveScan({ stop: mocks.stopScan });
      await Promise.resolve();
    });

    expect(mocks.stopScan).toHaveBeenCalledTimes(1);
  });

  it("should end scanning when the scan fails to start", async () => {
    mocks.startScan.mockRejectedValue(new Error("radio busy"));
    const { result } = renderHook(() => useBluetoothScan(true, 5000));
    await flush();

    expect(result.current.isScanning).toBe(false);
  });
});
