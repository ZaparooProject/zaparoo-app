import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { ToggleSwitch } from "@/components/wui/ToggleSwitch";
import { SettingHelp } from "@/components/wui/SettingHelp";
import { useStatusStore, ConnectionState } from "@/lib/store";
import { PageFrame } from "@/components/PageFrame";
import {
  usePreferencesStore,
  selectAppSettings,
  selectShakeSettings,
} from "@/lib/preferencesStore";
import { BackIcon } from "@/lib/images";
import { appBackNavigationOptions } from "@/lib/tabSessionStore";
import { Skeleton } from "@/components/ui/skeleton";
import { HeaderButton } from "@/components/wui/HeaderButton";
import { ReaderStatusRow } from "@/components/ReaderStatusRow";
import { SystemSelector } from "@/components/SystemSelector";
import { Button } from "@/components/wui/Button";
import { EmptyState } from "@/components/wui/EmptyState";
import { useProPurchase } from "@/components/ProPurchase";
import { ProBadge } from "@/components/ProBadge";
import { ZapScriptInput } from "@/components/ZapScriptInput";
import { CoreAPI } from "@/lib/coreApi";
import { ClientCapability, UpdateSettingsRequest } from "@/lib/models.ts";
import { useAppUi } from "@/hooks/useAppUi";
import { usePageHeadingFocus } from "@/hooks/usePageHeadingFocus";
import { TabBar } from "@/components/wui/TabBar";
import { Card } from "@/components/wui/Card";
import { useClientCapability } from "@/hooks/useClientCapability";
import { useCoreFeature } from "@/hooks/useCoreFeature";
import { GatedFeature } from "@/components/GatedFeature";

export const Route = createFileRoute("/settings/readers")({
  component: ReadersSettings,
});

export function ReadersSettings() {
  const { t } = useTranslation();
  const headingRef = usePageHeadingFocus<HTMLHeadingElement>(
    t("settings.readers.title"),
  );
  const connected = useStatusStore((state) => state.connected);
  const connectionState = useStatusStore((state) => state.connectionState);
  const canWriteCoreSettings = useClientCapability(
    ClientCapability.SettingsWrite,
  );
  const [systemPickerOpen, setSystemPickerOpen] = useState(false);
  const { available: readersAvailable } = useCoreFeature("readers", {
    requireKnownSupport: true,
  });

  // Determine if we're in a loading state (connecting or reconnecting)
  const isConnecting =
    connectionState === ConnectionState.CONNECTING ||
    connectionState === ConnectionState.RECONNECTING;
  const appUi = useAppUi();

  // Core settings query
  const {
    data: coreSettings,
    refetch,
    isPending,
  } = useQuery({
    queryKey: ["settings"],
    queryFn: () => CoreAPI.settings(),
  });

  // Connected readers query - polls every 5 seconds while page is open
  const { data: readersData, isPending: isReadersPending } = useQuery({
    queryKey: ["readers"],
    queryFn: () => CoreAPI.readers(),
    enabled: connected && readersAvailable,
    refetchInterval: 5000,
  });

  const updateCoreSetting = useMutation({
    mutationFn: (params: UpdateSettingsRequest) =>
      CoreAPI.settingsUpdate(params),
    onSuccess: () => refetch(),
  });

  // Get app settings from store
  const {
    restartScan,
    launchOnScan,
    launcherAccess,
    preferRemoteWriter,
    keepScreenAwake,
    setRestartScan,
    setLaunchOnScan,
    setPreferRemoteWriter,
    setKeepScreenAwake,
  } = usePreferencesStore(useShallow(selectAppSettings));

  // Get shake settings from store
  const {
    shakeEnabled,
    shakeMode,
    shakeZapscript,
    setShakeEnabled,
    setShakeMode,
    setShakeZapscript,
  } = usePreferencesStore(useShallow(selectShakeSettings));

  // Extract system name from zapscript for display
  const getSystemFromZapscript = () => {
    if (
      shakeMode === "random" &&
      shakeZapscript.startsWith("**launch.random:")
    ) {
      return shakeZapscript.replace("**launch.random:", "");
    }
    return "";
  };

  const shakeSystem = getSystemFromZapscript();

  const { purchaseModal, setProPurchaseModalOpen } = useProPurchase();

  const router = useRouter();
  const goBack = () =>
    void router.navigate(appBackNavigationOptions("/settings"));

  // Show loading skeletons when connecting or when connected but data is loading
  const isLoading = isConnecting || (connected && isPending);
  const isReadersLoading = isConnecting || (connected && isReadersPending);

  return (
    <PageFrame
      onSwipeBack={goBack}
      headerLeft={
        <HeaderButton
          onClick={goBack}
          icon={<BackIcon size="24" />}
          aria-label={t("nav.back")}
        />
      }
      headerCenter={
        <h1 ref={headingRef} className="text-foreground text-xl">
          {t("settings.readers.title")}
        </h1>
      }
    >
      <div className="flex flex-col gap-5">
        {/* Readers List */}
        <GatedFeature featureId="readers">
          <Card>
            <span className="text-foreground">
              {t("settings.readers.connectedReaders")}
            </span>
            <div className="mt-2 flex flex-col gap-2">
              {isReadersLoading ? (
                <span className="text-muted-foreground">{t("loading")}</span>
              ) : !connected ? (
                <EmptyState
                  size="compact"
                  title={t("settings.readers.noReadersDetected")}
                />
              ) : readersData?.readers && readersData.readers.length > 0 ? (
                readersData.readers.map((reader) => (
                  <ReaderStatusRow
                    key={reader.id}
                    name={reader.info || reader.id}
                    connected={reader.connected}
                  />
                ))
              ) : (
                <EmptyState
                  size="compact"
                  title={t("settings.readers.noReadersDetected")}
                />
              )}
            </div>
          </Card>
        </GatedFeature>

        <Card className="flex flex-col gap-4">
          {/* Scan Mode - from Core */}
          <div className="py-2">
            <span className="mb-2 flex items-center text-sm font-medium">
              <span id="scan-mode-label">{t("settings.readers.scanMode")}</span>
              <SettingHelp
                title={t("settings.readers.scanMode")}
                description={t("settings.readers.scanModeHelp")}
              />
            </span>
            {isLoading ? (
              <div className="mt-2 flex flex-row">
                <Skeleton className="h-12 w-full rounded-md" />
                <Skeleton className="h-12 w-full rounded-md" />
              </div>
            ) : (
              <TabBar
                label={t("settings.readers.scanMode")}
                value={connected ? (coreSettings?.readersScanMode ?? "") : ""}
                options={[
                  { value: "tap", label: t("settings.tapMode") },
                  { value: "hold", label: t("settings.insertMode") },
                ]}
                disabled={!canWriteCoreSettings}
                onChange={(value) => {
                  if (value === "tap" || value === "hold")
                    updateCoreSetting.mutate({ readersScanMode: value });
                }}
              />
            )}
          </div>

          {/* Continuous Scan - from App (always shown) */}
          <ToggleSwitch
            label={
              <span className="flex items-center">
                {t("settings.readers.continuousScan")}
                <SettingHelp
                  title={t("settings.readers.continuousScan")}
                  description={t("settings.readers.continuousScanHelp")}
                />
              </span>
            }
            value={restartScan}
            setValue={setRestartScan}
          />

          {/* Keep Screen On - from App (native only) */}
          {appUi.enabled && (
            <ToggleSwitch
              label={
                <span className="flex items-center">
                  {t("settings.readers.keepScreenAwake")}
                  <SettingHelp
                    title={t("settings.readers.keepScreenAwake")}
                    description={t("settings.readers.keepScreenAwakeHelp")}
                  />
                </span>
              }
              value={keepScreenAwake}
              setValue={setKeepScreenAwake}
            />
          )}

          {/* Launch On Scan - from App (native only, Pro feature) */}
          {appUi.enabled && connected && (
            <ToggleSwitch
              label={
                <span className="flex items-center">
                  {t("settings.readers.launchOnScan")}
                  <SettingHelp
                    title={t("settings.readers.launchOnScan")}
                    description={t("settings.readers.launchOnScanHelp")}
                  />
                </span>
              }
              suffix={
                <ProBadge
                  onPress={() => setProPurchaseModalOpen(true)}
                  show={!launcherAccess}
                />
              }
              value={launchOnScan}
              setValue={setLaunchOnScan}
            />
          )}

          {/* Prefer External Reader - from App (native + NFC) */}
          {appUi.nfc && (
            <ToggleSwitch
              label={
                <span className="flex items-center">
                  {t("settings.readers.preferExternalReader")}
                  <SettingHelp
                    title={t("settings.readers.preferExternalReader")}
                    description={t("settings.readers.preferExternalReaderHelp")}
                  />
                </span>
              }
              value={preferRemoteWriter}
              setValue={setPreferRemoteWriter}
            />
          )}

          {/* Shake to Launch - from App (native + accelerometer, Pro feature) */}
          {appUi.accelerometer && (
            <ToggleSwitch
              label={
                <span className="flex items-center">
                  {t("settings.readers.shakeToLaunch")}
                  <SettingHelp
                    title={t("settings.readers.shakeToLaunch")}
                    description={t("settings.readers.shakeToLaunchHelp")}
                  />
                </span>
              }
              suffix={
                <ProBadge
                  onPress={() => setProPurchaseModalOpen(true)}
                  show={!launcherAccess}
                />
              }
              value={shakeEnabled}
              setValue={setShakeEnabled}
              disabled={!connected}
              loading={isLoading}
            />
          )}

          {appUi.accelerometer && shakeEnabled && (
            <>
              <TabBar
                label={t("settings.app.shakeModeLabel")}
                value={connected ? shakeMode : ""}
                options={[
                  {
                    value: "random",
                    label: t("settings.app.shakeRandomMedia"),
                  },
                  { value: "custom", label: t("settings.app.shakeCustom") },
                ]}
                disabled={!connected}
                onChange={(value) => {
                  if (value === "random" || value === "custom")
                    setShakeMode(value);
                }}
              />

              {shakeMode === "random" && (
                <div>
                  <div className="flex items-center justify-between gap-2">
                    {shakeSystem ? (
                      <span className="text-foreground">
                        {shakeSystem === "all"
                          ? t("systemSelector.allSystems")
                          : shakeSystem}
                      </span>
                    ) : (
                      <span className="text-foreground">-</span>
                    )}
                    <Button
                      label={t("settings.app.shakeSelectSystem")}
                      onClick={() => setSystemPickerOpen(true)}
                      variant="outline"
                      size="sm"
                      disabled={!connected}
                    />
                  </div>
                </div>
              )}

              {shakeMode === "custom" && (
                <div>
                  <ZapScriptInput
                    value={shakeZapscript}
                    setValue={setShakeZapscript}
                    showPalette={false}
                    rows={2}
                  />
                </div>
              )}
            </>
          )}

          {/* Audio Feedback - from Core */}
          <ToggleSwitch
            label={
              <span className="flex items-center">
                {t("settings.readers.audioFeedback")}
                <SettingHelp
                  title={t("settings.readers.audioFeedback")}
                  description={t("settings.readers.audioFeedbackHelp")}
                />
              </span>
            }
            value={coreSettings?.audioScanFeedback ?? false}
            setValue={(v) => updateCoreSetting.mutate({ audioScanFeedback: v })}
            disabled={!canWriteCoreSettings}
            loading={isLoading}
          />

          {/* Auto Detect Readers - from Core */}
          <ToggleSwitch
            label={
              <span className="flex items-center">
                {t("settings.readers.autoDetectReaders")}
                <SettingHelp
                  title={t("settings.readers.autoDetectReaders")}
                  description={t("settings.readers.autoDetectReadersHelp")}
                />
              </span>
            }
            value={coreSettings?.readersAutoDetect ?? false}
            setValue={(v) => updateCoreSetting.mutate({ readersAutoDetect: v })}
            disabled={!canWriteCoreSettings}
            loading={isLoading}
          />
        </Card>
      </div>

      <SystemSelector
        isOpen={systemPickerOpen}
        onClose={() => setSystemPickerOpen(false)}
        onSelect={(systems) => {
          const selectedSystem = systems.length === 0 ? "all" : systems[0];
          setShakeZapscript(`**launch.random:${selectedSystem}`);
        }}
        selectedSystems={shakeSystem ? [shakeSystem] : []}
        mode="single"
        title={t("settings.app.shakeSelectSystem")}
        includeAllOption={true}
      />

      {purchaseModal}
    </PageFrame>
  );
}
