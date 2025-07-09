import { useEffect, useState } from "react";
import { getUsageStats } from "@/lib/dailyUsage.ts";
import { Card } from "../wui/Card";
import { useTranslation } from "react-i18next";

interface DailyUsageInfoProps {
  launcherAccess: boolean;
  connected: boolean;
  openProModal: () => void;
}

export function DailyUsageInfo({
  launcherAccess,
  connected,
  openProModal
}: DailyUsageInfoProps) {
  const [usageStats, setUsageStats] = useState<{
    used: number;
    remaining: number;
    limit: number;
  } | null>(null);

  const { t } = useTranslation();

  useEffect(() => {
    if (!launcherAccess && connected) {
      getUsageStats(launcherAccess).then(setUsageStats);
    } else {
      setUsageStats(null);
    }
  }, [launcherAccess, connected]);

  if (launcherAccess || !connected || !usageStats) {
    return null;
  }

  const percentage = (usageStats.used / usageStats.limit) * 100;
  const isNearLimit = percentage >= 66; // Show warning when 2/3 used
  const isAtLimit = usageStats.remaining === 0;

  return (
    <Card className="mb-4" onClick={openProModal}>
      <div className="flex flex-row items-center justify-between gap-3">
        <div className="flex grow flex-col">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">
              {t("scan.freeUsageTitle")}
            </span>
            <span
              className={`font-mono text-sm ${isAtLimit ? "text-error" : isNearLimit ? "text-yellow-500" : "text-muted-foreground"}`}
            >
              {usageStats.used}/{usageStats.limit}
            </span>
          </div>

          <div className="bg-muted mt-2 h-2 w-full rounded-full">
            <div
              className={`h-full rounded-full transition-all duration-300 ${
                isAtLimit
                  ? "bg-error"
                  : isNearLimit
                    ? "bg-yellow-500"
                    : "bg-primary"
              }`}
              style={{ width: `${Math.min(percentage, 100)}%` }}
            />
          </div>

          {usageStats.remaining > 0 ? (
            <p className="text-muted-foreground mt-1 text-xs">
              {t("scan.freeUsageRemaining", {
                remaining: usageStats.remaining
              })}
            </p>
          ) : (
            <p className="text-error mt-1 text-xs">
              {t("scan.freeUsageExceeded")}
            </p>
          )}
        </div>
      </div>
    </Card>
  );
}
