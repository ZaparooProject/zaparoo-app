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
    let isMounted = true;
    
    Promise.all([
      Preferences.get({ key: "restartScan" }),
      Preferences.get({ key: "launchOnScan" }),
      Preferences.get({ key: "launcherAccess" })
    ]).then(([restartResult, launchResult, accessResult]) => {
      if (!isMounted) return;
      
      if (restartResult.value) {
        setRestartScan(restartResult.value === "true");
      }
      if (launchResult.value) {
        setLaunchOnScan(launchResult.value !== "false");
      }
      if (accessResult.value) {
        setLauncherAccess(accessResult.value === "true");
      }
    });
    
    return () => {
      isMounted = false;
    };
  }, []);

  return {
    restartScan,
    setRestartScan,
    launchOnScan,
    setLaunchOnScan,
    launcherAccess
  };
}