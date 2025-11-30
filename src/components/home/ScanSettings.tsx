import { useTranslation } from "react-i18next";
import { Capacitor } from "@capacitor/core";
import { ToggleSwitch } from "../wui/ToggleSwitch";

interface ScanSettingsProps {
  connected: boolean;
  restartScan: boolean;
  setRestartScan: (value: boolean) => void;
  launchOnScan: boolean;
  setLaunchOnScan: (value: boolean) => void;
}

export function ScanSettings({
  connected,
  restartScan,
  setRestartScan,
  launchOnScan,
  setLaunchOnScan,
}: ScanSettingsProps) {
  const { t } = useTranslation();

  if (!connected) {
    return (
      <div className="mb-3 flex flex-col">
        <ToggleSwitch
          label={t("scan.continuous")}
          value={restartScan}
          setValue={setRestartScan}
        />
      </div>
    );
  }

  if (!Capacitor.isNativePlatform()) {
    return null;
  }

  return (
    <div className="flex flex-col gap-3">
      <ToggleSwitch
        label={t("scan.continuous")}
        value={restartScan}
        setValue={setRestartScan}
      />
      <ToggleSwitch
        label={t("scan.launchOnScan")}
        value={launchOnScan}
        setValue={setLaunchOnScan}
      />
    </div>
  );
}
