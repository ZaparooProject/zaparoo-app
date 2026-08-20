import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Link, useRouter } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { ListChecks, Pencil, X } from "lucide-react";
import { useConnection } from "@/hooks/useConnection";
import { usePageHeadingFocus } from "@/hooks/usePageHeadingFocus";
import { useSelectDevice } from "@/hooks/useSelectDevice";
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
import type { ParsedDeviceEndpoint } from "@/lib/devices/endpoint";
import { invalidateLibraryImageCache } from "@/lib/libraryImageCache";
import { logger } from "@/lib/logger";
import { appBackNavigationOptions } from "@/lib/tabSessionStore";
import { PageFrame } from "@/components/PageFrame";
import { HeaderButton } from "@/components/wui/HeaderButton";
import { Button } from "@/components/wui/Button";
import { EmptyState } from "@/components/wui/EmptyState";
import { ModalActionBar } from "@/components/wui/ModalActionBar";
import { SlideModal } from "@/components/SlideModal";
import { Checkbox } from "@/components/ui/checkbox";
import { DelayedLoading } from "@/components/DelayedLoading";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { BackIcon } from "@/lib/images";
import { DeviceRow } from "@/components/DeviceRow";

interface DeviceListEntry {
  record: DeviceRecord;
  endpoint: ParsedDeviceEndpoint;
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
    t("settings.deviceHistory"),
  );
  const router = useRouter();
  const queryClient = useQueryClient();
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

  const { selectRecord } = useSelectDevice();
  const [pairedKeys, setPairedKeys] = useState<Set<string>>(new Set());
  const [isEditing, setIsEditing] = useState(false);
  const [selectedRecordIds, setSelectedRecordIds] = useState<Set<string>>(
    new Set(),
  );
  const [combineOpen, setCombineOpen] = useState(false);
  const [combineFailed, setCombineFailed] = useState(false);
  const [isCombining, setIsCombining] = useState(false);

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
  }, []);

  const sortedRecords = useMemo(() => {
    return Object.values(records)
      .flatMap((record) => {
        const endpoint = parsedEndpointForRecord(record);
        if (!endpoint) {
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
        }
        return [{ record, endpoint } satisfies DeviceListEntry];
      })
      .sort((left, right) =>
        (left.record.name || left.endpoint.address).localeCompare(
          right.record.name || right.endpoint.address,
        ),
      );
  }, [records]);

  const hasCredentials = (record: DeviceRecord) =>
    pairedKeys.has(credentialKeyForRecord(record.recordId)) ||
    (record.legacyCredentialKey !== undefined &&
      pairedKeys.has(record.legacyCredentialKey));

  const toggleSelected = (recordId: string) => {
    setSelectedRecordIds((current) => {
      const next = new Set(current);
      if (next.has(recordId)) {
        next.delete(recordId);
      } else if (next.size < 2) {
        next.add(recordId);
      }
      return next;
    });
  };

  const handleSelect = (recordId: string) => {
    if (isEditing) {
      toggleSelected(recordId);
      return;
    }
    void selectRecord(recordId);
    router.navigate({ to: "/settings" });
  };

  const closeEditMode = () => {
    if (isCombining) return;
    setIsEditing(false);
    setSelectedRecordIds(new Set());
    setCombineOpen(false);
    setCombineFailed(false);
  };

  const selectedRecords = [...selectedRecordIds]
    .map((recordId) => records[recordId])
    .filter((record): record is DeviceRecord => record !== undefined);
  const combineTarget =
    selectedRecords.find((record) => record.recordId === activeRecordId) ??
    selectedRecords.find(hasCredentials) ??
    selectedRecords[0];
  const combineSource = selectedRecords.find(
    (record) => record.recordId !== combineTarget?.recordId,
  );

  const handleConfirmCombine = async () => {
    if (!combineTarget || !combineSource || isCombining) return;
    setIsCombining(true);
    setCombineFailed(false);
    const mergedPairing =
      hasCredentials(combineTarget) || hasCredentials(combineSource);
    try {
      await deviceRegistry.mergeRecords(
        combineTarget.recordId,
        combineSource.recordId,
      );
      for (const recordId of [combineTarget.recordId, combineSource.recordId]) {
        invalidateLibraryImageCache(recordId);
        queryClient.removeQueries({
          predicate: (query) => query.queryKey.includes(recordId),
        });
      }
      const referencedLegacyKeys = new Set(
        Object.values(deviceRegistry.getSnapshot().records)
          .map((record) => record.legacyCredentialKey)
          .filter((key): key is string => key !== undefined),
      );
      setPairedKeys((current) => {
        const next = new Set(current);
        next.delete(credentialKeyForRecord(combineTarget.recordId));
        next.delete(credentialKeyForRecord(combineSource.recordId));
        if (
          combineTarget.legacyCredentialKey &&
          !referencedLegacyKeys.has(combineTarget.legacyCredentialKey)
        ) {
          next.delete(combineTarget.legacyCredentialKey);
        }
        if (
          combineSource.legacyCredentialKey &&
          !referencedLegacyKeys.has(combineSource.legacyCredentialKey)
        ) {
          next.delete(combineSource.legacyCredentialKey);
        }
        if (mergedPairing) {
          next.add(credentialKeyForRecord(combineTarget.recordId));
        }
        return next;
      });
      setIsEditing(false);
      setSelectedRecordIds(new Set());
      setCombineOpen(false);
      setCombineFailed(false);
    } catch (error) {
      logger.error("Failed to combine device records", error, {
        category: "storage",
        action: "combineDeviceRecords",
        severity: "error",
        targetRecordId: combineTarget.recordId,
        sourceRecordId: combineSource.recordId,
      });
      setCombineFailed(true);
    } finally {
      setIsCombining(false);
    }
  };

  return (
    <PageFrame
      onSwipeBack={goBack}
      headerLeft={
        <HeaderButton
          onClick={goBack}
          icon={<BackIcon size="24" />}
          aria-label={t("nav.back")}
        />
      }
      headerCenter={
        <h1 ref={headingRef} className="text-foreground text-xl">
          {t("settings.deviceHistory")}
        </h1>
      }
      headerRight={
        sortedRecords.length >= 2 ? (
          <HeaderButton
            onClick={() => {
              if (isEditing) {
                closeEditMode();
              } else {
                setIsEditing(true);
              }
            }}
            icon={isEditing ? <X size={20} /> : <ListChecks size={20} />}
            aria-label={t(
              isEditing
                ? "settings.deviceCombine.cancelEdit"
                : "settings.deviceCombine.edit",
            )}
            active={isEditing}
            disabled={isCombining}
          />
        ) : undefined
      }
    >
      <div className="flex flex-col gap-3 pt-2">
        {!registrySettled ? (
          <DelayedLoading>
            <div className="text-muted-foreground flex items-center justify-center gap-2 py-8">
              <LoadingSpinner size={16} className="text-primary" />
              <span>{t("settings.deviceHistoryLoading")}</span>
            </div>
          </DelayedLoading>
        ) : sortedRecords.length === 0 ? (
          <EmptyState
            size="compact"
            title={t(
              hydrationError
                ? "settings.deviceHistoryError"
                : "settings.deviceHistoryEmpty",
            )}
          />
        ) : (
          sortedRecords.map(({ record, endpoint }) => (
            <DeviceRow
              key={record.recordId}
              entry={{
                address: endpoint.address,
                name: record.name,
                platform: record.platform,
                version: record.version,
              }}
              isActive={isConnected && activeRecordId === record.recordId}
              // A record migrated from an older build still holds its pairing
              // under the pre-V2 address key until its first encrypted connect,
              // so the lock icon has to accept either key.
              isPaired={hasCredentials(record)}
              onSelect={() => handleSelect(record.recordId)}
              rightSlot={
                isEditing ? (
                  <Checkbox
                    checked={selectedRecordIds.has(record.recordId)}
                    onCheckedChange={() => toggleSelected(record.recordId)}
                    aria-label={t("settings.deviceCombine.select", {
                      device: record.name || endpoint.address,
                    })}
                    disabled={
                      selectedRecordIds.size >= 2 &&
                      !selectedRecordIds.has(record.recordId)
                    }
                  />
                ) : (
                  <Link
                    to="/settings/devices/$recordId"
                    params={{ recordId: record.recordId }}
                    aria-label={t("settings.deviceDetails")}
                    className="bg-background border-bd-outline focus-visible:ring-offset-background flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-solid px-1.5 focus-visible:ring-2 focus-visible:ring-white/50 focus-visible:ring-offset-2 focus-visible:outline-none"
                  >
                    <Pencil size={18} />
                  </Link>
                )
              }
            />
          ))
        )}
        {isEditing && sortedRecords.length > 0 && (
          <Button
            label={t("settings.deviceCombine.action")}
            intent="primary"
            onClick={() => {
              setCombineFailed(false);
              setCombineOpen(true);
            }}
            disabled={selectedRecordIds.size !== 2}
            className="mt-3 w-full"
          />
        )}
      </div>

      <SlideModal
        isOpen={combineOpen}
        close={() => {
          if (!isCombining) setCombineOpen(false);
        }}
        dismissible={!isCombining}
        title={t("settings.deviceCombine.title")}
        footer={
          <ModalActionBar
            secondaryAction={
              <Button
                variant="outline"
                label={t("settings.deviceCombine.cancel")}
                onClick={() => setCombineOpen(false)}
                disabled={isCombining}
              />
            }
            primaryAction={
              <Button
                intent="primary"
                label={t("settings.deviceCombine.confirm")}
                onClick={() => void handleConfirmCombine()}
                disabled={isCombining}
              />
            }
          />
        }
      >
        <div className="flex flex-col gap-4 py-4">
          <p className="text-center">
            {t("settings.deviceCombine.body", {
              first:
                combineTarget?.name ??
                parsedEndpointForRecord(combineTarget)?.address ??
                "",
              second:
                combineSource?.name ??
                parsedEndpointForRecord(combineSource)?.address ??
                "",
            })}
          </p>
          {combineFailed && (
            <p className="text-error text-center text-sm" role="alert">
              {t("settings.deviceCombine.failed")}
            </p>
          )}
        </div>
      </SlideModal>
    </PageFrame>
  );
}
