import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useState, useEffect, useRef } from "react";
import { CoreAPI } from "@/lib/coreApi.ts";
import { ToggleSwitch } from "@/components/wui/ToggleSwitch";
import { SettingHelp } from "@/components/wui/SettingHelp";
import { useSmartSwipe } from "@/hooks/useSmartSwipe";
import { useStatusStore, ConnectionState } from "@/lib/store";
import { PageFrame } from "@/components/PageFrame";
import { BackIcon } from "@/lib/images";
import { HeaderButton } from "@/components/wui/HeaderButton";
import { TextInput } from "@/components/wui/TextInput";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge, type BadgeVariant } from "@/components/wui/Badge";
import {
  formatDuration,
  formatDurationDisplay,
  formatDurationAccessible,
  parseDuration,
} from "@/lib/utils";
import { usePageHeadingFocus } from "@/hooks/usePageHeadingFocus";
import { type UpdateSettingsRequest } from "@/lib/models";

export const Route = createFileRoute("/settings/play-controls")({
  component: PlayControlsSettings,
});

function PlayControlsSettings() {
  const { t } = useTranslation();
  usePageHeadingFocus(t("settings.playControls.title"));
  const connected = useStatusStore((state) => state.connected);
  const connectionState = useStatusStore((state) => state.connectionState);

  const isConnecting =
    connectionState === ConnectionState.CONNECTING ||
    connectionState === ConnectionState.RECONNECTING;

  const router = useRouter();
  const goBack = () => router.history.back();
  const swipeHandlers = useSmartSwipe({
    onSwipeRight: goBack,
    preventScrollOnSwipe: false,
  });

  const [dailyHours, setDailyHours] = useState("0");
  const [dailyMinutes, setDailyMinutes] = useState("0");
  const [sessionHours, setSessionHours] = useState("0");
  const [sessionMinutes, setSessionMinutes] = useState("0");
  const [resetMinutes, setResetMinutes] = useState("0");
  const [launchGuardTimeout, setLaunchGuardTimeout] = useState("15");
  const [launchGuardDelay, setLaunchGuardDelay] = useState("0");

  const dailyTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const sessionTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const resetTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const launchGuardTimeoutRef = useRef<
    ReturnType<typeof setTimeout> | undefined
  >(undefined);
  const launchGuardDelayRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );

  const {
    data: limitsConfig,
    refetch: refetchLimits,
    isPending,
  } = useQuery({
    queryKey: ["playtime", "limits"],
    queryFn: () => CoreAPI.playtimeLimits(),
    enabled: connected,
    refetchOnMount: "always",
    refetchInterval: 30000,
  });

  const { data: coreSettings, refetch: refetchSettings } = useQuery({
    queryKey: ["settings"],
    queryFn: () => CoreAPI.settings(),
    enabled: connected,
    refetchOnMount: "always",
  });

  const { data: playtimeStatus, isPending: isStatusPending } = useQuery({
    queryKey: ["playtime", "status"],
    queryFn: () => CoreAPI.playtime(),
    enabled: connected && limitsConfig?.enabled === true,
    refetchOnMount: "always",
    refetchInterval: 30000,
  });

  const updateMutation = useMutation({
    mutationFn: CoreAPI.playtimeLimitsUpdate.bind(CoreAPI),
    onSuccess: () => {
      refetchLimits();
    },
  });

  const updateCoreSetting = useMutation({
    mutationFn: (params: UpdateSettingsRequest) =>
      CoreAPI.settingsUpdate(params),
    onSuccess: () => {
      refetchSettings();
    },
  });

  useEffect(() => {
    if (limitsConfig) {
      const daily = parseDuration(limitsConfig.daily);
      setDailyHours(String(daily.hours));
      setDailyMinutes(String(daily.minutes));

      const session = parseDuration(limitsConfig.session);
      setSessionHours(String(session.hours));
      setSessionMinutes(String(session.minutes));

      const reset = parseDuration(limitsConfig.sessionReset);
      setResetMinutes(String(reset.hours * 60 + reset.minutes));
    }
  }, [limitsConfig]);

  useEffect(() => {
    if (coreSettings) {
      setLaunchGuardTimeout(String(coreSettings.launchGuardTimeout ?? 15));
      setLaunchGuardDelay(String(coreSettings.launchGuardDelay ?? 0));
    }
  }, [coreSettings]);

  useEffect(() => {
    if (!limitsConfig) return;

    if (dailyTimeoutRef.current) {
      clearTimeout(dailyTimeoutRef.current);
    }

    dailyTimeoutRef.current = setTimeout(() => {
      const daily = formatDuration({
        hours: parseInt(dailyHours) || 0,
        minutes: parseInt(dailyMinutes) || 0,
      });
      updateMutation.mutate({ daily });
    }, 500);

    return () => {
      if (dailyTimeoutRef.current) {
        clearTimeout(dailyTimeoutRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dailyHours, dailyMinutes]);

  useEffect(() => {
    if (!limitsConfig) return;

    if (sessionTimeoutRef.current) {
      clearTimeout(sessionTimeoutRef.current);
    }

    sessionTimeoutRef.current = setTimeout(() => {
      const session = formatDuration({
        hours: parseInt(sessionHours) || 0,
        minutes: parseInt(sessionMinutes) || 0,
      });
      updateMutation.mutate({ session });
    }, 500);

    return () => {
      if (sessionTimeoutRef.current) {
        clearTimeout(sessionTimeoutRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionHours, sessionMinutes]);

  useEffect(() => {
    if (!limitsConfig) return;

    if (resetTimeoutRef.current) {
      clearTimeout(resetTimeoutRef.current);
    }

    resetTimeoutRef.current = setTimeout(() => {
      const resetMins = parseInt(resetMinutes) || 0;
      const sessionReset = formatDuration({
        hours: Math.floor(resetMins / 60),
        minutes: resetMins % 60,
      });
      updateMutation.mutate({ sessionReset });
    }, 500);

    return () => {
      if (resetTimeoutRef.current) {
        clearTimeout(resetTimeoutRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetMinutes]);

  useEffect(() => {
    if (!coreSettings) return;

    const timeout = parseFloat(launchGuardTimeout) || 0;
    if (timeout === (coreSettings.launchGuardTimeout ?? 15)) return;

    if (launchGuardTimeoutRef.current) {
      clearTimeout(launchGuardTimeoutRef.current);
    }

    launchGuardTimeoutRef.current = setTimeout(() => {
      updateCoreSetting.mutate({ launchGuardTimeout: timeout });
    }, 500);

    return () => {
      if (launchGuardTimeoutRef.current) {
        clearTimeout(launchGuardTimeoutRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [launchGuardTimeout]);

  useEffect(() => {
    if (!coreSettings) return;

    const delay = parseFloat(launchGuardDelay) || 0;
    if (delay === (coreSettings.launchGuardDelay ?? 0)) return;

    if (launchGuardDelayRef.current) {
      clearTimeout(launchGuardDelayRef.current);
    }

    launchGuardDelayRef.current = setTimeout(() => {
      updateCoreSetting.mutate({ launchGuardDelay: delay });
    }, 500);

    return () => {
      if (launchGuardDelayRef.current) {
        clearTimeout(launchGuardDelayRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [launchGuardDelay]);

  const handleEnabledToggle = (enabled: boolean) => {
    updateMutation.mutate({ enabled });
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
        <h1 className="text-foreground text-xl">
          {t("settings.playControls.title")}
        </h1>
      }
    >
      <div className="flex flex-col gap-6">
        <section className="flex flex-col gap-3">
          <h2 className="text-foreground text-lg font-semibold">
            {t("settings.core.playtime.title")}
          </h2>

          <ToggleSwitch
            label={
              <span className="flex items-center">
                {t("settings.core.playtime.enabled")}
                <SettingHelp
                  title={t("settings.core.playtime.enabled")}
                  description={t("settings.core.playtime.enabledHelp")}
                />
              </span>
            }
            value={limitsConfig?.enabled ?? false}
            setValue={handleEnabledToggle}
            disabled={!connected}
            loading={isConnecting || (connected && isPending)}
          />

          {limitsConfig?.enabled && (
            <div className="bg-background-secondary border-bd-filled flex flex-col gap-2 rounded-lg border p-3">
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">
                    {t("settings.core.playtime.currentSession")}
                  </span>
                  {isStatusPending ? (
                    <Skeleton className="h-5 w-16" />
                  ) : (
                    <Badge
                      variant={getStateBadgeVariant(
                        playtimeStatus?.state ?? "reset",
                      )}
                    >
                      {getStateLabel(playtimeStatus?.state ?? "reset")}
                    </Badge>
                  )}
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">
                    {t("settings.core.playtime.sessionDuration")}
                  </span>
                  {isStatusPending ? (
                    <Skeleton className="h-5 w-14" />
                  ) : (
                    <span
                      aria-label={formatDurationAccessible(
                        playtimeStatus?.sessionDuration ?? "0s",
                        t,
                      )}
                    >
                      {formatDurationDisplay(
                        playtimeStatus?.sessionDuration ?? "0s",
                      )}
                    </span>
                  )}
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">
                    {t("settings.core.playtime.sessionRemaining")}
                  </span>
                  {isStatusPending ? (
                    <Skeleton className="h-5 w-14" />
                  ) : (
                    <span
                      aria-label={formatDurationAccessible(
                        playtimeStatus?.sessionRemaining ?? "0s",
                        t,
                      )}
                    >
                      {formatDurationDisplay(
                        playtimeStatus?.sessionRemaining ?? "0s",
                      )}
                    </span>
                  )}
                </div>
                {playtimeStatus?.cooldownRemaining &&
                  playtimeStatus?.state === "cooldown" && (
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">
                        {t("settings.core.playtime.cooldownRemaining")}
                      </span>
                      <span
                        aria-label={formatDurationAccessible(
                          playtimeStatus.cooldownRemaining,
                          t,
                        )}
                      >
                        {formatDurationDisplay(
                          playtimeStatus.cooldownRemaining,
                        )}
                      </span>
                    </div>
                  )}
              </div>

              <div className="border-bd-filled flex flex-col gap-2 border-t pt-2">
                <span className="text-sm font-medium">
                  {t("settings.core.playtime.dailyUsage")}
                </span>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">
                    {t("settings.core.playtime.dailyUsageToday")}
                  </span>
                  {isStatusPending ? (
                    <Skeleton className="h-5 w-14" />
                  ) : (
                    <span
                      aria-label={formatDurationAccessible(
                        playtimeStatus?.dailyUsageToday ?? "0s",
                        t,
                      )}
                    >
                      {formatDurationDisplay(
                        playtimeStatus?.dailyUsageToday ?? "0s",
                      )}
                    </span>
                  )}
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">
                    {t("settings.core.playtime.dailyRemaining")}
                  </span>
                  {isStatusPending ? (
                    <Skeleton className="h-5 w-14" />
                  ) : (
                    <span
                      aria-label={formatDurationAccessible(
                        playtimeStatus?.dailyRemaining ?? "0s",
                        t,
                      )}
                    >
                      {formatDurationDisplay(
                        playtimeStatus?.dailyRemaining ?? "0s",
                      )}
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}

          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium">
                {t("settings.core.playtime.dailyLimit")}
              </label>
              <div className="flex gap-2">
                <TextInput
                  type="number"
                  placeholder="0"
                  value={dailyHours}
                  setValue={setDailyHours}
                  label={t("settings.core.playtime.hours")}
                  disabled={!connected || !limitsConfig?.enabled}
                />
                <TextInput
                  type="number"
                  placeholder="0"
                  value={dailyMinutes}
                  setValue={setDailyMinutes}
                  label={t("settings.core.playtime.minutes")}
                  disabled={!connected || !limitsConfig?.enabled}
                />
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium">
                {t("settings.core.playtime.sessionLimit")}
              </label>
              <div className="flex gap-2">
                <TextInput
                  type="number"
                  placeholder="0"
                  value={sessionHours}
                  setValue={setSessionHours}
                  label={t("settings.core.playtime.hours")}
                  disabled={!connected || !limitsConfig?.enabled}
                />
                <TextInput
                  type="number"
                  placeholder="0"
                  value={sessionMinutes}
                  setValue={setSessionMinutes}
                  label={t("settings.core.playtime.minutes")}
                  disabled={!connected || !limitsConfig?.enabled}
                />
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium">
                {t("settings.core.playtime.sessionReset")}
              </label>
              <div className="flex gap-2">
                <TextInput
                  type="number"
                  placeholder="0"
                  value={resetMinutes}
                  setValue={setResetMinutes}
                  label={t("settings.core.playtime.minutes")}
                  disabled={!connected || !limitsConfig?.enabled}
                  className="max-w-[calc(50%-0.25rem)]"
                />
              </div>
              <span className="text-muted-foreground text-xs">
                {t("settings.core.playtime.neverReset")}
              </span>
            </div>
          </div>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-foreground text-lg font-semibold">
            {t("settings.core.launchGuard.title")}
          </h2>

          <ToggleSwitch
            label={
              <span className="flex items-center">
                {t("settings.core.launchGuard.enabled")}
                <SettingHelp
                  title={t("settings.core.launchGuard.enabled")}
                  description={t("settings.core.launchGuard.enabledHelp")}
                />
              </span>
            }
            value={launchGuardEnabled}
            setValue={(launchGuardEnabled) => {
              updateCoreSetting.mutate({ launchGuardEnabled });
            }}
            disabled={!connected}
            loading={isConnecting || (connected && !coreSettings)}
          />

          <ToggleSwitch
            label={
              <span className="flex items-center">
                {t("settings.core.launchGuard.requireConfirm")}
                <SettingHelp
                  title={t("settings.core.launchGuard.requireConfirm")}
                  description={t(
                    "settings.core.launchGuard.requireConfirmHelp",
                  )}
                />
              </span>
            }
            value={coreSettings?.launchGuardRequireConfirm ?? false}
            setValue={(launchGuardRequireConfirm) => {
              updateCoreSetting.mutate({ launchGuardRequireConfirm });
            }}
            disabled={!connected || !launchGuardEnabled}
            loading={isConnecting || (connected && !coreSettings)}
          />

          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium">
                {t("settings.core.launchGuard.timeout")}
              </label>
              <div className="flex gap-2">
                <TextInput
                  type="number"
                  placeholder="15"
                  value={launchGuardTimeout}
                  setValue={setLaunchGuardTimeout}
                  label={t("settings.core.launchGuard.seconds")}
                  disabled={!connected || !launchGuardEnabled}
                  className="max-w-[calc(50%-0.25rem)]"
                />
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium">
                {t("settings.core.launchGuard.delay")}
              </label>
              <div className="flex gap-2">
                <TextInput
                  type="number"
                  placeholder="0"
                  value={launchGuardDelay}
                  setValue={setLaunchGuardDelay}
                  label={t("settings.core.launchGuard.seconds")}
                  disabled={!connected || !launchGuardEnabled}
                  className="max-w-[calc(50%-0.25rem)]"
                />
              </div>
            </div>
          </div>
        </section>
      </div>
    </PageFrame>
  );
}
