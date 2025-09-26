import { useTranslation } from "react-i18next";
import classNames from "classnames";
import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useStatusStore } from "@/lib/store";
import { CoreAPI } from "@/lib/coreApi";
import { DatabaseIcon } from "@/lib/images";
import { Card } from "./wui/Card";
import { Button } from "./wui/Button";

export function MediaDatabaseCard() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const connected = useStatusStore((state) => state.connected);
  const gamesIndex = useStatusStore((state) => state.gamesIndex);
  const [isCancelling, setIsCancelling] = useState(false);

  // Reset cancelling state when indexing stops
  useEffect(() => {
    if (!gamesIndex.indexing && isCancelling) {
      setIsCancelling(false);
    }
  }, [gamesIndex.indexing, isCancelling]);

  // Fetch real-time database status
  const { data: mediaStatus, isLoading } = useQuery({
    queryKey: ["media"],
    queryFn: () => CoreAPI.media(),
    enabled: connected,
    staleTime: 30000, // Cache for 30 seconds
    retry: false
  });

  const handleUpdateDatabase = () => {
    CoreAPI.mediaGenerate();
  };

  const handleCancelUpdate = async () => {
    setIsCancelling(true);
    try {
      await CoreAPI.mediaGenerateCancel();
      // Invalidate media query to get fresh database status after cancellation
      queryClient.invalidateQueries({ queryKey: ["media"] });
    } catch (error) {
      console.error("Failed to cancel media generation:", error);
    } finally {
      setIsCancelling(false);
    }
  };

  const renderStatus = () => {
    // Show progress when indexing
    if (gamesIndex.indexing) {
      return (
        <div className="mt-3 space-y-3">
          <div className="space-y-2">
            <div className="text-sm">
              {gamesIndex.currentStepDisplay
                ? gamesIndex.currentStep === gamesIndex.totalSteps
                  ? t("toast.writingDb")
                  : gamesIndex.currentStepDisplay
                : t("toast.preparingDb")}
            </div>
            <div className="border-bd-filled bg-background h-[10px] w-full rounded-full border border-solid">
              <div
                className={classNames(
                  "border-background bg-button-pattern h-[8px] rounded-full border border-solid",
                  {
                    hidden: gamesIndex.currentStep === 0,
                    "animate-pulse":
                      gamesIndex.currentStep === 0 ||
                      gamesIndex.currentStep === gamesIndex.totalSteps
                  }
                )}
                style={{
                  width:
                    gamesIndex.currentStep && gamesIndex.totalSteps
                      ? `${((gamesIndex.currentStep / gamesIndex.totalSteps) * 100).toFixed(2)}%`
                      : "100%"
                }}
              />
            </div>
          </div>
          <Button
            label={isCancelling ? t("loading") : t("settings.updateDb.cancel")}
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

    // Check optimization status first - this takes priority over database existence
    const isOptimizing = mediaStatus?.database?.optimizing ?? false;
    if (isOptimizing) {
      return (
        <div className="mt-3 space-y-2">
          <div className="text-sm">
            {mediaStatus?.database?.currentStepDisplay ||
              t("settings.updateDb.status.optimizing")}
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
              formattedCount
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

  return (
    <Card>
      <div className="space-y-3">
        <Button
          label={t("settings.updateDb")}
          icon={<DatabaseIcon size="20" />}
          className="w-full"
          disabled={!connected || gamesIndex.indexing}
          onClick={handleUpdateDatabase}
        />

        {renderStatus()}
      </div>
    </Card>
  );
}
