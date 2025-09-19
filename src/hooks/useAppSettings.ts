import { useState, useEffect } from "react";
import { Preferences } from "@capacitor/preferences";
import { sessionManager } from "../lib/nfc";

interface UseAppSettingsProps {
  initData: {
    restartScan: boolean;
    launchOnScan: boolean;
    launcherAccess: boolean;
    preferRemoteWriter: boolean;
  };
}

export function useAppSettings({ initData }: UseAppSettingsProps) {
  const [restartScan, setRestartScan] = useState(initData.restartScan);
  const [launchOnScan, setLaunchOnScan] = useState(initData.launchOnScan);
  const [preferRemoteWriter, setPreferRemoteWriter] = useState(initData.preferRemoteWriter);

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
    Preferences.set({ key: "restartScan", value: value.toString() });
  };

  const handleSetLaunchOnScan = (value: boolean) => {
    setLaunchOnScan(value);
    Preferences.set({ key: "launchOnScan", value: value.toString() });
  };

  const handleSetPreferRemoteWriter = (value: boolean) => {
    setPreferRemoteWriter(value);
    Preferences.set({ key: "preferRemoteWriter", value: value.toString() });
  };

  return {
    restartScan,
    setRestartScan: handleSetRestartScan,
    launchOnScan,
    setLaunchOnScan: handleSetLaunchOnScan,
    launcherAccess,
    preferRemoteWriter,
    setPreferRemoteWriter: handleSetPreferRemoteWriter
  };
}