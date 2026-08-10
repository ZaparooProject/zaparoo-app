import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import toast from "react-hot-toast";
import { DeviceLinkButton } from "@/components/DeviceLinkButton";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/wui/Button";
import { SettingHelp } from "@/components/wui/SettingHelp";
import { ToggleSwitch } from "@/components/wui/ToggleSwitch";
import { useClientCapability } from "@/hooks/useClientCapability";
import type { DeviceLinkState } from "@/hooks/useDeviceLinking";
import { CoreAPI } from "@/lib/coreApi";
import { logger } from "@/lib/logger";
import {
  ClientCapability,
  type BackupStatusEntry,
  type UpdateSettingsRequest,
} from "@/lib/models";

interface OnlineDeviceSetupProps {
  connected: boolean;
  warpActive: boolean | null;
}

const FAST_AVAILABILITY_POLL_COUNT = 3;

function formatBackupDate(
  value: string | undefined,
  language: string,
): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? null
    : date.toLocaleDateString(language, { dateStyle: "medium" });
}

export function OnlineDeviceSetup({
  connected,
  warpActive,
}: OnlineDeviceSetupProps) {
  const { t, i18n } = useTranslation();
  const canWriteCoreSettings = useClientCapability(
    ClientCapability.SettingsWrite,
  );
  const [linkState, setLinkState] = useState<DeviceLinkState>(
    connected ? "checking" : "unavailable",
  );
  const featuresHeadingRef = useRef<HTMLHeadingElement>(null);
  const previousLinkStateRef = useRef(linkState);
  const linked = linkState === "linked";
  const featuresPending = linkState === "checking" || linkState === "linking";

  useEffect(() => {
    const becameLinked =
      linkState === "linked" && previousLinkStateRef.current !== "linked";
    previousLinkStateRef.current = linkState;
    if (becameLinked) {
      requestAnimationFrame(() => {
        featuresHeadingRef.current?.focus({ preventScroll: true });
      });
    }
  }, [linkState]);

  const settingsQuery = useQuery({
    queryKey: ["settings", "online"],
    queryFn: () => CoreAPI.settings(),
    enabled: linked && canWriteCoreSettings,
  });
  const backupStatusQuery = useQuery({
    queryKey: ["settings", "backup", "status"],
    queryFn: () => CoreAPI.settingsBackupStatus(),
    enabled: linked,
    refetchInterval: (query) => {
      if (warpActive === true) return false;
      const availability = query.state.data?.remote.availability;
      if (availability === undefined || availability === "unknown") {
        return query.state.dataUpdateCount < FAST_AVAILABILITY_POLL_COUNT
          ? 3000
          : 15_000;
      }
      return availability === "unavailable" ? 15_000 : false;
    },
  });

  const updateSettings = useMutation({
    mutationFn: (params: UpdateSettingsRequest) =>
      CoreAPI.settingsUpdate(params),
    onSuccess: () => {
      void settingsQuery.refetch();
      void backupStatusQuery.refetch();
    },
    onError: (error) => {
      logger.error("Failed to update Online device settings", error, {
        category: "api",
        action: "onlineSettings.update",
        severity: "error",
      });
      toast.error(t("online.features.updateFailed"));
    },
  });

  const remoteStatus = backupStatusQuery.data?.remote;
  const backupStatusLabel = getBackupStatusLabel(
    remoteStatus,
    backupStatusQuery.data?.activeOperation,
    i18n.language,
    t,
  );
  const settingsLoading =
    canWriteCoreSettings && linked && settingsQuery.isPending;
  const actionsDisabled = updateSettings.isPending;
  const cloudAvailable =
    warpActive === true || remoteStatus?.availability === "available";
  const cloudAvailabilityPending =
    !cloudAvailable &&
    warpActive === null &&
    (remoteStatus?.availability === undefined ||
      remoteStatus.availability === "unknown");

  const backupStatusRow = (
    <div className="flex min-h-[48px] items-center justify-between gap-4">
      <span>{t("online.features.backupStatus")}</span>
      <span className="text-muted-foreground text-right text-sm">
        {backupStatusQuery.isPending
          ? t("online.features.checkingStatus")
          : backupStatusQuery.isError
            ? t("online.features.statusUnavailable")
            : backupStatusLabel}
      </span>
    </div>
  );

  return (
    <>
      <section
        className="flex w-full flex-col gap-3"
        aria-labelledby="online-device-title"
      >
        <div className="flex items-center">
          <h2
            id="online-device-title"
            className="text-lg font-medium text-white"
          >
            {t("online.deviceLink.title")}
          </h2>
          <SettingHelp
            title={t("online.deviceLink.title")}
            description={t("online.deviceLink.help")}
          />
        </div>
        <DeviceLinkButton enabled={connected} onStateChange={setLinkState} />
      </section>

      {(featuresPending || linked) && (
        <section
          className="flex w-full flex-col gap-4"
          aria-labelledby="online-features-title"
        >
          <h2
            ref={featuresHeadingRef}
            id="online-features-title"
            tabIndex={-1}
            className="text-lg font-medium text-white outline-none"
          >
            {t("online.features.title")}
          </h2>

          {featuresPending ? (
            <div
              className="flex flex-col gap-5"
              role="status"
              aria-label={t("online.features.loading")}
            >
              <Skeleton className="h-8 w-full rounded-full" />
              <Skeleton className="h-8 w-full rounded-full" />
              <div className="flex flex-col gap-2">
                <Skeleton className="h-5 w-32" />
                <Skeleton className="h-12 w-full rounded-md" />
              </div>
              <Skeleton className="h-12 w-full" />
            </div>
          ) : canWriteCoreSettings ? (
            <div className="flex flex-col gap-5">
              {settingsQuery.isError ? (
                <div className="flex flex-col gap-3">
                  <p className="text-muted-foreground text-sm" role="status">
                    {t("online.features.settingsUnavailable")}
                  </p>
                  <Button
                    label={t("online.features.retry")}
                    variant="outline"
                    onClick={() => settingsQuery.refetch()}
                    className="w-full"
                  />
                </div>
              ) : (
                <>
                  <ToggleSwitch
                    label={
                      <span className="flex items-center">
                        {t("online.features.playHistory")}
                        <SettingHelp
                          title={t("online.features.playHistory")}
                          description={t("online.features.playHistoryHelp")}
                        />
                      </span>
                    }
                    value={settingsQuery.data?.playtimeSyncEnabled ?? false}
                    setValue={(value) =>
                      updateSettings.mutate({ playtimeSyncEnabled: value })
                    }
                    disabled={actionsDisabled}
                    loading={settingsLoading}
                    suffix={
                      <span className="text-muted-foreground ml-2 text-xs">
                        {t("online.features.free")}
                      </span>
                    }
                  />

                  <ToggleSwitch
                    label={
                      <span className="flex items-center">
                        {t("online.features.automaticBackup")}
                        <SettingHelp
                          title={t("online.features.automaticBackup")}
                          description={t("online.features.automaticBackupHelp")}
                        />
                      </span>
                    }
                    value={settingsQuery.data?.backupRemoteEnabled ?? false}
                    setValue={(value) =>
                      updateSettings.mutate({ backupRemoteEnabled: value })
                    }
                    disabled={actionsDisabled || !cloudAvailable}
                    loading={settingsLoading}
                    suffix={
                      !cloudAvailable ? (
                        <span className="text-muted-foreground ml-2 text-xs">
                          {cloudAvailabilityPending
                            ? t("online.features.checkingWarp")
                            : t("online.features.requiresWarp")}
                        </span>
                      ) : undefined
                    }
                  />

                  {settingsLoading ? (
                    <div className="flex flex-col gap-2">
                      <Skeleton className="h-5 w-32" />
                      <Skeleton className="h-12 w-full rounded-md" />
                    </div>
                  ) : (
                    <div>
                      <label
                        htmlFor="online-backup-schedule"
                        className="mb-1 block text-sm font-medium"
                      >
                        {t("online.features.schedule")}
                      </label>
                      <select
                        id="online-backup-schedule"
                        className="border-bd-input bg-background text-foreground w-full rounded-md border border-solid p-3 focus-visible:ring-2 focus-visible:ring-white/50 focus-visible:outline-none"
                        value={
                          settingsQuery.data?.backupRemoteSchedule ?? "daily"
                        }
                        onChange={(event) =>
                          updateSettings.mutate({
                            backupRemoteSchedule: event.target.value as
                              | "daily"
                              | "weekly"
                              | "manual",
                          })
                        }
                        disabled={
                          actionsDisabled ||
                          !cloudAvailable ||
                          !settingsQuery.data?.backupRemoteEnabled
                        }
                      >
                        <option value="daily">
                          {t("online.features.scheduleDaily")}
                        </option>
                        <option value="weekly">
                          {t("online.features.scheduleWeekly")}
                        </option>
                        <option value="manual">
                          {t("online.features.scheduleManual")}
                        </option>
                      </select>
                    </div>
                  )}
                </>
              )}

              {backupStatusRow}
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-1">
                <p className="font-medium text-white">
                  {t("online.features.playHistory")}
                </p>
                <p className="text-muted-foreground text-sm">
                  {t("online.features.playHistorySummary")}
                </p>
              </div>
              <div className="flex flex-col gap-1">
                <p className="font-medium text-white">
                  {t("online.features.automaticBackup")}
                </p>
                <p className="text-muted-foreground text-sm">
                  {t("online.features.automaticBackupSummary")}
                </p>
              </div>
              {backupStatusRow}
              <p className="text-muted-foreground text-sm">
                {t("online.features.adminRequired")}
              </p>
            </div>
          )}
        </section>
      )}
    </>
  );
}

function getBackupStatusLabel(
  remote: BackupStatusEntry | undefined,
  activeOperation: string | undefined,
  language: string,
  t: ReturnType<typeof useTranslation>["t"],
): string {
  if (activeOperation?.startsWith("remote")) {
    return t("online.features.backupInProgress");
  }
  if (!remote) return t("online.features.notConfigured");
  if (remote.lastStatus === "failed") {
    return t("online.features.lastBackupFailed");
  }
  const lastSuccess = formatBackupDate(remote.lastSuccessAt, language);
  if (lastSuccess) {
    return t("online.features.lastBackup", { date: lastSuccess });
  }
  return t("online.features.neverBackedUp");
}
