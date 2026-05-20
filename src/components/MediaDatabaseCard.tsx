import { useTranslation } from "react-i18next";
import classNames from "classnames";
import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ConnectionState, useStatusStore } from "@/lib/store";
import { CoreAPI } from "@/lib/coreApi";
import { DatabaseIcon } from "@/lib/images";
import { logger } from "@/lib/logger";
import { Card } from "./wui/Card";
import { Button } from "./wui/Button";
import { SystemSelector, SystemSelectorTrigger } from "./SystemSelector";
import { LoadingSpinner } from "./ui/loading-spinner";

export function MediaDatabaseCard() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const connected = useStatusStore((state) => state.connected);
  const connectionState = useStatusStore((state) => state.connectionState);
  const gamesIndex = useStatusStore((state) => state.gamesIndex);
  const scrapingStatus = useStatusStore((state) => state.scrapingStatus);
  const isLiveConnected = connectionState === ConnectionState.CONNECTED;
  const [cancelRequested, setCancelRequested] = useState(false);
  const [resumeRequested, setResumeRequested] = useState(false);
  const [selectedSystems, setSelectedSystems] = useState<string[]>([]);
  const [systemSelectorOpen, setSystemSelectorOpen] = useState(false);

  const isPaused = gamesIndex.paused === true;
  const isScraping = scrapingStatus?.scraping === true;

  // Derive isCancelling: true only if we requested cancel AND indexing is still happening
  const isCancelling = cancelRequested && gamesIndex.indexing;
  // Derive isResuming: true only if we requested resume AND indexing is still paused
  const isResuming = resumeRequested && isPaused;

  // Reset cancel/resume request when state changes (syncing with external Zustand store state)
  useEffect(() => {
    if (!gamesIndex.indexing && cancelRequested) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Intentional: syncing local UI state with external store
      setCancelRequested(false);
    }
  }, [gamesIndex.indexing, cancelRequested]);

  useEffect(() => {
    if ((!isPaused || !gamesIndex.indexing) && resumeRequested) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Intentional: syncing local UI state with external store
      setResumeRequested(false);
    }
  }, [isPaused, gamesIndex.indexing, resumeRequested]);

  // Fetch real-time database status
  const { data: mediaStatus, isLoading } = useQuery({
    queryKey: ["media"],
    queryFn: () => CoreAPI.media(),
    enabled: connected,
    staleTime: 30000, // Cache for 30 seconds
    retry: false,
  });

  // Fetch systems data for selector
  const { data: systemsData } = useQuery({
    queryKey: ["systems"],
    queryFn: () => CoreAPI.systems(),
    enabled: connected,
  });

  const handleUpdateDatabase = () => {
    // If no systems selected or all systems selected, pass undefined (all systems)
    const systemsToUpdate =
      selectedSystems.length === 0 ||
      (systemsData?.systems &&
        selectedSystems.length === systemsData.systems.length)
        ? undefined
        : selectedSystems;

    CoreAPI.mediaGenerate(
      systemsToUpdate ? { systems: systemsToUpdate } : undefined,
    );
  };

  const handleCancelUpdate = async () => {
    setCancelRequested(true);
    try {
      await CoreAPI.mediaGenerateCancel();
      // Note: Don't reset cancelRequested here - it resets automatically via effect
      // when the indexing status updates from the WebSocket notification
      queryClient.invalidateQueries({ queryKey: ["media"] });
    } catch (error) {
      logger.error("Failed to cancel media generation:", error, {
        category: "api",
        action: "mediaGenerateCancel",
        severity: "warning",
      });
      // Only reset on error, since cancellation request failed
      setCancelRequested(false);
    }
  };

  const handleResumeUpdate = async () => {
    setResumeRequested(true);
    try {
      await CoreAPI.mediaGenerateResume();
      queryClient.invalidateQueries({ queryKey: ["media"] });
    } catch (error) {
      logger.error("Failed to resume media generation:", error, {
        category: "api",
        action: "mediaGenerateResume",
        severity: "warning",
      });
      setResumeRequested(false);
    }
  };

  // Check various states from both store and API
  const isOptimizing =
    gamesIndex.optimizing || mediaStatus?.database?.optimizing;
  const isIndexing = gamesIndex.indexing || mediaStatus?.database?.indexing;

  // Display string for the current step. Core sends `currentStepDisplay` for
  // every phase (folder discovery, per-system loop, writing, indexes, caches);
  // empty/undefined means we haven't received the first notification yet.
  const stepText =
    gamesIndex.currentStepDisplay && gamesIndex.currentStepDisplay !== ""
      ? gamesIndex.currentStepDisplay
      : t("toast.preparingDb");

  const renderStatus = () => {
    // Check optimization status first - this takes priority
    if (isOptimizing) {
      return (
        <div className="mt-3 space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span>{t("settings.updateDb.status.optimizing")}</span>
            {/* No spinner for optimizing - only throbbing bar */}
          </div>
          <div
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={t("settings.updateDb.status.optimizing")}
            className="border-bd-filled bg-background h-[10px] w-full rounded-full border border-solid"
          >
            <div
              className="border-background bg-button-pattern h-[8px] animate-pulse rounded-full border border-solid"
              style={{ width: "100%" }}
            />
          </div>
        </div>
      );
    }

    // Show progress when indexing (either from store or API)
    if (isIndexing) {
      const totalSteps = gamesIndex.totalSteps ?? 0;
      const currentStep = gamesIndex.currentStep ?? 0;
      const hasDetailedProgress = Boolean(
        gamesIndex.indexing && totalSteps > 0,
      );
      const isSystemStep =
        hasDetailedProgress && currentStep > 0 && currentStep < totalSteps;
      const progressPercent = hasDetailedProgress
        ? Math.round((currentStep / totalSteps) * 100)
        : 0;

      return (
        <div className="mt-3 space-y-3">
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span>{stepText}</span>
              {/* Only show spinner for system-specific steps (not phase steps) */}
              {isSystemStep && isLiveConnected && !isPaused ? (
                <LoadingSpinner size={16} className="text-muted-foreground" />
              ) : null}
            </div>
            {(isPaused || !isLiveConnected) && (
              <div className="text-muted-foreground text-xs">
                {isPaused
                  ? t("settings.updateDb.status.paused")
                  : t("settings.updateDb.status.reconnecting")}
              </div>
            )}
            <div
              role="progressbar"
              aria-valuenow={progressPercent}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={t("settings.updateDb.progressLabel")}
              className="border-bd-filled bg-background h-[10px] w-full rounded-full border border-solid"
            >
              <div
                className={classNames(
                  "border-background bg-button-pattern h-[8px] rounded-full border border-solid",
                  {
                    hidden: hasDetailedProgress && currentStep === 0,
                    "animate-pulse":
                      isLiveConnected &&
                      !isPaused &&
                      (!hasDetailedProgress || !isSystemStep),
                  },
                )}
                style={{
                  width: hasDetailedProgress
                    ? currentStep === 0
                      ? "0%"
                      : currentStep >= totalSteps
                        ? "100%"
                        : `${((currentStep / totalSteps) * 100).toFixed(2)}%`
                    : "100%",
                }}
              />
            </div>
          </div>
          <Button
            label={
              isPaused
                ? isResuming
                  ? t("resuming")
                  : t("settings.updateDb.resume")
                : isCancelling
                  ? t("cancelling")
                  : t("settings.updateDb.cancel")
            }
            variant="outline"
            className="w-full"
            disabled={!connected || (isPaused ? isResuming : isCancelling)}
            onClick={isPaused ? handleResumeUpdate : handleCancelUpdate}
          />
        </div>
      );
    }

    // Show connection status
    if (!connected) {
      return (
        <div className="text-muted-foreground mt-3 text-sm">
          {t("settings.updateDb.status.noConnection")}
        </div>
      );
    }

    // Show loading state while fetching database status
    if (isLoading) {
      return (
        <div className="text-muted-foreground mt-3 text-sm">
          {t("settings.updateDb.status.checking")}
        </div>
      );
    }

    // Use real database status from API
    const databaseExists = mediaStatus?.database?.exists ?? false;

    if (!databaseExists && !gamesIndex.indexing && !isOptimizing) {
      return (
        <div className="text-muted-foreground mt-3 text-sm">
          No database found
        </div>
      );
    }

    // Database exists and is ready - show media count if available
    if (databaseExists) {
      const totalMedia = mediaStatus?.database?.totalMedia;
      if (totalMedia !== undefined && totalMedia > 0) {
        const formattedCount = totalMedia.toLocaleString();
        return (
          <div className="text-muted-foreground mt-3 text-sm">
            {t("settings.updateDb.status.mediaCount", {
              count: totalMedia,
              formattedCount,
            })}
          </div>
        );
      } else {
        return (
          <div className="text-muted-foreground mt-3 text-sm">
            {t("settings.updateDb.status.ready")}
          </div>
        );
      }
    }

    return null;
  };

  // Get status text for screen reader announcement
  const getStatusText = (): string => {
    if (isOptimizing) return t("settings.updateDb.status.optimizing");
    if (isIndexing) {
      if (isPaused) {
        return `${stepText} — ${t("settings.updateDb.status.paused")}`;
      }
      if (!isLiveConnected) {
        return `${stepText} — ${t("settings.updateDb.status.reconnecting")}`;
      }
      return stepText;
    }
    return "";
  };

  return (
    <>
      {/* Screen reader announcement for database update progress */}
      <div aria-live="polite" aria-atomic="true" className="sr-only">
        {getStatusText()}
      </div>

      <Card>
        <div className="space-y-3">
          {/* System selector for choosing which systems to update */}
          <SystemSelectorTrigger
            selectedSystems={selectedSystems}
            systemsData={systemsData}
            placeholder={t("settings.updateDb.allSystems")}
            mode="multi"
            onClick={() => setSystemSelectorOpen(true)}
            disabled={!connected || isScraping}
          />

          {isScraping ? (
            <div className="text-muted-foreground text-sm">
              {t("settings.updateDb.blockedByScrape")}
            </div>
          ) : null}

          <div data-tour="update-database">
            <Button
              label={t("settings.updateDb")}
              icon={<DatabaseIcon size="20" />}
              className="w-full"
              disabled={!connected || isIndexing || isOptimizing || isScraping}
              onClick={handleUpdateDatabase}
            />
          </div>

          {renderStatus()}
        </div>
      </Card>

      <SystemSelector
        isOpen={systemSelectorOpen}
        onClose={() => setSystemSelectorOpen(false)}
        onSelect={setSelectedSystems}
        selectedSystems={selectedSystems}
        mode="multi"
        title={t("settings.updateDb.selectSystemsTitle")}
        includeAllOption={true}
      />
    </>
  );
}
