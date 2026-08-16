/**
 * Unit Tests: useActiveDeviceKey
 *
 * This key namespaces every device-scoped cache in the app, so what it must
 * never do is stay the same across a device switch or change while one device
 * stays selected.
 */

import { act, renderHook } from "@/test-utils";
import { describe, expect, it } from "vitest";
import { useActiveDeviceKey } from "@/hooks/useActiveDeviceKey";
import { deviceRegistry } from "@/lib/devices/deviceRegistry";
import { seedActiveDevice } from "@/test-utils/deviceRegistry";

describe("useActiveDeviceKey", () => {
  it("should be empty before the registry hydrates", () => {
    const { result } = renderHook(() => useActiveDeviceKey());

    expect(result.current).toBe("");
  });

  it("should scope state by record ID rather than by address", async () => {
    const { result } = renderHook(() => useActiveDeviceKey());

    let recordId = "";
    await act(async () => {
      const record = await deviceRegistry.selectAddress("192.168.1.10:7497");
      recordId = record?.recordId ?? "";
    });

    expect(recordId).not.toBe("");
    expect(result.current).toBe(recordId);
    expect(result.current).not.toBe("192.168.1.10:7497");
  });

  it("should change when the user switches devices", async () => {
    const first = await seedActiveDevice({ address: "192.168.1.10" });
    const { result } = renderHook(() => useActiveDeviceKey());
    expect(result.current).toBe(first.recordId);

    await act(async () => {
      await deviceRegistry.selectAddress("192.168.1.11");
    });

    expect(result.current).not.toBe(first.recordId);
    expect(result.current).not.toBe("");
  });

  it("should hold steady when the active device is renamed", async () => {
    const record = await seedActiveDevice();
    const { result } = renderHook(() => useActiveDeviceKey());

    await act(async () => {
      await deviceRegistry.setCustomName(record.recordId, "Living Room");
    });

    expect(result.current).toBe(record.recordId);
  });

  it("should follow the same device across an address change", async () => {
    let recordId = "";
    await act(async () => {
      const record = await deviceRegistry.selectDiscovered({
        discoveryId: "core-id",
        hostname: "steamdeck.local",
        addresses: ["10.0.0.206"],
        port: 7497,
      });
      recordId = record?.recordId ?? "";
    });
    const { result } = renderHook(() => useActiveDeviceKey());

    await act(async () => {
      await deviceRegistry.selectDiscovered({
        discoveryId: "core-id",
        hostname: "steamdeck.local",
        addresses: ["10.0.0.207"],
        port: 7497,
      });
    });

    expect(result.current).toBe(recordId);
  });

  it("should empty when the active device is forgotten", async () => {
    const record = await seedActiveDevice();
    const { result } = renderHook(() => useActiveDeviceKey());

    await act(async () => {
      await deviceRegistry.removeRecord(record.recordId);
    });

    expect(result.current).toBe("");
  });
});
