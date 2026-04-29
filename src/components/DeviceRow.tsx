import { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Lock } from "lucide-react";
import { Card } from "./wui/Card";

export interface DeviceRowEntry {
  address: string;
  name?: string;
  platform?: string;
  version?: string;
}

interface DeviceRowProps {
  entry: DeviceRowEntry;
  isActive?: boolean;
  isPaired?: boolean;
  onSelect: () => void;
  rightSlot?: ReactNode;
}

export function DeviceRow({
  entry,
  isActive,
  isPaired,
  onSelect,
  rightSlot,
}: DeviceRowProps) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-row items-center gap-2">
      <Card
        onClick={onSelect}
        className="flex flex-1 flex-row items-center gap-3"
      >
        <span
          aria-label={isActive ? t("settings.activeDevice") : undefined}
          style={
            isActive ? { backgroundColor: "var(--color-success)" } : undefined
          }
          className="h-2 w-2 shrink-0 rounded-full"
        />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex items-center justify-between gap-2">
            <span className="text-foreground truncate font-medium">
              {entry.name || entry.address}
            </span>
            {isPaired && (
              <Lock
                className="text-success h-4 w-4 shrink-0"
                aria-label={t("connection.encrypted")}
              />
            )}
          </div>
          {entry.name && (
            <div className="flex items-center justify-between gap-2">
              <span className="text-foreground-muted truncate text-sm">
                {entry.address}
              </span>
              {entry.platform && (
                <span className="text-foreground-muted shrink-0 text-sm">
                  {entry.platform}
                </span>
              )}
            </div>
          )}
          {entry.version && (
            <div className="flex items-center justify-between gap-2">
              <span className="text-foreground-muted text-xs">
                {t("settings.networkScan.version", { version: entry.version })}
              </span>
              {!entry.name && entry.platform && (
                <span className="text-foreground-muted shrink-0 text-sm">
                  {entry.platform}
                </span>
              )}
            </div>
          )}
        </div>
      </Card>
      {rightSlot}
    </div>
  );
}
