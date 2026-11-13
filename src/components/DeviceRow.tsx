import { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { LockIcon } from "lucide-react";
import { Card } from "./wui/Card";

export interface DeviceRowEntry {
  name: string;
  /** One quiet line under the name, such as the platform. */
  detail?: string;
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
    <div className="flex flex-row flex-wrap items-center gap-2">
      <Card
        onClick={onSelect}
        className="flex min-w-0 flex-[1_1_8rem] flex-row items-center gap-3 wrap-anywhere"
      >
        {isActive && (
          <span
            role="img"
            aria-label={t("settings.activeDevice")}
            className="bg-success h-2 w-2 shrink-0 rounded-full"
          />
        )}
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex items-center justify-between gap-2">
            <span className="text-foreground truncate font-medium">
              {entry.name}
            </span>
            {isPaired && (
              <LockIcon
                className="text-success h-4 w-4 shrink-0"
                aria-label={t("connection.encrypted")}
              />
            )}
          </div>
          {entry.detail && (
            <span className="text-muted-foreground min-w-0 truncate text-sm">
              {entry.detail}
            </span>
          )}
        </div>
      </Card>
      {rightSlot}
    </div>
  );
}
