import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Preferences } from "@capacitor/preferences";
import {
  CoreAPI,
  getDeviceAddress,
  setDeviceAddress,
  validateDeviceAddress,
  type DeviceAddressValidationResult,
} from "@/lib/coreApi";
import { useStatusStore } from "@/lib/store";

export interface ScanDeviceSelection {
  address: string;
  name?: string;
  platform?: string;
  version?: string;
}

export function useSelectDevice() {
  const queryClient = useQueryClient();
  const resetConnectionState = useStatusStore((s) => s.resetConnectionState);
  const setTargetDeviceAddress = useStatusStore(
    (s) => s.setTargetDeviceAddress,
  );
  const addDeviceHistory = useStatusStore((s) => s.addDeviceHistory);
  const updateDeviceHistoryMeta = useStatusStore(
    (s) => s.updateDeviceHistoryMeta,
  );

  const selectDevice = useCallback(
    (newAddress: string): DeviceAddressValidationResult => {
      const result = validateDeviceAddress(newAddress);
      if (!result.ok) return result;

      if (result.address === getDeviceAddress()) return result;

      setDeviceAddress(result.address);
      resetConnectionState();
      setTargetDeviceAddress(result.address);
      CoreAPI.reset();
      queryClient.invalidateQueries();

      // Saved search filters may not exist on the new device — drop them so we
      // don't fire requests against unknown systems/tags on first load.
      Preferences.remove({ key: "searchSystem" }).catch(() => {});
      Preferences.remove({ key: "searchTags" }).catch(() => {});

      return result;
    },
    [queryClient, resetConnectionState, setTargetDeviceAddress],
  );

  const selectScanDevice = useCallback(
    (device: ScanDeviceSelection) => {
      const result = selectDevice(device.address);
      if (!result.ok) return result;

      // Capture metadata immediately. The version() RPC populates these fields
      // post-connect, but if the user disconnects first we still want a
      // populated row to show in the device list.
      addDeviceHistory(result.address);
      updateDeviceHistoryMeta(result.address, {
        name: device.name,
        platform: device.platform,
        version: device.version,
      });

      return result;
    },
    [addDeviceHistory, selectDevice, updateDeviceHistoryMeta],
  );

  return { selectDevice, selectScanDevice };
}
