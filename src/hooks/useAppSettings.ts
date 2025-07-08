import { useState, useEffect } from "react";
import { Preferences } from "@capacitor/preferences";
import { sessionManager } from "../lib/nfc";

interface UseAppSettingsProps {
  initData: {
    restartScan: boolean;
    launchOnScan: boolean;
  };
}

export function useAppSettings({ initData }: UseAppSettingsProps) {
  const [restartScan, setRestartScan] = useState(initData.restartScan);
  const [launchOnScan, setLaunchOnScan] = useState(initData.launchOnScan);
  const [launcherAccess, setLauncherAccess] = useState(false);

  useEffect(() => {
    sessionManager.setShouldRestart(restartScan);
  }, [restartScan]);

  useEffect(() => {
    sessionManager.setLaunchOnScan(launchOnScan);
  }, [launchOnScan]);

  useEffect(() => {
    Preferences.get({ key: "restartScan" }).then((result) => {
      if (result.value) {
        setRestartScan(result.value === "true");
      }
    });
  }, []);

  useEffect(() => {
    Preferences.get({ key: "launchOnScan" }).then((result) => {
      if (result.value) {
        setLaunchOnScan(result.value !== "false");
      }
    });
  }, []);

  useEffect(() => {
    Preferences.get({ key: "launcherAccess" }).then((result) => {
      if (result.value) {
        setLauncherAccess(result.value === "true");
      }
    });
  }, []);

  return {
    restartScan,
    setRestartScan,
    launchOnScan,
    setLaunchOnScan,
    launcherAccess
  };
}