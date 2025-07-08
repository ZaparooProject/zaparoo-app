import { useTranslation } from "react-i18next";
import { Capacitor } from "@capacitor/core";
import { Preferences } from "@capacitor/preferences";
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
  setLaunchOnScan
}: ScanSettingsProps) {
  const { t } = useTranslation();

  const handleRestartScanToggle = (v: boolean) => {
    setRestartScan(v);
    Preferences.set({
      key: "restartScan",
      value: v.toString()
    });
  };

  const handleLaunchOnScanToggle = (v: boolean) => {
    setLaunchOnScan(v);
    Preferences.set({
      key: "launchOnScan",
      value: v.toString()
    });
  };

  if (!connected) {
    return (
      <div className="mb-3 flex flex-col">
        <ToggleSwitch
          label={t("scan.continuous")}
          value={restartScan}
          setValue={handleRestartScanToggle}
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
        setValue={handleRestartScanToggle}
      />
      <ToggleSwitch
        label={t("scan.launchOnScan")}
        value={launchOnScan}
        setValue={handleLaunchOnScanToggle}
      />
    </div>
  );
}