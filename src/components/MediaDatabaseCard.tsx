import { useTranslation } from "react-i18next";
import classNames from "classnames";
import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useStatusStore } from "@/lib/store";
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
  const gamesIndex = useStatusStore((state) => state.gamesIndex);
  const [cancelRequested, setCancelRequested] = useState(false);
  const [selectedSystems, setSelectedSystems] = useState<string[]>([]);
  const [systemSelectorOpen, setSystemSelectorOpen] = useState(false);

  // Derive isCancelling: true only if we requested cancel AND indexing is still happening
  const isCancelling = cancelRequested && gamesIndex.indexing;

  // Reset cancel request when indexing stops (syncing with external Zustand store state)
  useEffect(() => {
    if (!gamesIndex.indexing && cancelRequested) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Intentional: syncing local UI state with external store
      setCancelRequested(false);
    }
  }, [gamesIndex.indexing, cancelRequested]);

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

  // Check various states from both store and API
  const isOptimizing =
    gamesIndex.optimizing || mediaStatus?.database?.optimizing;
  const isIndexing = gamesIndex.indexing || mediaStatus?.database?.indexing;

  const renderStatus = () => {
    // Check optimization status first - this takes priority
    if (isOptimizing) {
      return (
        <div className="mt-3 space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span>{t("settings.updateDb.status.optimizing")}</span>
            {/* No spinner for optimizing - only throbbing bar */}
          </div>
          <div className="border-bd-filled bg-background h-[10px] w-full rounded-full border border-solid">
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
      // Prefer gamesIndex data if available (has detailed progress), otherwise use generic preparing state
      const hasDetailedProgress =
        gamesIndex.indexing &&
        gamesIndex.totalSteps &&
        gamesIndex.totalSteps > 0;

      return (
        <div className="mt-3 space-y-3">
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span>
                {hasDetailedProgress && gamesIndex.currentStepDisplay
                  ? gamesIndex.currentStep === gamesIndex.totalSteps
                    ? t("toast.writingDb")
                    : gamesIndex.currentStepDisplay
                  : t("toast.preparingDb")}
              </span>
              {/* Only show spinner for system-specific steps (not preparing/writing) */}
              {isIndexing &&
                hasDetailedProgress &&
                gamesIndex.currentStepDisplay &&
                gamesIndex.currentStep !== gamesIndex.totalSteps && (
                  <LoadingSpinner size={16} className="text-muted-foreground" />
                )}
            </div>
            <div className="border-bd-filled bg-background h-[10px] w-full rounded-full border border-solid">
              <div
                className={classNames(
                  "border-background bg-button-pattern h-[8px] rounded-full border border-solid",
                  {
                    hidden: hasDetailedProgress && gamesIndex.currentStep === 0,
                    "animate-pulse":
                      !hasDetailedProgress ||
                      gamesIndex.currentStep === 0 ||
                      gamesIndex.currentStep === gamesIndex.totalSteps,
                  },
                )}
                style={{
                  width:
                    hasDetailedProgress &&
                    gamesIndex.currentStep &&
                    gamesIndex.totalSteps
                      ? `${((gamesIndex.currentStep / gamesIndex.totalSteps) * 100).toFixed(2)}%`
                      : "100%",
                }}
              />
            </div>
          </div>
          <Button
            label={
              isCancelling ? t("cancelling") : t("settings.updateDb.cancel")
            }
            variant="outline"
            className="w-full"
            disabled={!connected || isCancelling}
            onClick={handleCancelUpdate}
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
      const hasDetailedProgress =
        gamesIndex.indexing &&
        gamesIndex.totalSteps &&
        gamesIndex.totalSteps > 0;
      if (hasDetailedProgress && gamesIndex.currentStepDisplay) {
        return gamesIndex.currentStep === gamesIndex.totalSteps
          ? t("toast.writingDb")
          : gamesIndex.currentStepDisplay;
      }
      return t("toast.preparingDb");
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
          />

          <div data-tour="update-database">
            <Button
              label={t("settings.updateDb")}
              icon={<DatabaseIcon size="20" />}
              className="w-full"
              disabled={!connected || isIndexing || isOptimizing}
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
