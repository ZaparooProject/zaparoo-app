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
  const { isConnected } = useConnection();
  const {
    selectRecord,
    selectScanDevice,
    selectDevice: selectAddress,
  } = useSelectDevice();
  const { devices, isScanning, error, startScan, stopScan } = useNetworkScan();
  const { address: activeAddress } = useActiveDeviceSummary();
  const records = useDeviceRegistry(selectRecords);
  const activeRecordId = useDeviceRegistry(selectActiveRecordId);
  const switchHeadingId = useId();
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
    setAddress(activeAddress);
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
