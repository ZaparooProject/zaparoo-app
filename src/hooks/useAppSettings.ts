import { useState, useEffect } from "react";
import { Preferences } from "@capacitor/preferences";
import { sessionManager } from "../lib/nfc";
import { logger } from "../lib/logger";

interface UseAppSettingsProps {
  initData: {
    restartScan: boolean;
    launchOnScan: boolean;
    launcherAccess: boolean;
    preferRemoteWriter: boolean;
    shakeEnabled: boolean;
    shakeMode: "random" | "custom";
    shakeZapscript: string;
  };
}

export function useAppSettings({ initData }: UseAppSettingsProps) {
  const [restartScan, setRestartScan] = useState(initData.restartScan);
  const [launchOnScan, setLaunchOnScan] = useState(initData.launchOnScan);
  const [preferRemoteWriter, setPreferRemoteWriter] = useState(initData.preferRemoteWriter);
  const [shakeEnabled, setShakeEnabled] = useState(initData.shakeEnabled);
  const [shakeMode, setShakeMode] = useState(initData.shakeMode);
  const [shakeZapscript, setShakeZapscript] = useState(initData.shakeZapscript);

  // launcherAccess is read-only, just use the init value
  const launcherAccess = initData.launcherAccess;

  useEffect(() => {
    sessionManager.setShouldRestart(restartScan);
  }, [restartScan]);

  useEffect(() => {
    sessionManager.setLaunchOnScan(launchOnScan);
  }, [launchOnScan]);


  const handleSetRestartScan = (value: boolean) => {
    setRestartScan(value);
    Preferences.set({ key: "restartScan", value: value.toString() })
      .catch((e) => logger.error("Failed to save restartScan preference:", e));
  };

  const handleSetLaunchOnScan = (value: boolean) => {
    setLaunchOnScan(value);
    Preferences.set({ key: "launchOnScan", value: value.toString() })
      .catch((e) => logger.error("Failed to save launchOnScan preference:", e));
  };

  const handleSetPreferRemoteWriter = (value: boolean) => {
    setPreferRemoteWriter(value);
    Preferences.set({ key: "preferRemoteWriter", value: value.toString() })
      .catch((e) => logger.error("Failed to save preferRemoteWriter preference:", e));
  };

  const handleSetShakeEnabled = (value: boolean) => {
    setShakeEnabled(value);
    Preferences.set({ key: "shakeEnabled", value: value.toString() })
      .catch((e) => logger.error("Failed to save shakeEnabled preference:", e));
  };

  const handleSetShakeMode = (value: "random" | "custom") => {
    setShakeMode(value);
    Preferences.set({ key: "shakeMode", value })
      .catch((e) => logger.error("Failed to save shakeMode preference:", e));
    // Clear zapscript when mode changes
    setShakeZapscript("");
    Preferences.set({ key: "shakeZapscript", value: "" })
      .catch((e) => logger.error("Failed to save shakeZapscript preference:", e));
  };

  const handleSetShakeZapscript = (value: string) => {
    setShakeZapscript(value);
    Preferences.set({ key: "shakeZapscript", value })
      .catch((e) => logger.error("Failed to save shakeZapscript preference:", e));
  };

  return {
    restartScan,
    setRestartScan: handleSetRestartScan,
    launchOnScan,
    setLaunchOnScan: handleSetLaunchOnScan,
    launcherAccess,
    preferRemoteWriter,
    setPreferRemoteWriter: handleSetPreferRemoteWriter,
    shakeEnabled,
    setShakeEnabled: handleSetShakeEnabled,
    shakeMode,
    setShakeMode: handleSetShakeMode,
    shakeZapscript,
    setShakeZapscript: handleSetShakeZapscript
  };
}