import { useEffect, useMemo, useState } from "react";
import { Link, useRouter } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { Pencil } from "lucide-react";
import { useConnection } from "@/hooks/useConnection";
import { useSmartSwipe } from "@/hooks/useSmartSwipe";
import { usePageHeadingFocus } from "@/hooks/usePageHeadingFocus";
import { useSelectDevice } from "@/hooks/useSelectDevice";
import {
  credentialKeyForRecord,
  credentialStore,
} from "@/lib/crypto/credentials";
import {
  parsedEndpointForRecord,
  useDeviceRegistry,
  type DeviceRecord,
} from "@/lib/devices/deviceRegistry";
import type { ParsedDeviceEndpoint } from "@/lib/devices/endpoint";
import { logger } from "@/lib/logger";
import { appBackNavigationOptions } from "@/lib/tabSessionStore";
import { PageFrame } from "@/components/PageFrame";
import { HeaderButton } from "@/components/wui/HeaderButton";
import { EmptyState } from "@/components/wui/EmptyState";
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

export function Devices() {
  const { t } = useTranslation();
  const headingRef = usePageHeadingFocus<HTMLHeadingElement>(
    t("settings.deviceHistory"),
  );
  const router = useRouter();
  const goBack = () =>
    void router.navigate(appBackNavigationOptions("/settings"));
  const swipeHandlers = useSmartSwipe({
    onSwipeRight: goBack,
    preventScrollOnSwipe: false,
  });

  const records = useDeviceRegistry(selectRecords);
  const activeRecordId = useDeviceRegistry(selectActiveRecordId);
  // A registry that failed to load also has no records, and the empty state
  // would tell the user they have never saved a device — the opposite of what
  // happened, and an invitation to re-pair devices they already own.
  const hydrationError = useDeviceRegistry(selectHydrationError);
  const { isConnected } = useConnection();

  const { selectRecord } = useSelectDevice();
  const [pairedKeys, setPairedKeys] = useState<Set<string>>(new Set());

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
        return endpoint ? [{ record, endpoint } satisfies DeviceListEntry] : [];
      })
      .sort((left, right) =>
        (left.record.name || left.endpoint.address).localeCompare(
          right.record.name || right.endpoint.address,
        ),
      );
  }, [records]);

  const handleSelect = (recordId: string) => {
    void selectRecord(recordId);
    router.navigate({ to: "/settings" });
  };

  return (
    <PageFrame
      {...swipeHandlers}
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
    >
      <div className="flex flex-col gap-3 pt-2">
        {sortedRecords.length === 0 ? (
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
              isPaired={
                pairedKeys.has(credentialKeyForRecord(record.recordId)) ||
                (record.legacyCredentialKey !== undefined &&
                  pairedKeys.has(record.legacyCredentialKey))
              }
              onSelect={() => handleSelect(record.recordId)}
              rightSlot={
                <Link
                  to="/settings/devices/$recordId"
                  params={{ recordId: record.recordId }}
                  aria-label={t("settings.deviceDetails")}
                  className="bg-background border-bd-outline focus-visible:ring-offset-background flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-solid px-1.5 focus-visible:ring-2 focus-visible:ring-white/50 focus-visible:ring-offset-2 focus-visible:outline-none"
                >
                  <Pencil size={18} />
                </Link>
              }
            />
          ))
        )}
      </div>
    </PageFrame>
  );
}
