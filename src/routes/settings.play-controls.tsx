import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import toast from "react-hot-toast";
import { Card } from "@/components/wui/Card";
import { CoreAPI } from "@/lib/coreApi";
import { logger } from "@/lib/logger";
import { ToggleSwitch } from "@/components/wui/ToggleSwitch";
import { SettingHelp } from "@/components/wui/SettingHelp";
import { useStatusStore, ConnectionState } from "@/lib/store";
import { PageFrame } from "@/components/PageFrame";
import { BackIcon } from "@/lib/images";
import { HeaderButton } from "@/components/wui/HeaderButton";
import { TextInput } from "@/components/wui/TextInput";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge, type BadgeVariant } from "@/components/wui/Badge";
import { appBackNavigationOptions } from "@/lib/tabSessionStore";
import {
  formatDuration,
  formatDurationDisplay,
  formatDurationAccessible,
  parseDuration,
} from "@/lib/utils";
import { usePageHeadingFocus } from "@/hooks/usePageHeadingFocus";
import { useClientCapability } from "@/hooks/useClientCapability";
import { ClientCapability } from "@/lib/models";
import { ProfileManager } from "@/components/ProfileManager";
import { useActiveDeviceKey } from "@/hooks/useActiveDeviceKey";
import { useCoreFeature } from "@/hooks/useCoreFeature";
import { GatedFeature } from "@/components/GatedFeature";
import { StatRow } from "@/components/StatRow";
import { SettingsFieldGroup } from "@/components/SettingsFieldGroup";
import {
  useCoreSettingsQueryKey,
  useCoreSettingsUpdate,
} from "@/hooks/useCoreSettingsUpdate";
import { useDebouncedSave } from "@/hooks/useDebouncedSave";

export const Route = createFileRoute("/settings/play-controls")({
  component: PlayControlsSettings,
});

const WHOLE_NUMBER = /^\d+$/;

interface DurationDraft {
  hours: string;
  minutes: string;
}

function durationDraft(duration: string): DurationDraft {
  const { hours, minutes } = parseDuration(duration);
  return { hours: String(hours), minutes: String(minutes) };
}

function serializeDuration(draft: DurationDraft): string {
  return formatDuration({
    hours: parseInt(draft.hours, 10) || 0,
    minutes: parseInt(draft.minutes, 10) || 0,
  });
}

// An emptied field is mid-edit, not a request to save zero.
function isCompleteDuration(draft: DurationDraft): boolean {
  return WHOLE_NUMBER.test(draft.hours) && WHOLE_NUMBER.test(draft.minutes);
}

function serializeMinutes(value: string): string {
  const total = parseInt(value, 10) || 0;
  return formatDuration({ hours: Math.floor(total / 60), minutes: total % 60 });
}

function isWholeNumber(value: string): boolean {
  return WHOLE_NUMBER.test(value);
}

function serializeSeconds(value: string): string {
  return String(parseFloat(value) || 0);
}

function isSeconds(value: string): boolean {
  if (value.trim() === "") return false;
  const seconds = Number(value);
  return Number.isFinite(seconds) && seconds >= 0;
}

export function PlayControlsSettings() {
  const { t } = useTranslation();
  const headingRef = usePageHeadingFocus<HTMLHeadingElement>(
    t("settings.playControls.title"),
  );
  const connected = useStatusStore((state) => state.connected);
  const connectionState = useStatusStore((state) => state.connectionState);
  const canWriteCoreSettings = useClientCapability(
    ClientCapability.SettingsWrite,
  );
  const canManageProfiles = useClientCapability(
    ClientCapability.ProfilesManage,
  );
  const { available: profilesAvailable } = useCoreFeature("profiles", {
    requireKnownSupport: true,
  });
  const { available: playtimeLimitsAvailable } = useCoreFeature(
    "playtimeLimits",
    { requireKnownSupport: true },
  );

  const isConnecting =
    connectionState === ConnectionState.CONNECTING ||
    connectionState === ConnectionState.RECONNECTING;

  const router = useRouter();
  const goBack = () =>
    void router.navigate(appBackNavigationOptions("/settings"));

  const queryClient = useQueryClient();
  const deviceKey = useActiveDeviceKey();
  const settingsQueryKey = useCoreSettingsQueryKey();
  const limitsQueryKey = ["playtime", deviceKey, "limits"] as const;

  const { data: limitsConfig, isPending } = useQuery({
    queryKey: limitsQueryKey,
    queryFn: () => CoreAPI.playtimeLimits(),
    enabled: connected && playtimeLimitsAvailable,
    refetchOnMount: "always",
    refetchInterval: 30000,
  });

  const { data: coreSettings } = useQuery({
    queryKey: settingsQueryKey,
    queryFn: () => CoreAPI.settings(),
    enabled: connected,
    refetchOnMount: "always",
  });

  const { data: playtimeStatus, isPending: isStatusPending } = useQuery({
    queryKey: ["playtime", deviceKey, "status"],
    queryFn: () => CoreAPI.playtime(),
    enabled: connected && limitsConfig?.enabled === true,
    refetchOnMount: "always",
    refetchInterval: 30000,
  });

  const updateLimits = useMutation({
    mutationFn: CoreAPI.playtimeLimitsUpdate.bind(CoreAPI),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: limitsQueryKey }),
    onError: (error) => {
      logger.error("Failed to update playtime limits", error, {
        category: "api",
        action: "playtimeLimits.update",
        severity: "warning",
      });
      toast.error(t("settings.updateFailed"));
    },
  });

  const updateCoreSetting = useCoreSettingsUpdate();

  const [daily, setDaily] = useDebouncedSave<DurationDraft>({
    saved: limitsConfig ? durationDraft(limitsConfig.daily) : undefined,
    serialize: serializeDuration,
    canSave: isCompleteDuration,
    save: (draft) =>
      updateLimits.mutateAsync({ daily: serializeDuration(draft) }),
    enabled: canWriteCoreSettings,
  });
  const [session, setSession] = useDebouncedSave<DurationDraft>({
    saved: limitsConfig ? durationDraft(limitsConfig.session) : undefined,
    serialize: serializeDuration,
    canSave: isCompleteDuration,
    save: (draft) =>
      updateLimits.mutateAsync({ session: serializeDuration(draft) }),
    enabled: canWriteCoreSettings,
  });
  const savedReset = limitsConfig
    ? parseDuration(limitsConfig.sessionReset)
    : undefined;
  const [resetMinutes, setResetMinutes] = useDebouncedSave<string>({
    saved: savedReset
      ? String(savedReset.hours * 60 + savedReset.minutes)
      : undefined,
    serialize: serializeMinutes,
    canSave: isWholeNumber,
    save: (draft) =>
      updateLimits.mutateAsync({ sessionReset: serializeMinutes(draft) }),
    enabled: canWriteCoreSettings,
  });
  const [launchGuardTimeout, setLaunchGuardTimeout] = useDebouncedSave<string>({
    saved: coreSettings
      ? String(coreSettings.launchGuardTimeout ?? 15)
      : undefined,
    serialize: serializeSeconds,
    canSave: isSeconds,
    save: (draft) =>
      updateCoreSetting.mutateAsync({ launchGuardTimeout: Number(draft) }),
    enabled: canWriteCoreSettings,
  });
  const [launchGuardDelay, setLaunchGuardDelay] = useDebouncedSave<string>({
    saved: coreSettings
      ? String(coreSettings.launchGuardDelay ?? 0)
      : undefined,
    serialize: serializeSeconds,
    canSave: isSeconds,
    save: (draft) =>
      updateCoreSetting.mutateAsync({ launchGuardDelay: Number(draft) }),
    enabled: canWriteCoreSettings,
  });

  const handleEnabledToggle = (enabled: boolean) => {
    if (canWriteCoreSettings) {
      updateLimits.mutate({ enabled });
    }
  };

  const launchGuardEnabled = coreSettings?.launchGuardEnabled ?? false;

  const getStateBadgeVariant = (state: string): BadgeVariant => {
    switch (state) {
      case "active":
        return "success";
      case "cooldown":
        return "warning";
      case "reset":
      default:
        return "default";
    }
  };

  const getStateLabel = (state: string) => {
    switch (state) {
      case "active":
        return t("settings.core.playtime.stateActive");
      case "cooldown":
        return t("settings.core.playtime.stateCooldown");
      case "reset":
      default:
        return t("settings.core.playtime.stateReset");
    }
  };

  const limitFieldsDisabled = !canWriteCoreSettings || !limitsConfig?.enabled;

  const durationRow = (label: string, duration: string | undefined) => (
    <StatRow
      label={label}
      valueLabel={
        isStatusPending
          ? undefined
          : formatDurationAccessible(duration ?? "0s", t)
      }
    >
      {isStatusPending ? (
        <Skeleton className="h-5 w-14" />
      ) : (
        formatDurationDisplay(duration ?? "0s")
      )}
    </StatRow>
  );

  return (
    <PageFrame
      layout="workspace"
      className="settings-panel-page wrap-anywhere"
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
      headerCenter={
        <h1 ref={headingRef} className="text-foreground text-xl">
          {t("settings.playControls.title")}
        </h1>
      }
    >
      <div
        className="settings-panel-layout settings-play-panels"
        data-profiles-available={profilesAvailable}
      >
        <div className="settings-play-profiles">
          <ProfileManager
            connected={connected}
            canManage={canManageProfiles}
            canWriteSettings={canWriteCoreSettings}
            requireForLaunch={coreSettings?.profilesRequireForLaunch ?? false}
            settingsLoading={isConnecting || (connected && !coreSettings)}
            onRequireForLaunchChange={(profilesRequireForLaunch) => {
              updateCoreSetting.mutate({ profilesRequireForLaunch });
            }}
            available={profilesAvailable}
          />
        </div>
        <div className="settings-play-main">
          <GatedFeature featureId="playtimeLimits">
            <section>
              <Card className="flex flex-col gap-4">
                <h2 className="text-foreground text-lg font-semibold">
                  {t("settings.core.playtime.title")}
                </h2>

                <ToggleSwitch
                  reflow
                  label={t("settings.core.playtime.enabled")}
                  help={
                    <SettingHelp
                      title={t("settings.core.playtime.enabled")}
                      description={t("settings.core.playtime.enabledHelp")}
                    />
                  }
                  value={limitsConfig?.enabled ?? false}
                  setValue={handleEnabledToggle}
                  disabled={!canWriteCoreSettings}
                  loading={isConnecting || (connected && isPending)}
                />

                {limitsConfig?.enabled && (
                  <div className="bg-surface-inset border-border flex flex-col gap-2 rounded-md border p-3">
                    {!connected ? (
                      <p className="text-muted-foreground text-sm">
                        {t("settings.notConnected")}
                      </p>
                    ) : (
                      <>
                        <div className="flex flex-col gap-2">
                          <div className="flex flex-wrap items-center justify-between gap-x-2">
                            <h3 className="max-w-full text-sm font-medium">
                              {t("settings.core.playtime.currentSession")}
                            </h3>
                            {isStatusPending ? (
                              <Skeleton className="h-5 w-16" />
                            ) : (
                              <Badge
                                className="max-w-full wrap-anywhere"
                                variant={getStateBadgeVariant(
                                  playtimeStatus?.state ?? "reset",
                                )}
                              >
                                {getStateLabel(
                                  playtimeStatus?.state ?? "reset",
                                )}
                              </Badge>
                            )}
                          </div>
                          {durationRow(
                            t("settings.core.playtime.sessionDuration"),
                            playtimeStatus?.sessionDuration,
                          )}
                          {durationRow(
                            t("settings.core.playtime.sessionRemaining"),
                            playtimeStatus?.sessionRemaining,
                          )}
                          {playtimeStatus?.cooldownRemaining &&
                            playtimeStatus.state === "cooldown" &&
                            durationRow(
                              t("settings.core.playtime.cooldownRemaining"),
                              playtimeStatus.cooldownRemaining,
                            )}
                        </div>

                        <div className="border-border flex flex-col gap-2 border-t pt-2">
                          <h3 className="text-sm font-medium">
                            {t("settings.core.playtime.dailyUsage")}
                          </h3>
                          {durationRow(
                            t("settings.core.playtime.dailyUsageToday"),
                            playtimeStatus?.dailyUsageToday,
                          )}
                          {durationRow(
                            t("settings.core.playtime.dailyRemaining"),
                            playtimeStatus?.dailyRemaining,
                          )}
                        </div>
                      </>
                    )}
                  </div>
                )}

                <div className="flex flex-col gap-3">
                  <SettingsFieldGroup
                    legend={t("settings.core.playtime.dailyLimit")}
                  >
                    <TextInput
                      type="number"
                      placeholder="0"
                      value={daily?.hours ?? "0"}
                      setValue={(hours) =>
                        setDaily({ hours, minutes: daily?.minutes ?? "0" })
                      }
                      label={t("settings.core.playtime.hours")}
                      disabled={limitFieldsDisabled}
                    />
                    <TextInput
                      type="number"
                      placeholder="0"
                      value={daily?.minutes ?? "0"}
                      setValue={(minutes) =>
                        setDaily({ hours: daily?.hours ?? "0", minutes })
                      }
                      label={t("settings.core.playtime.minutes")}
                      disabled={limitFieldsDisabled}
                    />
                  </SettingsFieldGroup>

                  <SettingsFieldGroup
                    legend={t("settings.core.playtime.sessionLimit")}
                  >
                    <TextInput
                      type="number"
                      placeholder="0"
                      value={session?.hours ?? "0"}
                      setValue={(hours) =>
                        setSession({ hours, minutes: session?.minutes ?? "0" })
                      }
                      label={t("settings.core.playtime.hours")}
                      disabled={limitFieldsDisabled}
                    />
                    <TextInput
                      type="number"
                      placeholder="0"
                      value={session?.minutes ?? "0"}
                      setValue={(minutes) =>
                        setSession({ hours: session?.hours ?? "0", minutes })
                      }
                      label={t("settings.core.playtime.minutes")}
                      disabled={limitFieldsDisabled}
                    />
                  </SettingsFieldGroup>

                  <SettingsFieldGroup
                    legend={t("settings.core.playtime.sessionReset")}
                    hint={
                      <p className="text-muted-foreground mt-2 text-xs">
                        {t("settings.core.playtime.neverReset")}
                      </p>
                    }
                  >
                    <TextInput
                      type="number"
                      placeholder="0"
                      value={resetMinutes ?? "0"}
                      setValue={setResetMinutes}
                      label={t("settings.core.playtime.minutes")}
                      disabled={limitFieldsDisabled}
                      className="max-w-[calc(50%-0.25rem)]"
                    />
                  </SettingsFieldGroup>
                </div>
              </Card>
            </section>
          </GatedFeature>

          <section>
            <Card className="flex flex-col gap-4">
              <h2 className="text-foreground text-lg font-semibold">
                {t("settings.core.launchGuard.title")}
              </h2>

              <ToggleSwitch
                reflow
                label={t("settings.core.launchGuard.enabled")}
                help={
                  <SettingHelp
                    title={t("settings.core.launchGuard.enabled")}
                    description={t("settings.core.launchGuard.enabledHelp")}
                  />
                }
                value={launchGuardEnabled}
                setValue={(launchGuardEnabled) => {
                  updateCoreSetting.mutate({ launchGuardEnabled });
                }}
                disabled={!canWriteCoreSettings}
                loading={isConnecting || (connected && !coreSettings)}
              />

              <ToggleSwitch
                reflow
                label={t("settings.core.launchGuard.requireConfirm")}
                help={
                  <SettingHelp
                    title={t("settings.core.launchGuard.requireConfirm")}
                    description={t(
                      "settings.core.launchGuard.requireConfirmHelp",
                    )}
                  />
                }
                value={coreSettings?.launchGuardRequireConfirm ?? false}
                setValue={(launchGuardRequireConfirm) => {
                  updateCoreSetting.mutate({ launchGuardRequireConfirm });
                }}
                disabled={!canWriteCoreSettings || !launchGuardEnabled}
                loading={isConnecting || (connected && !coreSettings)}
              />

              <div className="flex flex-col gap-3">
                <SettingsFieldGroup
                  legend={t("settings.core.launchGuard.timeout")}
                >
                  <TextInput
                    type="number"
                    placeholder="15"
                    value={launchGuardTimeout ?? "15"}
                    setValue={setLaunchGuardTimeout}
                    label={t("settings.core.launchGuard.seconds")}
                    disabled={!canWriteCoreSettings || !launchGuardEnabled}
                    className="max-w-[calc(50%-0.25rem)]"
                  />
                </SettingsFieldGroup>

                <SettingsFieldGroup
                  legend={t("settings.core.launchGuard.delay")}
                >
                  <TextInput
                    type="number"
                    placeholder="0"
                    value={launchGuardDelay ?? "0"}
                    setValue={setLaunchGuardDelay}
                    label={t("settings.core.launchGuard.seconds")}
                    disabled={!canWriteCoreSettings || !launchGuardEnabled}
                    className="max-w-[calc(50%-0.25rem)]"
                  />
                </SettingsFieldGroup>
              </div>
            </Card>
          </section>
        </div>
      </div>
    </PageFrame>
  );
}
