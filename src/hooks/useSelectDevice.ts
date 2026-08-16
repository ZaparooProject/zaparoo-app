import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Preferences } from "@capacitor/preferences";
import {
  validateDeviceAddress,
  type DeviceAddressValidationResult,
} from "@/lib/coreApi";
import {
  deviceRegistry,
  type DeviceRecord,
  type DiscoveredDeviceRegistration,
} from "@/lib/devices/deviceRegistry";
import { logger } from "@/lib/logger";
import { useStatusStore } from "@/lib/store";

export type ScanDeviceSelection = DiscoveredDeviceRegistration;

export function useSelectDevice() {
  const queryClient = useQueryClient();
  const resetConnectionState = useStatusStore((s) => s.resetConnectionState);

  /**
   * Tear down everything scoped to the device we are leaving.
   *
   * Making a record active is enough to move the socket, but cached queries and
   * in-flight requests belong to the old device and would otherwise be served
   * to the new one until they happen to refetch.
   */
  const activateSelection = useCallback(
    (record: DeviceRecord | null, previousRecordId: string | null) => {
      if (!record || record.recordId === previousRecordId) return;

      resetConnectionState();
      // ConnectionProvider resets CoreAPI during the active-record effect
      // cleanup. The registry publishes before its asynchronous persistence
      // finishes, so resetting here can detach the replacement transport that
      // the new connection effect has already installed.
      queryClient.invalidateQueries();

      // Saved search filters may not exist on the new device — drop them so we
      // don't fire requests against unknown systems/tags on first load.
      Preferences.remove({ key: "searchSystem" }).catch(() => {});
      Preferences.remove({ key: "searchTags" }).catch(() => {});
    },
    [queryClient, resetConnectionState],
  );

  const activate = useCallback(
    (
      select: () => Promise<DeviceRecord | null>,
      action: string,
    ): Promise<void> => {
      const previousRecordId = deviceRegistry.getSnapshot().activeRecordId;
      return select()
        .then((record) => activateSelection(record, previousRecordId))
        .catch((err) => {
          logger.error("Failed to select device", err, {
            category: "connection",
            action,
            severity: "error",
          });
        });
    },
    [activateSelection],
  );

  /**
   * Validation stays synchronous because the settings form needs the error key
   * on the same tick; the registry write and the teardown it triggers do not.
   */
  const selectDevice = useCallback(
    (newAddress: string): DeviceAddressValidationResult => {
      const result = validateDeviceAddress(newAddress);
      if (!result.ok) return result;

      void activate(
        () => deviceRegistry.selectAddress(result.address),
        "selectDevice",
      );
      return result;
    },
    [activate],
  );

  const selectScanDevice = useCallback(
    (device: ScanDeviceSelection): Promise<void> =>
      activate(
        () => deviceRegistry.selectDiscovered(device),
        "selectScanDevice",
      ),
    [activate],
  );

  const selectRecord = useCallback(
    (recordId: string): Promise<void> =>
      activate(
        () =>
          deviceRegistry
            .setActiveRecord(recordId)
            .then(() => deviceRegistry.getSnapshot().records[recordId] ?? null),
        "selectRecord",
      ),
    [activate],
  );

  return { selectDevice, selectScanDevice, selectRecord };
}
