import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useState, useEffect, useRef } from "react";
import classNames from "classnames";
import { CoreAPI } from "../lib/coreApi.ts";
import { ToggleSwitch } from "../components/wui/ToggleSwitch";
import { useSmartSwipe } from "../hooks/useSmartSwipe";
import { useStatusStore } from "../lib/store";
import { PageFrame } from "../components/PageFrame";
import { UpdateSettingsRequest } from "../lib/models.ts";
import { BackIcon, CheckIcon } from "../lib/images";
import { TextInput } from "../components/wui/TextInput";
import { formatDuration, formatDurationDisplay, parseDuration } from "../lib/utils";

export const Route = createFileRoute("/settings/core")({
  component: CoreSettings
});

function CoreSettings() {
  const connected = useStatusStore((state) => state.connected);

  const { data, refetch } = useQuery({
    queryKey: ["settings"],
    queryFn: () => CoreAPI.settings()
  });

  const update = useMutation({
    mutationFn: (params: UpdateSettingsRequest) =>
      CoreAPI.settingsUpdate(params),
    onSuccess: () => refetch()
  });

  const { t } = useTranslation();

  const navigate = useNavigate();
  const swipeHandlers = useSmartSwipe({
    onSwipeRight: () => navigate({ to: "/settings" }),
    preventScrollOnSwipe: false
  });

  return (
    <PageFrame
      {...swipeHandlers}
      headerLeft={
        <button onClick={() => navigate({ to: "/settings" })} className="cursor-pointer">
          <BackIcon size="24" />
        </button>
      }
      headerCenter={
        <h1 className="text-foreground text-xl">{t("settings.core.title")}</h1>
      }
    >
        <div className="py-2">
          <ToggleSwitch
            label={t("settings.core.soundEffects")}
            value={data?.audioScanFeedback ?? false}
            setValue={(v) => update.mutate({ audioScanFeedback: v })}
            disabled={!connected}
          />
        </div>

        <div className="py-2">
          <ToggleSwitch
            label={t("settings.core.autoDetect")}
            value={data?.readersAutoDetect ?? false}
            setValue={(v) => update.mutate({ readersAutoDetect: v })}
            disabled={!connected}
          />
        </div>

        <div className="py-2">
          <ToggleSwitch
            label={t("settings.core.debug")}
            value={data?.debugLogging ?? false}
            setValue={(v) => update.mutate({ debugLogging: v })}
            disabled={!connected}
          />
        </div>

        <div className="py-2">
          <span>{t("settings.modeLabel")}</span>
          <div className="flex flex-row mt-2" role="group">
            <button
              type="button"
              className={classNames(
                "flex",
                "flex-row",
                "w-full",
                "rounded-s-full",
                "items-center",
                "justify-center",
                "py-1",
                "font-medium",
                "gap-1",
                "tracking-[0.1px]",
                "h-9",
                "border",
                "border-solid",
                "border-bd-filled",
                {
                  "bg-button-pattern":
                    data?.readersScanMode === "tap" && connected
                },
                {
                  "bg-background": !connected,
                  "border-foreground-disabled": !connected,
                  "text-foreground-disabled": !connected
                }
              )}
              onClick={() => update.mutate({ readersScanMode: "tap" })}
            >
              {data?.readersScanMode === "tap" && connected && (
                <CheckIcon size="28" />
              )}
              {t("settings.tapMode")}
            </button>
            <button
              type="button"
              className={classNames(
                "flex",
                "flex-row",
                "w-full",
                "rounded-e-full",
                "items-center",
                "justify-center",
                "py-1",
                "font-medium",
                "gap-1",
                "tracking-[0.1px]",
                "h-9",
                "border",
                "border-solid",
                "border-bd-filled",
                {
                  "bg-button-pattern":
                    data?.readersScanMode === "hold" && connected
                },
                {
                  "bg-background": !connected,
                  "border-foreground-disabled": !connected,
                  "text-foreground-disabled": !connected
                }
              )}
              onClick={() => update.mutate({ readersScanMode: "hold" })}
            >
              {data?.readersScanMode === "hold" && connected && (
                <CheckIcon size="28" />
              )}
              {t("settings.insertMode")}
            </button>
          </div>
          {data?.readersScanMode === "hold" && connected && (
            <p className="pt-1 text-sm">{t("settings.insertHelp")}</p>
          )}
        </div>

        {/*<div className="flex flex-col gap-4 pt-1.5">*/}
        {/*  <TextInput*/}
        {/*    label={t("settings.core.insertModeBlocklist")}*/}
        {/*    placeholder="ao486,Gamate,X68000"*/}
        {/*    value={data?.readersScanIgnoreSystems.join(",")}*/}
        {/*    saveValue={(v: string) =>*/}
        {/*      update.mutate({ readersScanIgnoreSystems: v.split(",") })*/}
        {/*    }*/}
        {/*    disabled={!connected}*/}
        {/*  />*/}
        {/*</div>*/}

        {/* Playtime Limits Section */}
        <PlaytimeLimitsSection connected={connected} />
      </PageFrame>
  );
}

function PlaytimeLimitsSection({ connected }: { connected: boolean }) {
  const { t } = useTranslation();

  // Local state for form inputs
  const [dailyHours, setDailyHours] = useState("0");
  const [dailyMinutes, setDailyMinutes] = useState("0");
  const [sessionHours, setSessionHours] = useState("0");
  const [sessionMinutes, setSessionMinutes] = useState("0");
  const [resetMinutes, setResetMinutes] = useState("0");

  // Debounce timers
  const dailyTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const sessionTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const resetTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Fetch playtime limits configuration
  const { data: limitsConfig, refetch: refetchLimits } = useQuery({
    queryKey: ["playtime", "limits"],
    queryFn: () => CoreAPI.playtimeLimits(),
    enabled: connected,
    refetchInterval: false
  });

  // Fetch playtime status (for display)
  const { data: playtimeStatus } = useQuery({
    queryKey: ["playtime", "status"],
    queryFn: () => CoreAPI.playtime(),
    enabled: connected && limitsConfig?.enabled === true,
    refetchInterval: limitsConfig?.enabled ? 30000 : false // Refresh every 30s when enabled
  });

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: CoreAPI.playtimeLimitsUpdate.bind(CoreAPI),
    onSuccess: () => {
      refetchLimits();
    }
  });

  // Initialize form values when data loads
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

  // Auto-update daily limit when values change
  useEffect(() => {
    if (!limitsConfig) return;

    if (dailyTimeoutRef.current) {
      clearTimeout(dailyTimeoutRef.current);
    }

    dailyTimeoutRef.current = setTimeout(() => {
      const daily = formatDuration({
        hours: parseInt(dailyHours) || 0,
        minutes: parseInt(dailyMinutes) || 0
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

  // Auto-update session limit when values change
  useEffect(() => {
    if (!limitsConfig) return;

    if (sessionTimeoutRef.current) {
      clearTimeout(sessionTimeoutRef.current);
    }

    sessionTimeoutRef.current = setTimeout(() => {
      const session = formatDuration({
        hours: parseInt(sessionHours) || 0,
        minutes: parseInt(sessionMinutes) || 0
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

  // Auto-update session reset when value changes
  useEffect(() => {
    if (!limitsConfig) return;

    if (resetTimeoutRef.current) {
      clearTimeout(resetTimeoutRef.current);
    }

    resetTimeoutRef.current = setTimeout(() => {
      const resetMins = parseInt(resetMinutes) || 0;
      const sessionReset = formatDuration({
        hours: Math.floor(resetMins / 60),
        minutes: resetMins % 60
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

  if (!connected) {
    return null;
  }

  const handleEnabledToggle = (enabled: boolean) => {
    updateMutation.mutate({ enabled });
  };

  const getStateBadgeColor = (state: string) => {
    switch (state) {
      case "active":
        return "bg-green-500/20 text-green-400";
      case "cooldown":
        return "bg-yellow-500/20 text-yellow-400";
      case "reset":
      default:
        return "bg-gray-500/20 text-gray-400";
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
    <div className="flex flex-col gap-3 mt-6">
      <h2 className="text-lg font-semibold">{t("settings.core.playtime.title")}</h2>

      <ToggleSwitch
        label={t("settings.core.playtime.enabled")}
        value={limitsConfig?.enabled ?? false}
        setValue={handleEnabledToggle}
        disabled={!connected}
      />

      {limitsConfig?.enabled && (
        <>
          {/* Status Display */}
          {playtimeStatus && (
            <div className="flex flex-col gap-2 p-3 rounded-lg bg-background-secondary border border-bd-filled">
              {/* Session Status */}
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">{t("settings.core.playtime.currentSession")}</span>
                  <span className={classNames(
                    "text-xs px-2 py-0.5 rounded-full",
                    getStateBadgeColor(playtimeStatus.state)
                  )}>
                    {getStateLabel(playtimeStatus.state)}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">{t("settings.core.playtime.sessionDuration")}</span>
                  <span>{formatDurationDisplay(playtimeStatus.sessionDuration)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">{t("settings.core.playtime.sessionRemaining")}</span>
                  <span>{formatDurationDisplay(playtimeStatus.sessionRemaining)}</span>
                </div>
                {playtimeStatus.cooldownRemaining && playtimeStatus.state === "cooldown" && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">{t("settings.core.playtime.cooldownRemaining")}</span>
                    <span>{formatDurationDisplay(playtimeStatus.cooldownRemaining)}</span>
                  </div>
                )}
              </div>

              {/* Daily Status */}
              <div className="flex flex-col gap-2 pt-2 border-t border-bd-filled">
                <span className="text-sm font-medium">{t("settings.core.playtime.dailyUsage")}</span>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">{t("settings.core.playtime.dailyUsageToday")}</span>
                  <span>{formatDurationDisplay(playtimeStatus.dailyUsageToday)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">{t("settings.core.playtime.dailyRemaining")}</span>
                  <span>{formatDurationDisplay(playtimeStatus.dailyRemaining)}</span>
                </div>
              </div>
            </div>
          )}

          {/* Configuration Inputs */}
          <div className="flex flex-col gap-3">
            {/* Daily Limit */}
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium">{t("settings.core.playtime.dailyLimit")}</label>
              <div className="flex gap-2">
                <TextInput
                  type="number"
                  placeholder="0"
                  value={dailyHours}
                  setValue={setDailyHours}
                  label={t("settings.core.playtime.hours")}
                  disabled={!connected}
                />
                <TextInput
                  type="number"
                  placeholder="0"
                  value={dailyMinutes}
                  setValue={setDailyMinutes}
                  label={t("settings.core.playtime.minutes")}
                  disabled={!connected}
                />
              </div>
            </div>

            {/* Session Limit */}
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium">{t("settings.core.playtime.sessionLimit")}</label>
              <div className="flex gap-2">
                <TextInput
                  type="number"
                  placeholder="0"
                  value={sessionHours}
                  setValue={setSessionHours}
                  label={t("settings.core.playtime.hours")}
                  disabled={!connected}
                />
                <TextInput
                  type="number"
                  placeholder="0"
                  value={sessionMinutes}
                  setValue={setSessionMinutes}
                  label={t("settings.core.playtime.minutes")}
                  disabled={!connected}
                />
              </div>
            </div>

            {/* Session Reset Timeout */}
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium">{t("settings.core.playtime.sessionReset")}</label>
              <TextInput
                type="number"
                placeholder="0"
                value={resetMinutes}
                setValue={setResetMinutes}
                label={t("settings.core.playtime.minutes")}
                disabled={!connected}
              />
              <span className="text-xs text-muted-foreground">
                {t("settings.core.playtime.neverReset")}
              </span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
