import { useTranslation } from "react-i18next";
import classNames from "classnames";
import { useMemo, useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useStatusStore, ConnectionState } from "@/lib/store";
import { CoreAPI } from "@/lib/coreApi";
import { logger } from "@/lib/logger";
import { isCoreFeatureAvailable } from "@/lib/featureGates";
import { Button } from "./wui/Button";
import { SystemSelector, SystemSelectorTrigger } from "./SystemSelector";
import { LoadingSpinner } from "./ui/loading-spinner";
import { ToggleSwitch } from "./wui/ToggleSwitch";

function useStrictMediaScrapersFeature() {
  const coreVersion = useStatusStore((state) => state.coreVersion);
  const coreVersionPending = useStatusStore(
    (state) => state.coreVersionPending,
  );

  return (
    coreVersion !== null &&
    !coreVersionPending &&
    isCoreFeatureAvailable("mediaScrapers", coreVersion)
  );
}

export function MediaScrapeCard() {
  const { t } = useTranslation();
  const featureAvailable = useStrictMediaScrapersFeature();
  const connected = useStatusStore((state) => state.connected);
  const connectionState = useStatusStore((state) => state.connectionState);
  const scrapingStatus = useStatusStore((state) => state.scrapingStatus);
  const setScrapingStatus = useStatusStore((state) => state.setScrapingStatus);
  const gamesIndex = useStatusStore((state) => state.gamesIndex);
  const [selectedScraper, setSelectedScraper] = useState("");
  const [selectedSystems, setSelectedSystems] = useState<string[]>([]);
  const [systemSelectorOpen, setSystemSelectorOpen] = useState(false);
  const [startRequested, setStartRequested] = useState(false);
  const [cancelRequested, setCancelRequested] = useState(false);
  const [resumeRequested, setResumeRequested] = useState(false);
  const [force, setForce] = useState(false);

  const isLiveConnected = connectionState === ConnectionState.CONNECTED;
  const isScraping = scrapingStatus?.scraping === true;
  const isPaused = isScraping && scrapingStatus?.paused === true;
  const isDone = scrapingStatus?.done === true && !isScraping;
  const isStarting = startRequested && !isScraping;
  const isCancelling = cancelRequested && isScraping;
  const isResuming = resumeRequested && isPaused;
  const isIndexing = gamesIndex.indexing || gamesIndex.optimizing === true;

  useEffect(() => {
    if (isScraping && startRequested) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Keep the button busy until Core reports scrape state.
      setStartRequested(false);
    }
  }, [isScraping, startRequested]);

  useEffect(() => {
    if (!isScraping && cancelRequested) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Clear the cancel spinner once Core leaves scrape mode.
      setCancelRequested(false);
    }
  }, [isScraping, cancelRequested]);

  useEffect(() => {
    if ((!isPaused || !isScraping) && resumeRequested) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Clear the resume spinner once Core leaves paused scrape mode.
      setResumeRequested(false);
    }
  }, [isPaused, isScraping, resumeRequested]);

  const { data: scrapersData, isLoading: scrapersLoading } = useQuery({
    queryKey: ["scrapers"],
    queryFn: () => CoreAPI.scrapers(),
    enabled: connected && featureAvailable,
  });

  const { data: scrapeStatusData } = useQuery({
    queryKey: ["mediaScrapeStatus"],
    queryFn: () => CoreAPI.mediaScrapeStatus(),
    enabled: connected && featureAvailable,
    refetchOnMount: "always",
  });

  useEffect(() => {
    if (scrapeStatusData) {
      setScrapingStatus(scrapeStatusData);
    }
  }, [scrapeStatusData, setScrapingStatus]);

  const { data: systemsData } = useQuery({
    queryKey: ["systems"],
    queryFn: () => CoreAPI.systems(),
    enabled: connected && featureAvailable,
  });

  const selectedScraperInfo = useMemo(
    () =>
      scrapersData?.scrapers.find((scraper) => scraper.id === selectedScraper),
    [scrapersData, selectedScraper],
  );
  const activeScraperInfo = useMemo(
    () =>
      scrapersData?.scrapers.find(
        (scraper) => scraper.id === scrapingStatus?.scraperId,
      ),
    [scrapersData, scrapingStatus?.scraperId],
  );

  const allowedSystemIds = useMemo(() => {
    const supportedSystems = selectedScraperInfo?.supportedSystems;
    return supportedSystems && supportedSystems.length > 0
      ? supportedSystems
      : undefined;
  }, [selectedScraperInfo]);
  const eligibleSystemsData = useMemo(() => {
    if (!systemsData || allowedSystemIds === undefined) return systemsData;
    return {
      systems: systemsData.systems.filter((system) =>
        allowedSystemIds.includes(system.id),
      ),
    };
  }, [systemsData, allowedSystemIds]);

  useEffect(() => {
    if (allowedSystemIds === undefined || selectedSystems.length === 0) return;
    const nextSelectedSystems = selectedSystems.filter((systemId) =>
      allowedSystemIds.includes(systemId),
    );
    if (nextSelectedSystems.length !== selectedSystems.length) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Drop systems the selected scraper cannot handle.
      setSelectedSystems(nextSelectedSystems);
    }
  }, [allowedSystemIds, selectedSystems]);

  if (!featureAvailable) {
    return null;
  }

  const handleScrape = async () => {
    const totalSystems = eligibleSystemsData?.systems?.length ?? 0;
    const systemsToScrape =
      selectedSystems.length > 0 && selectedSystems.length < totalSystems
        ? selectedSystems
        : allowedSystemIds;

    setScrapingStatus(null);
    setStartRequested(true);
    try {
      await CoreAPI.mediaScrape({
        scraperId: selectedScraper,
        systems: systemsToScrape,
        force,
      });
    } catch (error) {
      logger.error("Failed to start media scrape:", error, {
        category: "api",
        action: "mediaScrape",
        severity: "error",
      });
      setStartRequested(false);
    }
  };

  const handleCancel = async () => {
    setCancelRequested(true);
    try {
      await CoreAPI.mediaScrapeCancel();
    } catch (error) {
      logger.error("Failed to cancel media scrape:", error, {
        category: "api",
        action: "mediaScrapeCancel",
        severity: "warning",
      });
      setCancelRequested(false);
    }
  };

  const handleResume = async () => {
    setResumeRequested(true);
    try {
      await CoreAPI.mediaScrapeResume();
    } catch (error) {
      logger.error("Failed to resume media scrape:", error, {
        category: "api",
        action: "mediaScrapeResume",
        severity: "warning",
      });
      setResumeRequested(false);
    }
  };

  const getStatusText = (): string => {
    if (isDone) {
      return t("settings.scrapeMedia.done", {
        matched: scrapingStatus?.matched ?? 0,
        skipped: scrapingStatus?.skipped ?? 0,
      });
    }
    if (isScraping) {
      const step =
        scrapingStatus?.currentSystem?.systemName ??
        scrapingStatus?.currentStepDisplay ??
        scrapingStatus?.systemId ??
        t("settings.scrapeMedia.preparing");
      if (isPaused) {
        return `${step}, ${t("settings.scrapeMedia.status.paused")}`;
      }
      if (!isLiveConnected) {
        return `${step}, ${t("settings.scrapeMedia.status.reconnecting")}`;
      }
      return step;
    }
    return "";
  };

  const renderStatus = () => {
    if (isDone) {
      const formattedMatched = (scrapingStatus?.matched ?? 0).toLocaleString();
      const formattedSkipped = (scrapingStatus?.skipped ?? 0).toLocaleString();
      const formattedScraped = (
        scrapingStatus?.totalScraped ?? 0
      ).toLocaleString();
      return (
        <section className="space-y-2" aria-labelledby="last-scrape-title">
          <h2 id="last-scrape-title" className="text-sm font-medium">
            {t("settings.scrapeMedia.lastScrapeTitle")}
          </h2>
          <p className="text-muted-foreground text-sm">
            {t("settings.scrapeMedia.done", {
              matched: scrapingStatus?.matched ?? 0,
              skipped: scrapingStatus?.skipped ?? 0,
            })}
          </p>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">
              {t("settings.scrapeMedia.matchedLabel")}
            </span>
            <span>{formattedMatched}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">
              {t("settings.scrapeMedia.skippedLabel")}
            </span>
            <span>{formattedSkipped}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">
              {t("settings.scrapeMedia.scrapedLabel")}
            </span>
            <span>{formattedScraped}</span>
          </div>
        </section>
      );
    }

    if (isScraping && scrapingStatus) {
      const currentSystemProgress = scrapingStatus.currentSystem ?? {
        systemId: scrapingStatus.systemId ?? "",
        systemName: undefined,
        processed: scrapingStatus.processed,
        total: scrapingStatus.total,
        matched: scrapingStatus.matched,
        skipped: scrapingStatus.skipped,
      };
      const hasSystemProgress = currentSystemProgress.total > 0;
      const systemProgressPct = hasSystemProgress
        ? (currentSystemProgress.processed / currentSystemProgress.total) * 100
        : 0;
      const roundedSystemProgressPct = Math.round(systemProgressPct);
      const totalSteps = scrapingStatus.totalSteps ?? 0;
      const currentStep = scrapingStatus.currentStep ?? 0;
      const hasOverallProgress = totalSteps > 0;
      const overallProgressPct = hasOverallProgress
        ? (currentStep / totalSteps) * 100
        : 0;
      const roundedOverallProgressPct = Math.round(overallProgressPct);
      const currentSystem =
        currentSystemProgress.systemName ??
        scrapingStatus.currentStepDisplay ??
        currentSystemProgress.systemId ??
        t("settings.scrapeMedia.preparing");
      const formattedProcessed =
        currentSystemProgress.processed.toLocaleString();
      const formattedTotal = currentSystemProgress.total.toLocaleString();
      const formattedMatched = currentSystemProgress.matched.toLocaleString();
      const formattedSkipped = currentSystemProgress.skipped.toLocaleString();
      const formattedScraped = scrapingStatus.totalScraped.toLocaleString();
      const scraperName =
        activeScraperInfo?.name ??
        scrapingStatus.scraperId ??
        t("settings.scrapeMedia.details.unknown");

      return (
        <div className="flex flex-col gap-7">
          <section className="space-y-5" aria-labelledby="scrape-status-title">
            <div className="space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <h2 id="scrape-status-title" className="text-xl">
                    {t("settings.scrapeMedia.activeTitle")}
                  </h2>
                  <p className="text-muted-foreground text-sm">
                    {t("settings.scrapeMedia.activeDescription")}
                  </p>
                </div>
                {isLiveConnected && !isPaused ? (
                  <LoadingSpinner size={24} className="text-muted-foreground" />
                ) : null}
              </div>

              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">
                  {t("settings.scrapeMedia.currentSystem")}
                </span>
                <span>{currentSystem}</span>
              </div>
              {(isPaused || !isLiveConnected) && (
                <div className="text-muted-foreground text-sm">
                  {isPaused
                    ? t("settings.scrapeMedia.status.paused")
                    : t("settings.scrapeMedia.status.reconnecting")}
                </div>
              )}
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <div
                  role="progressbar"
                  aria-valuenow={roundedOverallProgressPct}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label={t("settings.scrapeMedia.overallProgressLabel")}
                  className="border-bd-filled bg-background h-[10px] w-full rounded-full border border-solid"
                >
                  <div
                    className={classNames(
                      "border-background bg-button-pattern h-[8px] rounded-full border border-solid",
                      {
                        hidden: hasOverallProgress && currentStep === 0,
                        "animate-pulse":
                          isLiveConnected && !isPaused && !hasOverallProgress,
                      },
                    )}
                    style={{
                      width: hasOverallProgress
                        ? `${overallProgressPct.toFixed(2)}%`
                        : "100%",
                    }}
                  />
                </div>
                <div className="text-muted-foreground flex items-center justify-between text-sm">
                  <span>
                    {hasOverallProgress
                      ? t("settings.scrapeMedia.systemProgressCount", {
                          current: currentStep.toLocaleString(),
                          total: totalSteps.toLocaleString(),
                        })
                      : t("settings.scrapeMedia.preparing")}
                  </span>
                  <span>
                    {hasOverallProgress ? `${roundedOverallProgressPct}%` : ""}
                  </span>
                </div>
              </div>

              <div className="space-y-3">
                <div
                  role="progressbar"
                  aria-valuenow={roundedSystemProgressPct}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label={t("settings.scrapeMedia.progressLabel")}
                  className="border-bd-filled bg-background h-[10px] w-full rounded-full border border-solid"
                >
                  <div
                    className={classNames(
                      "border-background bg-button-pattern h-[8px] rounded-full border border-solid",
                      {
                        hidden:
                          hasSystemProgress &&
                          currentSystemProgress.processed === 0,
                        "animate-pulse":
                          isLiveConnected &&
                          !isPaused &&
                          (!hasSystemProgress ||
                            currentSystemProgress.processed === 0),
                      },
                    )}
                    style={{
                      width: hasSystemProgress
                        ? `${systemProgressPct.toFixed(2)}%`
                        : "100%",
                    }}
                  />
                </div>
                <div className="text-muted-foreground flex items-center justify-between text-sm">
                  <span>
                    {hasSystemProgress
                      ? t("settings.scrapeMedia.processedCount", {
                          processed: formattedProcessed,
                          total: formattedTotal,
                        })
                      : t("settings.scrapeMedia.preparing")}
                  </span>
                  <span>
                    {hasSystemProgress ? `${roundedSystemProgressPct}%` : ""}
                  </span>
                </div>
              </div>
            </div>
          </section>

          <section
            className="space-y-2"
            aria-label={t("settings.scrapeMedia.statsLabel")}
          >
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">
                {t("settings.scrapeMedia.matchedLabel")}
              </span>
              <span>{formattedMatched}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">
                {t("settings.scrapeMedia.skippedLabel")}
              </span>
              <span>{formattedSkipped}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">
                {t("settings.scrapeMedia.scrapedLabel")}
              </span>
              <span>{formattedScraped}</span>
            </div>
          </section>

          <section className="space-y-2" aria-labelledby="scrape-details-title">
            <h3 id="scrape-details-title" className="text-sm font-medium">
              {t("settings.scrapeMedia.detailsTitle")}
            </h3>
            <div className="flex justify-between gap-4 text-sm">
              <span className="text-muted-foreground">
                {t("settings.scrapeMedia.scraperLabel")}
              </span>
              <span className="text-right">{scraperName}</span>
            </div>
            <div className="flex justify-between gap-4 text-sm">
              <span className="text-muted-foreground">
                {t("settings.scrapeMedia.forceLabel")}
              </span>
              <span>{force ? t("yes") : t("no")}</span>
            </div>
          </section>

          <Button
            label={
              isPaused
                ? isResuming
                  ? t("resuming")
                  : t("settings.scrapeMedia.resume")
                : isCancelling
                  ? t("cancelling")
                  : t("settings.scrapeMedia.cancel")
            }
            variant="outline"
            className="w-full"
            disabled={!connected || (isPaused ? isResuming : isCancelling)}
            onClick={isPaused ? handleResume : handleCancel}
          />
        </div>
      );
    }

    if (!connected) {
      return (
        <div className="text-muted-foreground text-sm">
          {t("settings.scrapeMedia.status.noConnection")}
        </div>
      );
    }

    return null;
  };

  const controlsDisabled = !connected || isScraping || isIndexing || isStarting;

  return (
    <>
      <div aria-live="polite" aria-atomic="true" className="sr-only">
        {getStatusText()}
      </div>

      <div className="flex flex-col gap-4">
        {isScraping ? (
          renderStatus()
        ) : (
          <>
            <div className="flex flex-col gap-2">
              <label htmlFor="scraper-select" className="text-white">
                {t("settings.scrapeMedia.scraperPlaceholder")}
              </label>
              <select
                id="scraper-select"
                value={selectedScraper}
                onChange={(e) => {
                  setSelectedScraper(e.target.value);
                  setSelectedSystems([]);
                }}
                disabled={controlsDisabled || scrapersLoading}
                className={classNames(
                  "border-bd-input bg-background text-foreground rounded-md border border-solid p-3",
                  {
                    "cursor-not-allowed opacity-50":
                      controlsDisabled || scrapersLoading,
                  },
                )}
              >
                <option value="">
                  {t("settings.scrapeMedia.scraperPlaceholder")}
                </option>
                {scrapersData?.scrapers.map((scraper) => (
                  <option key={scraper.id} value={scraper.id}>
                    {scraper.name}
                  </option>
                ))}
              </select>
            </div>

            <SystemSelectorTrigger
              selectedSystems={selectedSystems}
              systemsData={eligibleSystemsData}
              placeholder={t("settings.scrapeMedia.allSystems")}
              mode="multi"
              onClick={() => setSystemSelectorOpen(true)}
              disabled={controlsDisabled || !selectedScraper}
            />

            <ToggleSwitch
              value={force}
              setValue={setForce}
              disabled={controlsDisabled}
              label={t("settings.scrapeMedia.force")}
            />

            {isIndexing ? (
              <div className="text-muted-foreground text-sm">
                {t("settings.scrapeMedia.blockedByIndex")}
              </div>
            ) : null}

            <Button
              label={
                isStarting
                  ? t("settings.scrapeMedia.starting")
                  : t("settings.scrapeMedia")
              }
              icon={
                isStarting ? (
                  <LoadingSpinner
                    size={16}
                    className="text-foreground-disabled"
                  />
                ) : undefined
              }
              className="w-full"
              disabled={
                !connected || !selectedScraper || isIndexing || isStarting
              }
              onClick={handleScrape}
            />

            {renderStatus()}
          </>
        )}
      </div>

      <SystemSelector
        isOpen={systemSelectorOpen}
        onClose={() => setSystemSelectorOpen(false)}
        onSelect={setSelectedSystems}
        selectedSystems={selectedSystems}
        mode="multi"
        title={t("settings.scrapeMedia.selectSystemsTitle")}
        includeAllOption={true}
        allowedSystemIds={allowedSystemIds}
      />
    </>
  );
}
