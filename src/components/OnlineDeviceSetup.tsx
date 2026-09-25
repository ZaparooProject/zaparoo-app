import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import toast from "react-hot-toast";
import { DeviceLinkButton } from "@/components/DeviceLinkButton";
import { SlideModal } from "@/components/SlideModal";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/wui/Button";
import { SettingHelp } from "@/components/wui/SettingHelp";
import { ToggleSwitch } from "@/components/wui/ToggleSwitch";
import { useClientCapability } from "@/hooks/useClientCapability";
import { useCoreFeature } from "@/hooks/useCoreFeature";
import type { DeviceLinkState } from "@/hooks/useDeviceLinking";
import { CoreAPI, CoreApiError } from "@/lib/coreApi";
import {
  parsedEndpointForRecord,
  useDeviceRegistry,
  type DeviceRegistrySnapshot,
} from "@/lib/devices/deviceRegistry";
import { logger } from "@/lib/logger";
import { useStatusStore } from "@/lib/store";
import {
  ClientCapability,
  type BackupStatusEntry,
  type ClientsCurrentResponse,
  type RemoteControlState,
  type UpdateSettingsRequest,
} from "@/lib/models";

interface OnlineDeviceSetupProps {
  connected: boolean;
  warpActive: boolean | null;
  /** Opens sign-in when an unlinked device needs an account to link. */
  onSignIn?: () => void;
}

const FAST_AVAILABILITY_POLL_COUNT = 3;

// Core's rejections for a client that is neither localhost nor an admin.
const ONLINE_SETTINGS_PERMISSION_MESSAGES = [
  "online settings require a local or admin client",
  "unlink requires a local or admin client",
  "client role does not permit this method",
] as const;

const REMOTE_STATES_WITH_DETAILS: ReadonlySet<RemoteControlState> = new Set([
  "not_remote_device",
  "credential_rejected",
]);

/**
 * Whether the active device is dialled over loopback, which Core treats as a
 * local client.
 */
function selectConnectsOverLoopback(snapshot: DeviceRegistrySnapshot): boolean {
  const record = snapshot.activeRecordId
    ? snapshot.records[snapshot.activeRecordId]
    : null;
  const host = parsedEndpointForRecord(record)?.host ?? "";
  return (
    host === "localhost" || host === "::1" || /^127(\.\d{1,3}){3}$/.test(host)
  );
}

/**
 * Core only accepts Online settings writes from localhost or an admin client,
 * which is narrower than `settings.write`: an unpaired remote client holds that
 * capability on Core 2.16, as does a legacy client on some Core 2.17 platforms.
 * Core 2.17+ reports the authority as `access`. Core 2.16 does not, and there
 * only a paired admin or a loopback connection passes.
 */
function canWriteOnlineSettings(
  client: ClientsCurrentResponse | null,
  connectsOverLoopback: boolean,
): boolean {
  if (!client) return false;
  if (client.access !== undefined) {
    return client.access === "localhost" || client.access === "admin";
  }
  return client.role === "admin" || connectsOverLoopback;
}

function isOnlineSettingsPermissionError(error: unknown): boolean {
  return (
    error instanceof CoreApiError &&
    ONLINE_SETTINGS_PERMISSION_MESSAGES.some((message) =>
      error.message.includes(message),
    )
  );
}

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
  onSignIn,
}: OnlineDeviceSetupProps) {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const queryClient = useQueryClient();
  const remoteControlFeature = useCoreFeature("onlineRemoteControl", {
    requireKnownSupport: true,
  });
  const librarySyncFeature = useCoreFeature("onlineLibrarySync", {
    requireKnownSupport: true,
  });
  const [unlinkOpen, setUnlinkOpen] = useState(false);
  const hasSettingsWriteCapability = useClientCapability(
    ClientCapability.SettingsWrite,
  );
  const currentClient = useStatusStore((state) => state.currentClient);
  const connectsOverLoopback = useDeviceRegistry(selectConnectsOverLoopback);
  const canWriteCoreSettings =
    hasSettingsWriteCapability &&
    canWriteOnlineSettings(currentClient, connectsOverLoopback);
  const [linkState, setLinkState] = useState<DeviceLinkState>(
    connected ? "checking" : "unavailable",
  );
  const featuresHeadingRef = useRef<HTMLHeadingElement>(null);
  const previousLinkStateRef = useRef(linkState);
  const linked = connected && linkState === "linked";
  const featuresPending =
    connected && (linkState === "checking" || linkState === "linking");

  useEffect(() => {
    // Only a link the user just made moves focus; the initial status check
    // resolving to linked must leave focus on the page heading.
    const becameLinked =
      linkState === "linked" && previousLinkStateRef.current === "linking";
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
    enabled: connected && linked && canWriteCoreSettings,
  });
  const backupStatusQuery = useQuery({
    queryKey: ["settings", "backup", "status"],
    queryFn: () => CoreAPI.settingsBackupStatus(),
    enabled: connected && linked,
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

  const remoteActivityQuery = useQuery({
    queryKey: ["remote", "activity"],
    queryFn: ({ signal }) => CoreAPI.remoteActivity(signal),
    enabled:
      connected &&
      linked &&
      canWriteCoreSettings &&
      remoteControlFeature.available,
    refetchInterval: 15_000,
  });

  const updateSettings = useMutation({
    mutationFn: (params: UpdateSettingsRequest) =>
      CoreAPI.settingsUpdate(params),
    onSuccess: () => {
      void settingsQuery.refetch();
      void backupStatusQuery.refetch();
      if (remoteControlFeature.available) void remoteActivityQuery.refetch();
    },
    onError: (error) => {
      if (isOnlineSettingsPermissionError(error)) {
        logger.warn("Core rejected Online settings for this client", error);
        toast.error(t("online.features.adminRequired"));
        return;
      }
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

  const unlink = useMutation({
    mutationFn: () => CoreAPI.settingsAuthUnlink(),
    onSuccess: async () => {
      setUnlinkOpen(false);
      toast.success(t("online.deviceLink.unlinked"));
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["deviceLinkStatus"] }),
        queryClient.invalidateQueries({ queryKey: ["settings"] }),
        queryClient.invalidateQueries({ queryKey: ["remote", "activity"] }),
      ]);
    },
    onError: (error) => {
      if (isOnlineSettingsPermissionError(error)) {
        logger.warn("Core rejected unlinking for this client", error);
        toast.error(t("online.features.adminRequired"));
        return;
      }
      logger.error("Failed to unlink device from Zaparoo Online", error, {
        category: "api",
        action: "deviceLink.unlink",
        severity: "error",
      });
      toast.error(t("online.deviceLink.unlinkFailed"));
    },
  });

  const settings = settingsQuery.data;
  const featureValues = [
    ...(remoteControlFeature.available
      ? [settings?.remoteControlEnabled ?? false]
      : []),
    settings?.playtimeSyncEnabled ?? false,
    ...(librarySyncFeature.available
      ? [settings?.librarySyncEnabled ?? false]
      : []),
    ...(cloudAvailable ? [settings?.backupRemoteEnabled ?? false] : []),
  ];
  const allFeaturesOn = featureValues.every(Boolean);
  const someFeaturesOn = !allFeaturesOn && featureValues.some(Boolean);
  // Matches the TUI: turning everything on only includes cloud backup once
  // Warp is confirmed, since scheduled backups fail without it.
  const setAllFeatures = (on: boolean) =>
    updateSettings.mutate({
      playtimeSyncEnabled: on,
      ...(remoteControlFeature.available ? { remoteControlEnabled: on } : {}),
      ...(librarySyncFeature.available ? { librarySyncEnabled: on } : {}),
      ...(!on || cloudAvailable ? { backupRemoteEnabled: on } : {}),
    });

  const linkedSince = formatBackupDate(remoteStatus?.linkedAt, i18n.language);
  const warpLabel =
    warpActive === true || remoteStatus?.availability === "available"
      ? t("online.deviceLink.warpActive")
      : remoteStatus?.availability === "unavailable"
        ? t("online.deviceLink.warpInactive")
        : t("online.deviceLink.warpChecking");
  const remoteState = remoteActivityQuery.data?.status.state ?? "unknown";

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

  const remoteStatusRow = remoteControlFeature.available ? (
    <div className="flex flex-col gap-1">
      <div className="flex min-h-[48px] items-center justify-between gap-4">
        <span>{t("online.features.remoteStatus")}</span>
        <span className="text-muted-foreground text-right text-sm">
          {remoteActivityQuery.isPending
            ? t("online.features.checkingStatus")
            : remoteActivityQuery.isError
              ? t("online.features.statusUnavailable")
              : t(`online.features.remoteStates.${remoteState}`, {
                  defaultValue: t("online.features.remoteStates.unknown"),
                })}
        </span>
      </div>
      {!remoteActivityQuery.isPending &&
        REMOTE_STATES_WITH_DETAILS.has(remoteState) && (
          <p className="text-muted-foreground text-sm">
            {t(`online.features.remoteStateDetails.${remoteState}`)}
          </p>
        )}
    </div>
  ) : null;

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
        <DeviceLinkButton
          enabled={connected}
          onStateChange={setLinkState}
          onSignIn={onSignIn}
        />
        {linked && (
          <div className="flex flex-col">
            {remoteStatus?.deviceName && (
              <div className="flex min-h-[48px] items-center justify-between gap-4">
                <span>{t("online.deviceLink.linkedAs")}</span>
                <span className="text-muted-foreground text-right text-sm break-all">
                  {remoteStatus.deviceName}
                </span>
              </div>
            )}
            {linkedSince && (
              <div className="flex min-h-[48px] items-center justify-between gap-4">
                <span>{t("online.deviceLink.linkedSince")}</span>
                <span className="text-muted-foreground text-right text-sm">
                  {linkedSince}
                </span>
              </div>
            )}
            <div className="flex min-h-[48px] items-center justify-between gap-4">
              <span>{t("online.deviceLink.warp")}</span>
              <span className="text-muted-foreground text-right text-sm">
                {backupStatusQuery.isPending
                  ? t("online.deviceLink.warpChecking")
                  : warpLabel}
              </span>
            </div>
            {canWriteCoreSettings && (
              <Button
                label={t("online.deviceLink.unlink")}
                variant="outline"
                intent="destructive"
                onClick={() => setUnlinkOpen(true)}
                disabled={unlink.isPending}
                className="border-error text-error mt-2 w-full"
              />
            )}
          </div>
        )}
        {!connected && (
          <div className="flex flex-col gap-3">
            <p className="text-muted-foreground text-sm">
              {t("online.deviceLink.disconnected")}
            </p>
            <Button
              label={t("online.deviceLink.backToSettings")}
              variant="outline"
              onClick={() => void router.navigate({ to: "/settings" })}
              className="w-full"
            />
          </div>
        )}
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
            className="rounded-sm text-lg font-medium text-white outline-none focus-visible:ring-2 focus-visible:ring-white/50"
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
                        {t("online.features.allFeatures")}
                        <SettingHelp
                          title={t("online.features.allFeatures")}
                          description={t("online.features.allFeaturesHelp")}
                        />
                      </span>
                    }
                    value={allFeaturesOn}
                    setValue={setAllFeatures}
                    disabled={actionsDisabled}
                    loading={settingsLoading}
                    suffix={
                      someFeaturesOn ? (
                        <span className="text-muted-foreground ml-2 text-xs">
                          {t("online.features.someOn")}
                        </span>
                      ) : undefined
                    }
                  />

                  {remoteControlFeature.available && (
                    <ToggleSwitch
                      label={
                        <span className="flex items-center">
                          {t("online.features.remoteControl")}
                          <SettingHelp
                            title={t("online.features.remoteControl")}
                            description={t("online.features.remoteControlHelp")}
                          />
                        </span>
                      }
                      value={settings?.remoteControlEnabled ?? false}
                      setValue={(value) =>
                        updateSettings.mutate({ remoteControlEnabled: value })
                      }
                      disabled={actionsDisabled}
                      loading={settingsLoading}
                    />
                  )}

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

                  {librarySyncFeature.available && (
                    <ToggleSwitch
                      label={
                        <span className="flex items-center">
                          {t("online.features.librarySync")}
                          <SettingHelp
                            title={t("online.features.librarySync")}
                            description={t("online.features.librarySyncHelp")}
                          />
                        </span>
                      }
                      value={settings?.librarySyncEnabled ?? false}
                      setValue={(value) =>
                        updateSettings.mutate({ librarySyncEnabled: value })
                      }
                      disabled={actionsDisabled}
                      loading={settingsLoading}
                    />
                  )}

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
              {remoteStatusRow}
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {remoteControlFeature.available && (
                <div className="flex flex-col gap-1">
                  <p className="font-medium text-white">
                    {t("online.features.remoteControl")}
                  </p>
                  <p className="text-muted-foreground text-sm">
                    {t("online.features.remoteControlSummary")}
                  </p>
                </div>
              )}
              <div className="flex flex-col gap-1">
                <p className="font-medium text-white">
                  {t("online.features.playHistory")}
                </p>
                <p className="text-muted-foreground text-sm">
                  {t("online.features.playHistorySummary")}
                </p>
              </div>
              {librarySyncFeature.available && (
                <div className="flex flex-col gap-1">
                  <p className="font-medium text-white">
                    {t("online.features.librarySync")}
                  </p>
                  <p className="text-muted-foreground text-sm">
                    {t("online.features.librarySyncSummary")}
                  </p>
                </div>
              )}
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

      <SlideModal
        isOpen={unlinkOpen}
        close={() => {
          if (!unlink.isPending) setUnlinkOpen(false);
        }}
        dismissible={!unlink.isPending}
        title={t("online.deviceLink.unlinkConfirmTitle")}
        footer={
          <div className="flex gap-2">
            <Button
              variant="outline"
              label={t("nav.cancel")}
              onClick={() => setUnlinkOpen(false)}
              className="flex-1"
              disabled={unlink.isPending}
            />
            <Button
              variant="outline"
              intent="destructive"
              label={t("online.deviceLink.unlink")}
              onClick={() => unlink.mutate()}
              className="border-error text-error flex-1"
              disabled={unlink.isPending}
            />
          </div>
        }
      >
        <p className="text-muted-foreground py-2 text-sm">
          {t("online.deviceLink.unlinkConfirmMessage")}
        </p>
      </SlideModal>
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
