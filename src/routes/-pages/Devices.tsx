import { useEffect, useMemo, useState } from "react";
import { useRouter } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { PlusIcon } from "lucide-react";
import { DeviceSheet } from "@/components/home/DeviceSheet";
import { useConnection } from "@/hooks/useConnection";
import { useDeviceSheetController } from "@/hooks/useDeviceSheetController";
import { usePageHeadingFocus } from "@/hooks/usePageHeadingFocus";
import {
  credentialKeyForRecord,
  credentialStore,
} from "@/lib/crypto/credentials";
import {
  deviceRegistry,
  parsedEndpointForRecord,
  useDeviceRegistry,
  type DeviceRecord,
} from "@/lib/devices/deviceRegistry";
import { logger } from "@/lib/logger";
import { appBackNavigationOptions } from "@/lib/tabSessionStore";
import { PageFrame } from "@/components/PageFrame";
import { HeaderButton } from "@/components/wui/HeaderButton";
import { Button } from "@/components/wui/Button";
import { EmptyState } from "@/components/wui/EmptyState";
import { DelayedLoading } from "@/components/DelayedLoading";
import { InlineLoading } from "@/components/InlineLoading";
import { useStatusStore } from "@/lib/store";
import { BackIcon } from "@/lib/images";
import { DeviceRow } from "@/components/DeviceRow";

interface DeviceListEntry {
  record: DeviceRecord;
  /** The network address; absent for a device known only over Bluetooth. */
  address?: string;
}

const selectRecords = (state: { records: Record<string, DeviceRecord> }) =>
  state.records;
const selectActiveRecordId = (state: { activeRecordId: string | null }) =>
  state.activeRecordId;
const selectHydrationError = (state: { hydrationError: string | null }) =>
  state.hydrationError;
/**
 * True once the stored devices have been read, either successfully or not.
 * A failed read never becomes hydrated, so gating on `hydrated` alone would
 * hold this page on the spinner instead of showing the error.
 */
const selectRegistrySettled = (state: {
  hydrated: boolean;
  hydrationError: string | null;
}) => state.hydrated || state.hydrationError !== null;

export function Devices() {
  const { t } = useTranslation();
  const headingRef = usePageHeadingFocus<HTMLHeadingElement>(
    t("scan.deviceSheetAllDevices"),
  );
  const router = useRouter();
  const goBack = () =>
    void router.navigate(appBackNavigationOptions("/settings"));

  const records = useDeviceRegistry(selectRecords);
  const activeRecordId = useDeviceRegistry(selectActiveRecordId);
  // A registry that failed to load also has no records, and the empty state
  // would tell the user they have never saved a device — the opposite of what
  // happened, and an invitation to re-pair devices they already own.
  const hydrationError = useDeviceRegistry(selectHydrationError);
  // Records arrive asynchronously, so before the read lands this page looks
  // exactly like one belonging to a user who has never saved a device — the
  // same misleading empty state, just from a different cause.
  const registrySettled = useDeviceRegistry(selectRegistrySettled);
  const { isConnected } = useConnection();
  const {
    isOpen: sheetOpen,
    setOpen: setSheetOpen,
    shared: sharedSheet,
  } = useDeviceSheetController();

  const [pairedKeys, setPairedKeys] = useState<Set<string>>(new Set());

  // Pairing stores a credential and restarts the connection, so the lock
  // icons are re-read whenever the encryption state settles again.
  const encryptionState = useStatusStore((state) => state.encryptionState);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const entries = await credentialStore.list();
        if (cancelled) return;
        setPairedKeys(new Set(entries.map((e) => e.deviceKey)));
      } catch (err) {
        if (cancelled) return;
        logger.warn("Failed to list paired credentials", err, {
          category: "storage",
          action: "listCredentials",
          severity: "warning",
        });
        setPairedKeys(new Set());
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [encryptionState, isConnected]);

  const sortedRecords = useMemo(() => {
    return Object.values(records)
      .flatMap((record): DeviceListEntry[] => {
        const endpoint = parsedEndpointForRecord(record);
        if (endpoint) return [{ record, address: endpoint.address }];
        if (record.ble) return [{ record }];
        // A record with no parseable endpoint is unreachable and cannot be
        // rendered, so it is dropped — but silently vanishing from the list
        // looks to the user like the app forgot their device. Name it so the
        // stored value can be recovered from a report.
        logger.warn("Device record has no usable endpoint", {
          category: "storage",
          action: "listDeviceRecords",
          recordId: record.recordId,
          preferredEndpointId: record.preferredEndpointId,
        });
        return [];
      })
      .sort(
        (left, right) =>
          (right.record.lastConnectedAt ?? 0) -
          (left.record.lastConnectedAt ?? 0),
      );
  }, [records]);

  const hasCredentials = (record: DeviceRecord) =>
    pairedKeys.has(credentialKeyForRecord(record.recordId)) ||
    (record.legacyCredentialKey !== undefined &&
      pairedKeys.has(record.legacyCredentialKey));

  return (
    <PageFrame
      className="wrap-anywhere"
      headerMode="content-wide"
      breadcrumbs={[{ to: "/settings", label: t("settings.title") }]}
      onSwipeBack={goBack}
      headerLeft={
        <HeaderButton
          onClick={goBack}
          icon={<BackIcon size="24" />}
          aria-label={t("nav.back")}
        />
      }
      headerCenter={<h1 ref={headingRef}>{t("scan.deviceSheetAllDevices")}</h1>}
    >
      <section
        aria-labelledby="saved-devices-heading"
        className="flex min-w-0 flex-col gap-3"
      >
        <h2 id="saved-devices-heading" className="text-lg font-semibold">
          {t("settings.savedDevices")}
        </h2>
        {!registrySettled ? (
          <DelayedLoading>
            <InlineLoading label={t("settings.deviceHistoryLoading")} />
          </DelayedLoading>
        ) : sortedRecords.length === 0 ? (
          <EmptyState
            size="compact"
            title={t(
              hydrationError
                ? "settings.deviceHistoryError"
                : "settings.deviceHistoryEmpty",
            )}
            action={
              hydrationError ? (
                <Button
                  variant="outline"
                  label={t("scan.retry")}
                  onClick={() => void deviceRegistry.hydrate()}
                />
              ) : undefined
            }
          />
        ) : (
          sortedRecords.map(({ record, address }) => (
            <DeviceRow
              key={record.recordId}
              entry={{
                name:
                  record.name || address || t("settings.bluetoothScan.unnamed"),
                ...(record.platform ? { detail: record.platform } : {}),
              }}
              isActive={isConnected && activeRecordId === record.recordId}
              // A record migrated from an older build still holds its pairing
              // under the pre-V2 address key until its first encrypted connect,
              // so the lock icon has to accept either key.
              isPaired={hasCredentials(record)}
              onSelect={() =>
                void router.navigate({
                  to: "/settings/devices/$recordId",
                  params: { recordId: record.recordId },
                })
              }
            />
          ))
        )}
        {registrySettled && (
          <Button
            label={t("settings.addDevice")}
            variant="secondary"
            icon={<PlusIcon size={20} />}
            className="w-full"
            aria-expanded={sheetOpen}
            onClick={() => setSheetOpen(true)}
          />
        )}
      </section>
      {!sharedSheet && (
        <DeviceSheet isOpen={sheetOpen} close={() => setSheetOpen(false)} />
      )}
    </PageFrame>
  );
}
