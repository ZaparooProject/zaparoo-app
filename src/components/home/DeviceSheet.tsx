import { useCallback, useEffect, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useRouter } from "@tanstack/react-router";
import { KeyRoundIcon, Loader2, RefreshCw } from "lucide-react";
import { ConnectionStatusDisplay } from "@/components/ConnectionStatusDisplay";
import { DeviceRow } from "@/components/DeviceRow";
import { SlideModal } from "@/components/SlideModal";
import { Button } from "@/components/wui/Button";
import { CircleButton } from "@/components/wui/CircleButton";
import { ModalActionBar } from "@/components/wui/ModalActionBar";
import { useAppUi } from "@/hooks/useAppUi";
import { useConnection } from "@/hooks/useConnection";
import { useActiveDeviceSummary } from "@/hooks/useDevicePresentation";
import {
  getDiscoveredDeviceIdentity,
  useNetworkScan,
  type DiscoveredDevice,
} from "@/hooks/useNetworkScan";
import { useSelectDevice } from "@/hooks/useSelectDevice";
import {
  discoveredDeviceMatchesRecord,
  discoveredDeviceToRegistration,
  displayDiscoveredDeviceAddress,
} from "@/lib/devices/discoveredDevice";
import {
  parsedEndpointForRecord,
  useDeviceRegistry,
  type DeviceRecord,
  type DeviceRegistrySnapshot,
} from "@/lib/devices/deviceRegistry";
import type { ParsedDeviceEndpoint } from "@/lib/devices/endpoint";
import { useStatusStore } from "@/lib/store";

const DEVICE_SCAN_DURATION_MS = 5_000;

const selectRecords = (snapshot: DeviceRegistrySnapshot) => snapshot.records;
const selectActiveRecordId = (snapshot: DeviceRegistrySnapshot) =>
  snapshot.activeRecordId;

interface SavedDevice {
  record: DeviceRecord;
  endpoint: ParsedDeviceEndpoint;
}

interface SwitchDevice {
  key: string;
  saved?: SavedDevice;
  discovered?: DiscoveredDevice;
}

interface DeviceSheetProps {
  isOpen: boolean;
  close: () => void;
}

export function DeviceSheet({ isOpen, close }: DeviceSheetProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const appUi = useAppUi();
  const { isConnected, openPairingModal } = useConnection();
  const { selectRecord, selectScanDevice } = useSelectDevice();
  const { devices, isScanning, error, startScan, stopScan } = useNetworkScan();
  const connectionError = useStatusStore((state) => state.connectionError);
  const coreVersionPending = useStatusStore(
    (state) => state.coreVersionPending,
  );
  const { name, deviceDetails, clientRoleLabel } = useActiveDeviceSummary();
  const records = useDeviceRegistry(selectRecords);
  const activeRecordId = useDeviceRegistry(selectActiveRecordId);
  const scanTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const savedDevices = useMemo(() => {
    return Object.values(records)
      .flatMap((record) => {
        const endpoint = parsedEndpointForRecord(record);
        return endpoint ? [{ record, endpoint }] : [];
      })
      .sort(
        (left, right) =>
          (right.record.lastConnectedAt ?? 0) -
          (left.record.lastConnectedAt ?? 0),
      );
  }, [records]);

  const switchDevices = useMemo(() => {
    const unmatched = new Map(
      devices.map((device) => [getDiscoveredDeviceIdentity(device), device]),
    );
    const savedEntries: SwitchDevice[] = savedDevices.map((saved) => {
      const match = devices.find((device) =>
        discoveredDeviceMatchesRecord(device, saved.record),
      );
      if (match) unmatched.delete(getDiscoveredDeviceIdentity(match));
      return {
        key: `saved:${saved.record.recordId}`,
        saved,
        ...(match ? { discovered: match } : {}),
      };
    });
    const discoveredEntries = [...unmatched.values()]
      .sort((left, right) =>
        (left.name || left.address).localeCompare(right.name || right.address),
      )
      .map(
        (discovered): SwitchDevice => ({
          key: `discovered:${getDiscoveredDeviceIdentity(discovered)}`,
          discovered,
        }),
      );

    return [...savedEntries, ...discoveredEntries].filter(
      (entry) =>
        !isConnected || entry.saved?.record.recordId !== activeRecordId,
    );
  }, [activeRecordId, devices, isConnected, savedDevices]);

  const clearScanTimer = useCallback(() => {
    if (scanTimerRef.current === null) return;
    clearTimeout(scanTimerRef.current);
    scanTimerRef.current = null;
  }, []);

  const beginScan = useCallback(() => {
    if (!appUi.enabled) return;
    clearScanTimer();
    stopScan();
    void startScan();
    scanTimerRef.current = setTimeout(() => {
      scanTimerRef.current = null;
      stopScan();
    }, DEVICE_SCAN_DURATION_MS);
  }, [appUi.enabled, clearScanTimer, startScan, stopScan]);

  useEffect(() => {
    if (!isOpen || !appUi.enabled) {
      clearScanTimer();
      stopScan();
      return;
    }

    void startScan();
    scanTimerRef.current = setTimeout(() => {
      scanTimerRef.current = null;
      stopScan();
    }, DEVICE_SCAN_DURATION_MS);
    return () => {
      clearScanTimer();
      stopScan();
    };
  }, [appUi.enabled, clearScanTimer, isOpen, startScan, stopScan]);

  const selectDevice = (entry: SwitchDevice) => {
    if (entry.saved) {
      void selectRecord(entry.saved.record.recordId);
    } else if (entry.discovered) {
      void selectScanDevice(discoveredDeviceToRegistration(entry.discovered));
    }
    close();
  };

  const showSwitchList = appUi.enabled || switchDevices.length > 0;

  return (
    <SlideModal
      isOpen={isOpen}
      close={close}
      title={t("scan.deviceSheetTitle")}
    >
      <div className="flex flex-col gap-4 py-2">
        <ConnectionStatusDisplay
          connectionError={connectionError}
          connectedSubtitle={deviceDetails}
          connectedSubtitleLoading={isConnected && coreVersionPending}
          connectedName={name ?? undefined}
          connectedTitleSuffix={clientRoleLabel}
          action={
            isConnected ? (
              <CircleButton
                icon={<KeyRoundIcon size={20} />}
                variant="secondary"
                aria-label={t("pairing.openPairing")}
                onClick={() => {
                  openPairingModal();
                  close();
                }}
              />
            ) : undefined
          }
        />

        {showSwitchList && (
          <section
            className="flex flex-col gap-2"
            aria-labelledby="device-switch-heading"
          >
            <div className="flex min-h-12 items-center justify-between gap-2">
              <h3
                id="device-switch-heading"
                className="text-muted-foreground font-bold capitalize"
              >
                {t("scan.deviceSheetRecent")}
              </h3>
              {appUi.enabled && (
                <Button
                  icon={
                    isScanning ? (
                      <Loader2 size={20} className="animate-spin" />
                    ) : (
                      <RefreshCw size={20} />
                    )
                  }
                  variant="ghost"
                  shape="square"
                  size="sm"
                  disabled={isScanning}
                  disabledAppearance={isScanning ? "busy" : "unavailable"}
                  aria-label={t("settings.networkScan.refresh")}
                  onClick={beginScan}
                />
              )}
            </div>

            {switchDevices.map((entry) => {
              const { saved, discovered } = entry;
              return (
                <DeviceRow
                  key={entry.key}
                  entry={{
                    address: saved
                      ? saved.endpoint.address
                      : displayDiscoveredDeviceAddress(discovered!),
                    name: saved?.record.name || discovered?.name,
                    platform: saved?.record.platform || discovered?.platform,
                    version: saved?.record.version || discovered?.version,
                    ...(discovered?.hostname && discovered.addresses.length > 0
                      ? { resolvedAddresses: discovered.addresses }
                      : {}),
                  }}
                  onSelect={() => selectDevice(entry)}
                />
              );
            })}

            {isScanning && (
              <p
                className="text-muted-foreground flex items-center gap-2 text-sm"
                role="status"
              >
                <Loader2
                  size={16}
                  className="animate-spin"
                  aria-hidden="true"
                />
                {t("settings.networkScan.searching")}
              </p>
            )}
            {error && (
              <p className="text-error text-sm" role="alert">
                {error}
              </p>
            )}
            {!isScanning && !error && switchDevices.length === 0 && (
              <p className="text-muted-foreground text-sm" role="status">
                {t("settings.networkScan.noOtherDevices")}
              </p>
            )}
          </section>
        )}

        <ModalActionBar
          primaryAction={
            <Button
              variant="secondary"
              label={t("scan.deviceSheetAllDevices")}
              onClick={() => {
                close();
                void router.navigate({ to: "/settings/devices" });
              }}
            />
          }
        />
      </div>
    </SlideModal>
  );
}
