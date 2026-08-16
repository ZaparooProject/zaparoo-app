/**
 * Unit Tests: useSelectDevice
 *
 * Switching devices is the one moment where everything cached for the old box
 * has to go with it — connection state, in-flight API requests, query cache and
 * the saved search filters, none of which mean anything on the new device. The
 * other half of the contract matters just as much: picking the device you are
 * already on must not tear any of that down.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { Preferences } from "@capacitor/preferences";
import { QueryClient } from "@tanstack/react-query";
import {
  act,
  createProvidersWithQueryClient,
  renderHook,
  waitFor,
} from "@/test-utils";
import { useSelectDevice } from "@/hooks/useSelectDevice";
import { CoreAPI } from "@/lib/coreApi";
import { deviceRegistry } from "@/lib/devices/deviceRegistry";
import { ConnectionState, useStatusStore } from "@/lib/store";
import {
  mockDeviceRecord,
  seedActiveDevice,
  seedDeviceRegistry,
} from "@/test-utils/deviceRegistry";

const CACHED_QUERY_KEY = ["media", "search"];

let queryClient: QueryClient;

function renderSelectDevice() {
  return renderHook(() => useSelectDevice(), {
    wrapper: createProvidersWithQueryClient(queryClient),
  });
}

/**
 * `selectDevice` hands back its validation result before the registry write it
 * kicks off has resolved, so tests that assert nothing happened have to let that
 * write finish first. Every step of it is a microtask, so draining the queue is
 * enough — there is nothing to wait on the clock for.
 */
async function settleSelection(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

/** Everything the teardown is supposed to clear, all present. */
async function primeDeviceScopedState(): Promise<void> {
  useStatusStore.setState({
    connectionState: ConnectionState.CONNECTED,
    connected: true,
    connectionError: "previous device error",
  });
  CoreAPI.setWsInstance({
    isConnected: true,
    send: () => {},
  } as unknown as Parameters<typeof CoreAPI.setWsInstance>[0]);
  queryClient.setQueryData(CACHED_QUERY_KEY, { results: [] });
  await Preferences.set({ key: "searchSystem", value: "snes" });
  await Preferences.set({ key: "searchTags", value: "favourite" });
}

async function deviceScopedStateWasCleared(): Promise<boolean> {
  const { connectionState, connectionError } = useStatusStore.getState();
  const [searchSystem, searchTags] = await Promise.all([
    Preferences.get({ key: "searchSystem" }),
    Preferences.get({ key: "searchTags" }),
  ]);

  return (
    connectionState === ConnectionState.IDLE &&
    connectionError === "" &&
    queryClient.getQueryState(CACHED_QUERY_KEY)?.isInvalidated === true &&
    searchSystem.value === null &&
    searchTags.value === null
  );
}

describe("useSelectDevice", () => {
  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
  });

  describe("selectDevice", () => {
    it("should make the typed address the active device", async () => {
      const { result } = renderSelectDevice();

      let validation: unknown;
      act(() => {
        validation = result.current.selectDevice("10.0.0.5:7497");
      });

      // The default port is implied, so it never survives into the address the
      // user is shown or the endpoint the record stores.
      expect(validation).toMatchObject({ ok: true, address: "10.0.0.5" });
      await waitFor(() => {
        expect(deviceRegistry.activeEndpoint()?.address).toBe("10.0.0.5");
      });
    });

    it("should clear state scoped to the device being left", async () => {
      await seedActiveDevice({ address: "192.168.1.10" });
      await primeDeviceScopedState();
      const { result } = renderSelectDevice();

      act(() => {
        result.current.selectDevice("10.0.0.5");
      });

      await waitFor(async () => {
        expect(await deviceScopedStateWasCleared()).toBe(true);
      });
    });

    it("should keep device state when the address is already active", async () => {
      await seedActiveDevice({ address: "192.168.1.10" });
      await primeDeviceScopedState();
      const { result } = renderSelectDevice();

      act(() => {
        result.current.selectDevice("192.168.1.10:7497");
      });
      await settleSelection();

      expect(await deviceScopedStateWasCleared()).toBe(false);
      expect(useStatusStore.getState().connectionError).toBe(
        "previous device error",
      );
      expect(queryClient.getQueryState(CACHED_QUERY_KEY)?.isInvalidated).toBe(
        false,
      );
    });

    it("should store the normalized form of the address the user typed", async () => {
      const { result } = renderSelectDevice();

      act(() => {
        result.current.selectDevice(" http://10.0.0.5:8080/api/v0.1 ");
      });

      await waitFor(() => {
        expect(deviceRegistry.activeEndpoint()?.address).toBe("10.0.0.5:8080");
      });
    });

    it("should reject an invalid address without touching any state", async () => {
      await seedActiveDevice({ address: "192.168.1.10" });
      await primeDeviceScopedState();
      const { result } = renderSelectDevice();

      let validation: unknown;
      act(() => {
        validation = result.current.selectDevice("192.168.1.286");
      });
      await settleSelection();

      expect(validation).toMatchObject({
        ok: false,
        errorKey: "settings.deviceAddressInvalid",
      });
      expect(deviceRegistry.activeEndpoint()?.address).toBe("192.168.1.10");
      expect(await deviceScopedStateWasCleared()).toBe(false);
    });

    it("should report an empty address as required rather than invalid", () => {
      const { result } = renderSelectDevice();

      let validation: unknown;
      act(() => {
        validation = result.current.selectDevice("   ");
      });

      expect(validation).toMatchObject({
        ok: false,
        errorKey: "settings.deviceAddressRequired",
      });
    });
  });

  describe("selectScanDevice", () => {
    it("should activate the scanned device and keep the metadata it announced", async () => {
      const { result } = renderSelectDevice();

      await act(async () => {
        await result.current.selectScanDevice({
          discoveryId: "living-room._zaparoo._tcp.",
          hostname: "living-room.local",
          addresses: ["10.0.0.5"],
          port: 7497,
          name: "Living Room",
          platform: "linux",
          version: "1.2.3",
        });
      });

      const active = deviceRegistry.activeRecord();
      expect(active).toMatchObject({
        name: "Living Room",
        platform: "linux",
        version: "1.2.3",
      });
      expect(deviceRegistry.activeEndpoint()?.address).toBe(
        "living-room.local",
      );
    });

    it("should clear state scoped to the device being left", async () => {
      await seedActiveDevice({ address: "192.168.1.10" });
      await primeDeviceScopedState();
      const { result } = renderSelectDevice();

      await act(async () => {
        await result.current.selectScanDevice({
          discoveryId: "living-room._zaparoo._tcp.",
          hostname: "living-room.local",
          addresses: ["10.0.0.5"],
          port: 7497,
        });
      });

      expect(await deviceScopedStateWasCleared()).toBe(true);
    });

    it("should keep the replacement transport attached while the registry persists", async () => {
      await seedActiveDevice({ address: "192.168.1.10" });

      let resolvePersistence = () => {};
      const persistence = new Promise<void>((resolve) => {
        resolvePersistence = resolve;
      });
      const persistSpy = vi
        .spyOn(Preferences, "set")
        .mockImplementationOnce(() => persistence);
      const { result } = renderSelectDevice();

      let selection: Promise<void> | undefined;
      try {
        act(() => {
          selection = result.current.selectScanDevice({
            discoveryId: "living-room._zaparoo._tcp.",
            hostname: "living-room.local",
            addresses: ["10.0.0.5"],
            port: 7497,
          });
        });

        await waitFor(() => {
          expect(deviceRegistry.activeEndpoint()?.address).toBe(
            "living-room.local",
          );
        });

        // The registry publishes before Preferences confirms persistence, so
        // ConnectionProvider can install the new transport while selection is
        // still awaiting the write.
        CoreAPI.setWsInstance({
          isConnected: true,
          send: () => {},
        } as unknown as Parameters<typeof CoreAPI.setWsInstance>[0]);

        await act(async () => {
          resolvePersistence();
          await selection;
        });

        expect(CoreAPI.isConnected()).toBe(true);
      } finally {
        resolvePersistence();
        persistSpy.mockRestore();
      }
    });

    it("should keep device state when the scan re-announces the active device", async () => {
      const { result } = renderSelectDevice();
      const announcement = {
        discoveryId: "living-room._zaparoo._tcp.",
        hostname: "living-room.local",
        addresses: ["10.0.0.5"],
        port: 7497,
      };

      await act(async () => {
        await result.current.selectScanDevice(announcement);
      });
      await primeDeviceScopedState();

      await act(async () => {
        await result.current.selectScanDevice(announcement);
      });

      expect(await deviceScopedStateWasCleared()).toBe(false);
    });

    it("should ignore an announcement with no usable address", async () => {
      await seedActiveDevice({ address: "192.168.1.10" });
      await primeDeviceScopedState();
      const { result } = renderSelectDevice();

      await act(async () => {
        await result.current.selectScanDevice({
          discoveryId: "broken._zaparoo._tcp.",
          addresses: [],
          port: 7497,
        });
      });

      expect(deviceRegistry.activeEndpoint()?.address).toBe("192.168.1.10");
      expect(await deviceScopedStateWasCleared()).toBe(false);
    });
  });

  describe("selectRecord", () => {
    it("should activate a stored record and clear the previous device's state", async () => {
      const other = mockDeviceRecord({ address: "192.168.1.10" });
      const target = mockDeviceRecord({ address: "192.168.1.11" });
      await seedDeviceRegistry([other, target], other.recordId);
      await primeDeviceScopedState();
      const { result } = renderSelectDevice();

      await act(async () => {
        await result.current.selectRecord(target.recordId);
      });

      expect(deviceRegistry.getSnapshot().activeRecordId).toBe(target.recordId);
      expect(await deviceScopedStateWasCleared()).toBe(true);
    });

    it("should do nothing for a record that no longer exists", async () => {
      const record = await seedActiveDevice({ address: "192.168.1.10" });
      await primeDeviceScopedState();
      const { result } = renderSelectDevice();

      await act(async () => {
        await result.current.selectRecord("record-that-was-forgotten");
      });

      expect(deviceRegistry.getSnapshot().activeRecordId).toBe(record.recordId);
      expect(await deviceScopedStateWasCleared()).toBe(false);
    });
  });
});
