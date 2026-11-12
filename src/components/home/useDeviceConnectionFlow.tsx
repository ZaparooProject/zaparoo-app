import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import { useRouter } from "@tanstack/react-router";
import { RefreshCwIcon } from "lucide-react";
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
import { identifyBluetoothDevice } from "@/lib/transport/ble/identify";
import type { NearbyBluetoothDevice } from "@/lib/transport/ble/scanner";

const DEVICE_SCAN_DURATION_MS = 5_000;

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

interface SwitchDevice {
  key: string;
  saved?: SavedDevice;
  discovered?: DiscoveredDevice;
}

interface DeviceConnectionFlowOptions {
  /** Discovery runs and drafts are kept only while the flow is on screen. */
  isOpen: boolean;
  /** Dismisses the hosting sheet; the Devices page has nothing to dismiss. */
  close?: () => void;
  /** Runs when a flow without a sheet completes and stays on screen. */
  onSettled?: () => void;
}

/**
 * Device selection, discovery and manual entry, without a shell. The phone
 * sheet and the Devices page each place the returned title, body and footer in
 * their own chrome.
 */
export function useDeviceConnectionFlow({
  isOpen,
  close,
  onSettled,
}: DeviceConnectionFlowOptions) {
  const presentation = close ? "sheet" : "page";
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
  const switchHeadingId = useId();
  const nearbyHeadingId = useId();
  const [identifying, setIdentifying] = useState<string | null>(null);
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

  const finish = () => {
    if (close) {
      close();
      return;
    }
    onSettled?.();
    setEnteringAddress(false);
    setAddressError("");
  };

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

    if (presentation === "page") return discoveredEntries;
    return [...savedEntries, ...discoveredEntries].filter(
      (entry) =>
        !isConnected || entry.saved?.record.recordId !== activeRecordId,
    );
  }, [activeRecordId, devices, isConnected, savedDevices, presentation]);

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
    if (!isOpen || enteringAddress || !appUi.enabled) {
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
    stopScan,
  ]);

  const selectDevice = (entry: SwitchDevice) => {
    if (entry.saved) {
      void selectRecord(entry.saved.record.recordId);
    } else if (entry.discovered) {
      void selectScanDevice(discoveredDeviceToRegistration(entry.discovered));
    }
    finish();
  };

  const bluetooth = useBluetoothScan(
    isOpen && !enteringAddress && appUi.enabled,
    DEVICE_SCAN_DURATION_MS,
  );
  const nearbyDevices = useMemo(() => {
    // Every Core the scan finds is listed. One this phone already saved is
    // marked so, rather than hidden, so a stale record never makes it vanish.
    const saved = new Map<string, DeviceRecord>();
    for (const record of Object.values(records)) {
      const peripheralId = record.ble?.peripheralId;
      if (!peripheralId) continue;
      const current = saved.get(peripheralId);
      if (
        !current ||
        (record.lastConnectedAt ?? 0) > (current.lastConnectedAt ?? 0)
      ) {
        saved.set(peripheralId, record);
      }
    }
    return bluetooth.devices
      .map((device) => ({ device, saved: saved.get(device.peripheralId) }))
      .sort(
        (left, right) =>
          (right.device.rssi ?? -999) - (left.device.rssi ?? -999),
      );
  }, [bluetooth.devices, records]);
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

  const selectSavedNearby = (recordId: string) => {
    void selectRecord(recordId);
    finish();
  };

  const pairNearbyAgain = async (recordId: string) => {
    await selectRecord(recordId);
    openPairingModal();
    finish();
  };

  const selectNearby = async (device: NearbyBluetoothDevice) => {
    if (identifying) return;
    setIdentifying(device.peripheralId);
    setNearbyError(false);
    try {
      const info = await identifyBluetoothDevice(device.peripheralId);
      await selectBluetoothDevice({
        deviceId: info.deviceId,
        peripheralId: device.peripheralId,
        ...(device.name ? { name: device.name } : {}),
      });
      finish();
    } catch (error) {
      logger.warn("Could not reach the Bluetooth device", error, {
        category: "bluetooth",
        action: "identify",
      });
      setNearbyError(true);
    } finally {
      setIdentifying(null);
    }
  };

  const showSwitchList = appUi.enabled || switchDevices.length > 0;

  const footer = enteringAddress ? (
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
      {enteringAddress ? (
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
            aria-labelledby={showSwitchList ? switchHeadingId : undefined}
          >
            {showSwitchList && (
              <div className="flex min-h-12 items-center justify-between gap-2">
                {presentation === "page" ? (
                  // A Settings page section, not a Home/status heading.
                  <h2 id={switchHeadingId} className="text-lg font-semibold">
                    {t("settings.networkScan.title")}
                  </h2>
                ) : (
                  <h3
                    id={switchHeadingId}
                    className="text-muted-foreground font-bold capitalize"
                  >
                    {t("scan.deviceSheetRecent")}
                  </h3>
                )}
                {appUi.enabled && (
                  <Button
                    icon={
                      isScanning ? (
                        <LoadingSpinner size={20} decorative />
                      ) : (
                        <RefreshCwIcon size={20} />
                      )
                    }
                    variant="ghost"
                    shape="square"
                    size="sm"
                    disabled={isScanning}
                    disabledAppearance={isScanning ? "busy" : "unavailable"}
                    aria-label={t("settings.networkScan.refresh")}
                    aria-busy={isScanning}
                    onClick={beginScan}
                  />
                )}
              </div>
            )}

            {switchDevices.map((entry) => {
              const { saved, discovered } = entry;
              return (
                <DeviceRow
                  key={entry.key}
                  entry={{
                    address: saved
                      ? (saved.endpoint?.address ??
                        t("settings.bluetoothScan.viaBluetooth"))
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

            <p className="sr-only" role="status">
              {isScanning ? t("settings.networkScan.searching") : ""}
            </p>
            {error && (
              <p className="text-error text-sm" role="alert">
                {t(error)}
              </p>
            )}
            {showSwitchList &&
              !isScanning &&
              !error &&
              switchDevices.length === 0 && (
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
          </section>
          {showNearby && (
            <section
              className="flex flex-col gap-2"
              aria-labelledby={nearbyHeadingId}
              aria-busy={identifying !== null}
            >
              <div className="flex min-h-12 items-center justify-between gap-2">
                {presentation === "page" ? (
                  <h2 id={nearbyHeadingId} className="text-lg font-semibold">
                    {t("settings.bluetoothScan.title")}
                  </h2>
                ) : (
                  <h3
                    id={nearbyHeadingId}
                    className="text-muted-foreground font-bold"
                  >
                    {t("settings.bluetoothScan.title")}
                  </h3>
                )}
                <Button
                  icon={
                    bluetooth.isScanning ? (
                      <LoadingSpinner size={20} decorative />
                    ) : (
                      <RefreshCwIcon size={20} />
                    )
                  }
                  variant="ghost"
                  shape="square"
                  size="sm"
                  disabled={bluetooth.isScanning}
                  disabledAppearance={
                    bluetooth.isScanning ? "busy" : "unavailable"
                  }
                  aria-label={t("settings.bluetoothScan.refresh")}
                  aria-busy={bluetooth.isScanning}
                  onClick={() => void bluetooth.rescan()}
                />
              </div>
              {nearbyDevices.map(({ device, saved }) => (
                <DeviceRow
                  key={device.peripheralId}
                  entry={{
                    name:
                      identifying === device.peripheralId
                        ? t("settings.bluetoothScan.connecting")
                        : saved?.name ||
                          device.name ||
                          t("settings.bluetoothScan.unnamed"),
                    address: t(
                      saved
                        ? "settings.bluetoothScan.savedViaBluetooth"
                        : "settings.bluetoothScan.viaBluetooth",
                    ),
                  }}
                  onSelect={() =>
                    saved
                      ? selectSavedNearby(saved.recordId)
                      : void selectNearby(device)
                  }
                  rightSlot={
                    saved ? (
                      <Button
                        variant="secondary"
                        size="sm"
                        label={t("settings.bluetoothScan.pairAgain")}
                        onClick={() => void pairNearbyAgain(saved.recordId)}
                      />
                    ) : undefined
                  }
                />
              ))}
              <p className="sr-only" role="status">
                {bluetooth.isScanning
                  ? t("settings.bluetoothScan.searching")
                  : ""}
              </p>
              {nearbyProblem && (
                <div className="flex flex-col gap-2">
                  <p className="text-muted-foreground text-sm" role="status">
                    {t(nearbyProblem)}
                  </p>
                  {bluetooth.canOpenSettings && (
                    <Button
                      variant="secondary"
                      label={t("settings.bluetoothScan.openSettings")}
                      onClick={bluetooth.openSettings}
                    />
                  )}
                </div>
              )}
              {nearbyError && (
                <p className="text-error text-sm" role="alert">
                  {t("settings.bluetoothScan.connectFailed")}
                </p>
              )}
              {!nearbyProblem &&
                bluetooth.readiness === "ready" &&
                !bluetooth.isScanning &&
                nearbyDevices.length === 0 && (
                  <p className="text-muted-foreground text-sm" role="status">
                    {t("settings.bluetoothScan.noDevices")}
                  </p>
                )}
            </section>
          )}
          {presentation === "sheet" && (
            <Button
              variant="text"
              label={t("scan.deviceSheetAllDevices")}
              onClick={() => {
                close?.();
                void router.navigate({ to: "/settings/devices" });
              }}
            />
          )}
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
