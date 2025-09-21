import { useTranslation } from "react-i18next";
import classNames from "classnames";
import { useQuery } from "@tanstack/react-query";
import { useStatusStore } from "@/lib/store";
import { CoreAPI } from "@/lib/coreApi";
import { DatabaseIcon } from "@/lib/images";
import { Card } from "./wui/Card";
import { Button } from "./wui/Button";

export function MediaDatabaseCard() {
  const { t } = useTranslation();
  const connected = useStatusStore((state) => state.connected);
  const gamesIndex = useStatusStore((state) => state.gamesIndex);

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

  const renderStatus = () => {
    // Show progress when indexing
    if (gamesIndex.indexing) {
      return (
        <div className="mt-3 space-y-2">
          <div className="text-sm">
            {gamesIndex.currentStepDisplay
              ? gamesIndex.currentStep === gamesIndex.totalSteps
                ? t("toast.writingDb")
                : gamesIndex.currentStepDisplay
              : t("toast.preparingDb")}
          </div>
          <div className="h-[10px] w-full rounded-full border border-solid border-bd-filled bg-background">
            <div
              className={classNames(
                "h-[8px] rounded-full border border-solid border-background bg-button-pattern",
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
      );
    }

    // Show connection status
    if (!connected) {
      return (
        <div className="mt-3 text-sm text-muted-foreground">
          {t("settings.updateDb.status.noConnection")}
        </div>
      );
    }

    // Show loading state while fetching database status
    if (isLoading) {
      return (
        <div className="mt-3 text-sm text-muted-foreground">
          {t("settings.updateDb.status.checking")}
        </div>
      );
    }

    // Use real database status from API
    const databaseExists = mediaStatus?.database?.exists ?? false;

    if (!databaseExists) {
      return (
        <div className="mt-3 text-sm text-error">
          {t("create.search.gamesDbUpdate")}
        </div>
      );
    }

    // Database exists and is ready - never show file count here
    return (
      <div className="mt-3 text-sm text-muted-foreground">
        {t("settings.updateDb.status.ready")}
      </div>
    );
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