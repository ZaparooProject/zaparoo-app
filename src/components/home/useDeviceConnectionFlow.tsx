import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useRouter } from "@tanstack/react-router";
import { KeyRoundIcon, RefreshCwIcon } from "lucide-react";
import { DeviceRow } from "@/components/DeviceRow";
import { ActiveDeviceStatus } from "@/components/home/ActiveDeviceStatus";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { Button } from "@/components/wui/Button";
import { Card } from "@/components/wui/Card";
import { NextIcon } from "@/lib/images";
import { TextInput } from "@/components/wui/TextInput";
import { useAppUi } from "@/hooks/useAppUi";
import { useConnection } from "@/hooks/useConnection";
import { useActiveDeviceSummary } from "@/hooks/useDevicePresentation";
import { useBluetoothScan } from "@/hooks/useBluetoothScan";
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
import { logger } from "@/lib/logger";
import {
  identifyBluetoothDevice,
  type IdentifyStep,
} from "@/lib/transport/ble/identify";
import { BleLinkAbortedError } from "@/lib/transport/ble/link";
import type { NearbyBluetoothDevice } from "@/lib/transport/ble/scanner";

const DEVICE_SCAN_DURATION_MS = 5_000;
/** How long a Bluetooth connection runs before it is called slow but fine. */
export const IDENTIFY_SLOW_AFTER_MS = 6_000;

const IDENTIFY_STEP_MESSAGES = {
  connecting: "settings.bluetoothScan.connecting",
  pairing: "settings.bluetoothScan.stepPairing",
  securing: "settings.bluetoothScan.stepSecuring",
  reading: "settings.bluetoothScan.stepReading",
} as const satisfies Record<IdentifyStep, string>;

/** A Bluetooth device being reached for the first time. */
interface IdentifyProgress {
  peripheralId: string;
  name: string;
  step: IdentifyStep;
  slow: boolean;
}

const selectRecords = (snapshot: DeviceRegistrySnapshot) => snapshot.records;
const selectActiveRecordId = (snapshot: DeviceRegistrySnapshot) =>
  snapshot.activeRecordId;

interface SavedDevice {
  record: DeviceRecord;
  /** Null for a device known only over Bluetooth. */
  endpoint: ParsedDeviceEndpoint | null;
}

const BLUETOOTH_READINESS_MESSAGES = {
  disabled: "settings.bluetoothScan.disabled",
  denied: "settings.bluetoothScan.denied",
  location_off: "settings.bluetoothScan.locationOff",
} as const;

/**
 * One row of the list. A saved device carries whatever the scans found of it;
 * a device found for the first time carries the one scan result it came from.
 */
interface ListedDevice {
  key: string;
  saved?: SavedDevice;
  discovered?: DiscoveredDevice;
  nearby?: NearbyBluetoothDevice;
}

interface DeviceConnectionFlowOptions {
  /** Discovery runs and drafts are kept only while the flow is on screen. */
  isOpen: boolean;
  /** Dismisses the hosting sheet. */
  close: () => void;
}

/**
 * Device selection, discovery and manual entry, without a shell: the sheet
 * places the returned title, body and footer in its own chrome.
 */
export function useDeviceConnectionFlow({
  isOpen,
  close,
}: DeviceConnectionFlowOptions) {
  const { t } = useTranslation();
  const router = useRouter();
  const appUi = useAppUi();
  const { isConnected, openPairingModal } = useConnection();
  const {
    selectRecord,
    selectScanDevice,
    selectDevice: selectAddress,
    selectBluetoothDevice,
  } = useSelectDevice();
  const { devices, isScanning, error, startScan, stopScan } = useNetworkScan();
  const { address: activeAddress, bluetoothOnly: activeBluetoothOnly } =
    useActiveDeviceSummary();
  const records = useDeviceRegistry(selectRecords);
  const activeRecordId = useDeviceRegistry(selectActiveRecordId);
  const [identifying, setIdentifying] = useState<IdentifyProgress | null>(null);
  const identifyAbortRef = useRef<AbortController | null>(null);
  const [nearbyError, setNearbyError] = useState(false);
  const scanTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [enteringAddress, setEnteringAddress] = useState(false);
  const [address, setAddress] = useState("");
  const [addressError, setAddressError] = useState("");
  const [wasOpen, setWasOpen] = useState(isOpen);
  const addressInputRef = useRef<HTMLInputElement>(null);
  const enterAddressRef = useRef<HTMLDivElement>(null);
  const wasEnteringAddressRef = useRef(false);

  if (isOpen !== wasOpen) {
    setWasOpen(isOpen);
    setEnteringAddress(false);
    setAddressError("");
    setIdentifying(null);
  }

  useEffect(() => {
    if (isOpen) {
      if (enteringAddress) addressInputRef.current?.focus();
      else if (wasEnteringAddressRef.current) {
        // The wrapper exists only to reach the card it contains.
        const card = enterAddressRef.current?.firstElementChild;
        if (card instanceof HTMLElement) card.focus();
      }
    }
    wasEnteringAddressRef.current = enteringAddress;
  }, [isOpen, enteringAddress]);

  const finish = close;

  const openAddressEntry = () => {
    setAddress(activeBluetoothOnly ? "" : activeAddress);
    setAddressError("");
    setEnteringAddress(true);
  };

  const connectByAddress = () => {
    const result = selectAddress(address);
    if (!result.ok) {
      setAddressError(t(result.errorKey));
      addressInputRef.current?.focus();
      return;
    }
    finish();
  };

  const savedDevices = useMemo(() => {
    return Object.values(records)
      .flatMap((record) => {
        const endpoint = parsedEndpointForRecord(record);
        return endpoint || record.ble ? [{ record, endpoint }] : [];
      })
      .sort(
        (left, right) =>
          (right.record.lastConnectedAt ?? 0) -
          (left.record.lastConnectedAt ?? 0),
      );
  }, [records]);

  const isIdentifying = identifying !== null;
  const identifyingId = identifying?.peripheralId;

  const abortIdentify = useCallback(() => {
    identifyAbortRef.current?.abort();
    identifyAbortRef.current = null;
  }, []);
  const cancelIdentify = () => {
    abortIdentify();
    setIdentifying(null);
  };

  // A sheet that closes takes its connection attempt with it.
  useEffect(() => {
    if (!isOpen) abortIdentify();
  }, [abortIdentify, isOpen]);
  useEffect(() => abortIdentify, [abortIdentify]);

  useEffect(() => {
    if (identifyingId === undefined) return;
    const timer = setTimeout(() => {
      setIdentifying((current) =>
        current?.peripheralId === identifyingId
          ? { ...current, slow: true }
          : current,
      );
    }, IDENTIFY_SLOW_AFTER_MS);
    return () => clearTimeout(timer);
  }, [identifyingId]);

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
    if (!isOpen || enteringAddress || isIdentifying || !appUi.enabled) {
      clearScanTimer();
      stopScan();
      return;
    }

    beginScan();
    return () => {
      clearScanTimer();
      stopScan();
    };
  }, [
    appUi.enabled,
    beginScan,
    clearScanTimer,
    isOpen,
    enteringAddress,
    isIdentifying,
    stopScan,
  ]);

  const bluetooth = useBluetoothScan(
    isOpen && !enteringAddress && !isIdentifying && appUi.enabled,
    DEVICE_SCAN_DURATION_MS,
  );
  const nearbyFound = bluetooth.devices;

  const listedDevices = useMemo(() => {
    const newDiscovered = new Map(
      devices.map((device) => [getDiscoveredDeviceIdentity(device), device]),
    );
    const newNearby = new Map(
      nearbyFound.map((device) => [device.peripheralId, device]),
    );
    const savedEntries: ListedDevice[] = savedDevices.map((saved) => {
      const discovered = devices.find((device) =>
        discoveredDeviceMatchesRecord(device, saved.record),
      );
      if (discovered) {
        newDiscovered.delete(getDiscoveredDeviceIdentity(discovered));
      }
      const peripheralId = saved.record.ble?.peripheralId;
      const nearby = peripheralId
        ? nearbyFound.find((device) => device.peripheralId === peripheralId)
        : undefined;
      if (nearby) newNearby.delete(nearby.peripheralId);
      return {
        key: `saved:${saved.record.recordId}`,
        saved,
        ...(discovered ? { discovered } : {}),
        ...(nearby ? { nearby } : {}),
      };
    });
    const discoveredEntries = [...newDiscovered.values()]
      .sort((left, right) =>
        (left.name || left.address).localeCompare(right.name || right.address),
      )
      .map(
        (discovered): ListedDevice => ({
          key: `discovered:${getDiscoveredDeviceIdentity(discovered)}`,
          discovered,
        }),
      );
    const nearbyEntries = [...newNearby.values()]
      .sort((left, right) => (right.rssi ?? -999) - (left.rssi ?? -999))
      .map(
        (nearby): ListedDevice => ({
          key: `nearby:${nearby.peripheralId}`,
          nearby,
        }),
      );

    // Devices found for the first time, then the saved ones by last use.
    // Saved devices keep that order whatever the scans see, so a row never
    // moves under a finger as results arrive.
    return [...discoveredEntries, ...nearbyEntries, ...savedEntries].filter(
      (entry) =>
        !isConnected || entry.saved?.record.recordId !== activeRecordId,
    );
  }, [activeRecordId, devices, isConnected, nearbyFound, savedDevices]);

  const rows = useMemo(() => {
    const named = listedDevices.map((entry) => {
      const { saved, discovered, nearby } = entry;
      const address =
        saved?.endpoint?.address ??
        (discovered ? displayDiscoveredDeviceAddress(discovered) : undefined);
      return {
        entry,
        name:
          saved?.record.name ||
          discovered?.name ||
          address ||
          nearby?.name ||
          t("settings.bluetoothScan.unnamed"),
        platform: saved?.record.platform || discovered?.platform,
        // What tells this row apart from another with the same name.
        distinction: address ?? t("settings.bluetoothScan.viaBluetooth"),
      };
    });
    const nameCounts = new Map<string, number>();
    for (const row of named) {
      nameCounts.set(row.name, (nameCounts.get(row.name) ?? 0) + 1);
    }
    return named.map((row) => ({
      entry: row.entry,
      name: row.name,
      detail: [
        row.platform,
        (nameCounts.get(row.name) ?? 0) > 1 && row.distinction !== row.name
          ? row.distinction
          : undefined,
      ]
        .filter(Boolean)
        .join(" · "),
    }));
  }, [listedDevices, t]);

  const showNearby =
    bluetooth.supported &&
    appUi.enabled &&
    bluetooth.readiness !== "unsupported";
  const nearbyProblem =
    bluetooth.readiness && bluetooth.readiness in BLUETOOTH_READINESS_MESSAGES
      ? BLUETOOTH_READINESS_MESSAGES[
          bluetooth.readiness as keyof typeof BLUETOOTH_READINESS_MESSAGES
        ]
      : null;

  const pairAgain = async (recordId: string) => {
    await selectRecord(recordId);
    openPairingModal();
    finish();
  };

  const selectNearby = async (device: NearbyBluetoothDevice, name: string) => {
    if (identifyAbortRef.current) return;
    const controller = new AbortController();
    identifyAbortRef.current = controller;
    const { peripheralId } = device;
    setIdentifying({ peripheralId, name, step: "connecting", slow: false });
    setNearbyError(false);
    try {
      const info = await identifyBluetoothDevice(peripheralId, {
        signal: controller.signal,
        onStep: (step) =>
          setIdentifying((current) =>
            current?.peripheralId === peripheralId
              ? { ...current, step }
              : current,
          ),
      });
      if (controller.signal.aborted) return;
      await selectBluetoothDevice({
        deviceId: info.deviceId,
        peripheralId,
        ...(device.name ? { name: device.name } : {}),
      });
      finish();
    } catch (error) {
      if (error instanceof BleLinkAbortedError) return;
      logger.warn("Could not reach the Bluetooth device", error, {
        category: "bluetooth",
        action: "identify",
      });
      setNearbyError(true);
    } finally {
      if (identifyAbortRef.current === controller) {
        identifyAbortRef.current = null;
        setIdentifying(null);
      }
    }
  };

  const selectDevice = (entry: ListedDevice, name: string) => {
    if (entry.saved) {
      void selectRecord(entry.saved.record.recordId);
      finish();
    } else if (entry.discovered) {
      void selectScanDevice(discoveredDeviceToRegistration(entry.discovered));
      finish();
    } else if (entry.nearby) {
      void selectNearby(entry.nearby, name);
    }
  };

  const scanning = isScanning || bluetooth.isScanning;
  const rescan = () => {
    beginScan();
    void bluetooth.rescan();
  };

  const showSwitchList = appUi.enabled || listedDevices.length > 0;

  const newRows = rows.filter((row) => row.entry.saved === undefined);
  const savedRows = rows.filter((row) => row.entry.saved !== undefined);
  // With only new devices to show, a heading over no saved ones says nothing.
  const showSavedHeading =
    showSwitchList && (savedRows.length > 0 || newRows.length === 0);

  const refreshButton = appUi.enabled ? (
    <Button
      icon={
        scanning ? (
          <LoadingSpinner size={20} decorative />
        ) : (
          <RefreshCwIcon size={20} />
        )
      }
      variant="ghost"
      shape="square"
      size="sm"
      disabled={scanning}
      disabledAppearance={scanning ? "busy" : "unavailable"}
      aria-label={t("settings.networkScan.refresh")}
      aria-busy={scanning}
      onClick={rescan}
    />
  ) : null;

  const renderRow = ({ entry, name, detail }: (typeof rows)[number]) => {
    const record = entry.saved?.record;
    const reachable =
      entry.discovered !== undefined || entry.nearby !== undefined;
    return (
      <DeviceRow
        key={entry.key}
        entry={{ name, ...(detail ? { detail } : {}) }}
        onSelect={() => selectDevice(entry, name)}
        rightSlot={
          // Pairing needs the device in reach, so the action is
          // offered only for a saved device a scan can see.
          record && reachable ? (
            <Button
              icon={<KeyRoundIcon size={20} />}
              variant="ghost"
              shape="square"
              aria-label={t("settings.pairDevice", { device: name })}
              onClick={() => void pairAgain(record.recordId)}
            />
          ) : undefined
        }
      />
    );
  };

  const footer = identifying ? (
    <Button
      variant="secondary"
      label={t("nav.cancel")}
      onClick={cancelIdentify}
      className="w-full"
    />
  ) : enteringAddress ? (
    <div className="wui-action-grid [&>*]:min-h-12 [&>*]:w-full [&>*]:max-w-none">
      <Button
        variant="secondary"
        label={t("nav.cancel")}
        onClick={() => setEnteringAddress(false)}
      />
      <Button
        intent="primary"
        label={t("settings.deviceSetup.connect")}
        onClick={connectByAddress}
      />
    </div>
  ) : undefined;
  const content = (
    <>
      {identifying ? (
        <div className="flex flex-col items-center gap-4 py-8 text-center">
          <LoadingSpinner size={32} decorative />
          <p className="text-foreground text-lg font-semibold wrap-anywhere">
            {identifying.name}
          </p>
          <p className="text-foreground" role="status">
            {t(IDENTIFY_STEP_MESSAGES[identifying.step])}
          </p>
          {identifying.slow && (
            <p className="text-muted-foreground text-sm" role="status">
              {t("settings.bluetoothScan.stillWorking")}
            </p>
          )}
        </div>
      ) : enteringAddress ? (
        // Enter submits on keydown through the form, so the keypress that
        // opened this view cannot also submit it when the key is released.
        <form
          className="py-2"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            connectByAddress();
          }}
        >
          <TextInput
            ref={addressInputRef}
            label={t("settings.device")}
            placeholder="192.168.1.23"
            value={address}
            setValue={(value) => {
              setAddress(value);
              setAddressError("");
            }}
            inputMode="url"
            autoComplete="off"
            error={addressError}
            // Escape leaves the address entry first; a sheet around it stays
            // open for the next Escape.
            onKeyDown={(event) => {
              if (event.key !== "Escape") return;
              event.stopPropagation();
              setEnteringAddress(false);
              setAddressError("");
            }}
          />
        </form>
      ) : (
        <div className="flex flex-col gap-4 py-2">
          <ActiveDeviceStatus onPair={finish} />

          <section
            className="flex flex-col gap-2"
            // One name whichever groups are showing.
            aria-label={
              showSwitchList || rows.length > 0
                ? t("scan.deviceSheetRecent")
                : undefined
            }
          >
            {newRows.length > 0 && (
              <div className="flex min-h-12 items-center justify-between gap-2">
                <h3 className="text-muted-foreground font-bold">
                  {t("settings.newDevices")}
                </h3>
                {refreshButton}
              </div>
            )}
            {newRows.map(renderRow)}

            {showSavedHeading && (
              <div className="flex min-h-12 items-center justify-between gap-2">
                <h3 className="text-muted-foreground font-bold capitalize">
                  {t("scan.deviceSheetRecent")}
                </h3>
                {newRows.length === 0 && refreshButton}
              </div>
            )}
            {savedRows.map(renderRow)}

            <p className="sr-only" role="status">
              {scanning ? t("settings.networkScan.searching") : ""}
            </p>
            {error && (
              <p className="text-error text-sm" role="alert">
                {t(error)}
              </p>
            )}
            {nearbyError && (
              <p className="text-error text-sm" role="alert">
                {t("settings.bluetoothScan.connectFailed")}
              </p>
            )}
            {showSwitchList &&
              !scanning &&
              !error &&
              listedDevices.length === 0 && (
                <p className="text-muted-foreground text-sm" role="status">
                  {t("settings.networkScan.noOtherDevices")}
                </p>
              )}
            <div ref={enterAddressRef}>
              <Card
                onClick={openAddressEntry}
                className="flex min-h-12 items-center justify-between gap-3"
              >
                <span className="text-foreground font-medium">
                  {t("settings.deviceSetup.addDeviceManually")}
                </span>
                <NextIcon size="20" />
              </Card>
            </div>
            {showNearby && nearbyProblem && (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-muted-foreground text-sm" role="status">
                  {t(nearbyProblem)}
                </p>
                {bluetooth.canOpenSettings && (
                  <Button
                    variant="text"
                    size="sm"
                    label={t("settings.bluetoothScan.openSettings")}
                    onClick={bluetooth.openSettings}
                  />
                )}
              </div>
            )}
          </section>
          <Button
            variant="text"
            label={t("scan.deviceSheetAllDevices")}
            onClick={() => {
              close();
              void router.navigate({ to: "/settings/devices" });
            }}
          />
        </div>
      )}
    </>
  );
  return {
    title: t(
      enteringAddress
        ? "settings.deviceSetup.enterAddress"
        : "scan.deviceSheetTitle",
    ),
    content,
    footer,
  };
}
