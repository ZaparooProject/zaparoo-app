import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useState, useEffect, useRef } from "react";
import classNames from "classnames";
import { CoreAPI } from "../lib/coreApi.ts";
import { ToggleSwitch } from "../components/wui/ToggleSwitch";
import { useSmartSwipe } from "../hooks/useSmartSwipe";
import { useStatusStore } from "../lib/store";
import { PageFrame } from "../components/PageFrame";
import { BackIcon } from "../lib/images";
import { TextInput } from "../components/wui/TextInput";
import { formatDuration, formatDurationDisplay, parseDuration } from "../lib/utils";

export const Route = createFileRoute("/settings/playtime")({
  component: PlaytimeSettings
});

function PlaytimeSettings() {
  const connected = useStatusStore((state) => state.connected);
  const { t } = useTranslation();

  const router = useRouter();
  const goBack = () => router.history.back();
  const swipeHandlers = useSmartSwipe({
    onSwipeRight: goBack,
    preventScrollOnSwipe: false
  });

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
  const { data: limitsConfig, refetch: refetchLimits, isPending } = useQuery({
    queryKey: ["playtime", "limits"],
    queryFn: () => CoreAPI.playtimeLimits(),
    enabled: connected,
    refetchOnMount: "always",
    refetchInterval: 30000
  });

  // Fetch playtime status (for display)
  const { data: playtimeStatus } = useQuery({
    queryKey: ["playtime", "status"],
    queryFn: () => CoreAPI.playtime(),
    enabled: connected && limitsConfig?.enabled === true,
    refetchOnMount: "always",
    refetchInterval: 30000
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

  // Show blank page while loading to prevent flicker
  if (isPending) {
    return null;
  }

  return (
    <PageFrame
      {...swipeHandlers}
      headerLeft={
        <button onClick={goBack} className="cursor-pointer">
          <BackIcon size="24" />
        </button>
      }
      headerCenter={
        <h1 className="text-foreground text-xl">{t("settings.playtime.title")}</h1>
      }
    >
      {!connected ? (
        <div className="text-muted-foreground py-8 text-center text-sm">
          {t("notConnected")}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <ToggleSwitch
            label={t("settings.core.playtime.enabled")}
            value={limitsConfig?.enabled ?? false}
            setValue={handleEnabledToggle}
            disabled={!connected}
          />

          {/* Status Display - only shown when enabled and has data */}
          {limitsConfig?.enabled && playtimeStatus && (
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

          {/* Configuration Inputs - always visible, disabled when feature is off */}
          <div className="flex flex-col gap-3">
            {/* Daily Limit */}
            <div className="flex flex-col gap-2">
              <label className={classNames("text-sm font-medium", { "text-muted-foreground": !limitsConfig?.enabled })}>
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

            {/* Session Limit */}
            <div className="flex flex-col gap-2">
              <label className={classNames("text-sm font-medium", { "text-muted-foreground": !limitsConfig?.enabled })}>
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

            {/* Session Reset Timeout */}
            <div className="flex flex-col gap-2">
              <label className={classNames("text-sm font-medium", { "text-muted-foreground": !limitsConfig?.enabled })}>
                {t("settings.core.playtime.sessionReset")}
              </label>
              <TextInput
                type="number"
                placeholder="0"
                value={resetMinutes}
                setValue={setResetMinutes}
                label={t("settings.core.playtime.minutes")}
                disabled={!connected || !limitsConfig?.enabled}
              />
              <span className="text-xs text-muted-foreground">
                {t("settings.core.playtime.neverReset")}
              </span>
            </div>
          </div>
        </div>
      )}
    </PageFrame>
  );
}
