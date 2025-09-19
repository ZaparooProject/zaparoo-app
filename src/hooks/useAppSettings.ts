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
  const [preferRemoteWriter, setPreferRemoteWriter] = useState(false);

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
      Preferences.get({ key: "launcherAccess" }),
      Preferences.get({ key: "preferRemoteWriter" })
    ]).then(([restartResult, launchResult, accessResult, remoteWriterResult]) => {
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
      if (remoteWriterResult.value) {
        setPreferRemoteWriter(remoteWriterResult.value === "true");
      }
    });
    
    return () => {
      isMounted = false;
    };
  }, []);

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