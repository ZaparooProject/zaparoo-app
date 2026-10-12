import { useTranslation } from "react-i18next";
import { useMemo, useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { useActiveDeviceKey } from "@/hooks/useActiveDeviceKey";
import { useStatusStore, ConnectionState } from "@/lib/store";
import { CoreAPI, isMediaOperationConflictError } from "@/lib/coreApi";
import { logger } from "@/lib/logger";
import { useTabSessionStore } from "@/lib/tabSessionStore";
import { showRateLimitedErrorToast } from "@/lib/toastUtils";
import { useKnownCoreFeature } from "@/hooks/useKnownCoreFeature";
import { useSystemNameResolver } from "@/hooks/useSystemName";
import { Select } from "@/components/wui/Select";
import { Button } from "./wui/Button";
import { SystemSelector, SystemSelectorTrigger } from "./SystemSelector";
import { LoadingSpinner } from "./ui/loading-spinner";
import { ToggleSwitch } from "./wui/ToggleSwitch";
import { ProgressBar } from "./ProgressBar";
import { StatRow } from "./StatRow";

export function MediaScrapeCard() {
  const { t } = useTranslation();
  const resolveSystemName = useSystemNameResolver();
  const { available: featureAvailable } = useKnownCoreFeature("mediaScrapers");
  const connected = useStatusStore((state) => state.connected);
  const deviceKey = useActiveDeviceKey();
  const connectionState = useStatusStore((state) => state.connectionState);
  const scrapingStatus = useStatusStore((state) => state.scrapingStatus);
  const setScrapingStatus = useStatusStore((state) => state.setScrapingStatus);
  const gamesIndex = useStatusStore((state) => state.gamesIndex);
  const selectedScraper = useTabSessionStore(
    (state) => state.mediaScraperByDevice[deviceKey] ?? "",
  );
  const setMediaScraper = useTabSessionStore((state) => state.setMediaScraper);
  const [selectedSystems, setSelectedSystems] = useState<string[]>([]);
  const [systemSelectorOpen, setSystemSelectorOpen] = useState(false);
  const [startRequested, setStartRequested] = useState(false);
  const [cancelRequested, setCancelRequested] = useState(false);
  const [resumeRequested, setResumeRequested] = useState(false);
  const [force, setForce] = useState(false);
  const [trackedDeviceKey, setTrackedDeviceKey] = useState(deviceKey);

  // Scraper choice is session-scoped by device, but system selection belongs
  // only to the currently rendered device.
  if (deviceKey !== trackedDeviceKey) {
    setTrackedDeviceKey(deviceKey);
    setSelectedSystems([]);
  }

  // The live status is shared store state, so the previous device's run is
  // cleared after the switch commits rather than while rendering.
  const statusDeviceKeyRef = useRef(deviceKey);
  useEffect(() => {
    if (statusDeviceKeyRef.current === deviceKey) return;
    statusDeviceKeyRef.current = deviceKey;
    setScrapingStatus(null);
  }, [deviceKey, setScrapingStatus]);

  const isLiveConnected = connectionState === ConnectionState.CONNECTED;
  const isScraping = scrapingStatus?.scraping === true;
  const isPaused = isScraping && scrapingStatus?.paused === true;
  const isThrottled =
    isScraping && scrapingStatus?.throttled === true && !isPaused;
  const isFailed = !isScraping && scrapingStatus?.state === "failed";
  const isCancelled = !isScraping && scrapingStatus?.state === "cancelled";
  const isCompleted =
    !isScraping &&
    (scrapingStatus?.state === "completed" ||
      (scrapingStatus?.state === undefined && scrapingStatus?.done === true));
  const isStarting = startRequested && !isScraping;
  const isCancelling = cancelRequested && isScraping;
  const isResuming = resumeRequested && isPaused;
  const isDatabaseBusy = gamesIndex.indexing || gamesIndex.optimizing === true;

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
    queryKey: ["scrapers", deviceKey],
    queryFn: () => CoreAPI.scrapers(),
    enabled: connected && featureAvailable,
  });

  useEffect(() => {
    if (!deviceKey || !scrapersData) return;
    const rememberedAvailable = scrapersData.scrapers.some(
      (scraper) => scraper.id === selectedScraper,
    );
    if (rememberedAvailable) return;

    const defaultScraper =
      scrapersData.scrapers.find((scraper) => scraper.id === "gamelist.xml")
        ?.id ?? "";
    if (selectedScraper !== defaultScraper) {
      setMediaScraper(deviceKey, defaultScraper);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Scraper eligibility changed, so its system selection cannot carry over.
      setSelectedSystems([]);
    }
  }, [deviceKey, scrapersData, selectedScraper, setMediaScraper]);

  const { data: scrapeStatusData, isFetchedAfterMount: scrapeStatusFresh } =
    useQuery({
      queryKey: ["mediaScrapeStatus", deviceKey],
      queryFn: () => CoreAPI.mediaScrapeStatus(),
      enabled: connected && featureAvailable,
      refetchOnMount: "always",
    });

  // A cached answer from an earlier visit can describe a run that has since
  // ended; writing it to the live store would resurrect that run and block
  // the database controls until the refetch lands. Only a fresh answer counts.
  useEffect(() => {
    if (scrapeStatusData && scrapeStatusFresh) {
      setScrapingStatus(scrapeStatusData);
    }
  }, [scrapeStatusData, scrapeStatusFresh, setScrapingStatus]);

  const { data: systemsData } = useQuery({
    queryKey: ["systems", deviceKey, { all: false }],
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

  const reportActionError = (error: unknown, fallback: string) => {
    showRateLimitedErrorToast(
      t("error", { msg: error instanceof Error ? error.message : fallback }),
    );
  };

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
      if (!isMediaOperationConflictError(error)) {
        logger.error("Failed to start media scrape:", error, {
          category: "api",
          action: "mediaScrape",
          severity: "error",
        });
      }
      reportActionError(error, t("settings.scrapeMedia.startError"));
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
      reportActionError(error, t("settings.scrapeMedia.cancelError"));
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
      reportActionError(error, t("settings.scrapeMedia.resumeError"));
      setResumeRequested(false);
    }
  };

  const getStatusText = (): string => {
    if (isFailed) {
      const failed = t("settings.scrapeMedia.failed");
      return scrapingStatus?.error
        ? `${failed}: ${scrapingStatus.error}`
        : failed;
    }
    if (isCancelled) {
      return t("settings.scrapeMedia.cancelled");
    }
    if (isCompleted) {
      return t("settings.scrapeMedia.done", {
        matched: scrapingStatus?.matched ?? 0,
        skipped: scrapingStatus?.skipped ?? 0,
      });
    }
    if (isScraping) {
      const systemId =
        scrapingStatus?.currentSystem?.systemId ??
        scrapingStatus?.systemId ??
        "";
      const coreSystemName =
        scrapingStatus?.currentSystem?.systemName ??
        scrapingStatus?.currentStepDisplay ??
        systemId;
      const step = systemId
        ? resolveSystemName(systemId, coreSystemName)
        : coreSystemName || t("settings.scrapeMedia.preparing");
      if (isPaused) {
        return `${step}, ${t("settings.scrapeMedia.status.paused")}`;
      }
      if (!isLiveConnected) {
        return `${step}, ${t("settings.scrapeMedia.status.reconnecting")}`;
      }
      if (isThrottled) {
        return `${step}, ${t("settings.scrapeMedia.status.throttled")}`;
      }
      return step;
    }
    return "";
  };

  const renderStatus = () => {
    if (isFailed || isCancelled) {
      const title = isFailed
        ? t("settings.scrapeMedia.failed")
        : t("settings.scrapeMedia.cancelled");
      return (
        <section
          className="flex flex-col gap-2"
          aria-labelledby="last-scrape-title"
        >
          <h3 id="last-scrape-title" className="text-sm font-medium">
            {title}
          </h3>
          {isFailed && scrapingStatus?.error ? (
            <p className="text-error text-sm">{scrapingStatus.error}</p>
          ) : null}
        </section>
      );
    }

    if (isCompleted) {
      const formattedMatched = (scrapingStatus?.matched ?? 0).toLocaleString();
      const formattedSkipped = (scrapingStatus?.skipped ?? 0).toLocaleString();
      const formattedScraped = (
        scrapingStatus?.totalScraped ?? 0
      ).toLocaleString();
      return (
        <section
          className="flex flex-col gap-2"
          aria-labelledby="last-scrape-title"
        >
          <h3 id="last-scrape-title" className="text-sm font-medium">
            {t("settings.scrapeMedia.lastScrapeTitle")}
          </h3>
          <p className="text-muted-foreground text-sm">
            {t("settings.scrapeMedia.done", {
              matched: scrapingStatus?.matched ?? 0,
              skipped: scrapingStatus?.skipped ?? 0,
            })}
          </p>
          <StatRow label={t("settings.scrapeMedia.matchedLabel")}>
            {formattedMatched}
          </StatRow>
          <StatRow label={t("settings.scrapeMedia.skippedLabel")}>
            {formattedSkipped}
          </StatRow>
          <StatRow label={t("settings.scrapeMedia.scrapedLabel")}>
            {formattedScraped}
          </StatRow>
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
      const coreSystemName =
        currentSystemProgress.systemName ??
        scrapingStatus.currentStepDisplay ??
        currentSystemProgress.systemId;
      const currentSystem = currentSystemProgress.systemId
        ? resolveSystemName(currentSystemProgress.systemId, coreSystemName)
        : coreSystemName || t("settings.scrapeMedia.preparing");
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

      const systemStarted =
        hasSystemProgress && currentSystemProgress.processed > 0;
      const working = isLiveConnected && !isPaused;

      return (
        <div className="flex flex-col gap-4">
          <section
            className="flex flex-col gap-3"
            aria-labelledby="scrape-status-title"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex flex-col gap-1">
                <h3 id="scrape-status-title" className="text-sm font-medium">
                  {t("settings.scrapeMedia.activeTitle")}
                </h3>
                <p className="text-muted-foreground text-sm">
                  {t("settings.scrapeMedia.activeDescription")}
                </p>
              </div>
              {working ? (
                <LoadingSpinner
                  size={16}
                  className="text-muted-foreground"
                  decorative
                />
              ) : null}
            </div>

            <StatRow label={t("settings.scrapeMedia.currentSystem")}>
              {currentSystem}
            </StatRow>
            {(isPaused || !isLiveConnected || isThrottled) && (
              <div className="text-muted-foreground text-sm">
                {isPaused
                  ? t("settings.scrapeMedia.status.paused")
                  : !isLiveConnected
                    ? t("settings.scrapeMedia.status.reconnecting")
                    : t("settings.scrapeMedia.status.throttled")}
              </div>
            )}

            <div className="flex flex-col gap-2">
              <ProgressBar
                label={t("settings.scrapeMedia.overallProgressLabel")}
                valueNow={roundedOverallProgressPct}
                percent={hasOverallProgress ? overallProgressPct : undefined}
                empty={hasOverallProgress && currentStep === 0}
                pulse={working}
              />
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

            <div className="flex flex-col gap-2">
              <ProgressBar
                label={t("settings.scrapeMedia.progressLabel")}
                valueNow={roundedSystemProgressPct}
                percent={systemStarted ? systemProgressPct : undefined}
                empty={hasSystemProgress && !systemStarted}
                pulse={working}
              />
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
          </section>

          <section
            className="flex flex-col gap-2"
            aria-label={t("settings.scrapeMedia.statsLabel")}
          >
            <StatRow label={t("settings.scrapeMedia.matchedLabel")}>
              {formattedMatched}
            </StatRow>
            <StatRow label={t("settings.scrapeMedia.skippedLabel")}>
              {formattedSkipped}
            </StatRow>
            <StatRow label={t("settings.scrapeMedia.scrapedLabel")}>
              {formattedScraped}
            </StatRow>
          </section>

          <section
            className="flex flex-col gap-2"
            aria-labelledby="scrape-details-title"
          >
            <h3 id="scrape-details-title" className="text-sm font-medium">
              {t("settings.scrapeMedia.detailsTitle")}
            </h3>
            <StatRow label={t("settings.scrapeMedia.scraperLabel")}>
              {scraperName}
            </StatRow>
            <StatRow label={t("settings.scrapeMedia.forceLabel")}>
              {(scrapingStatus.force ?? force) ? t("yes") : t("no")}
            </StatRow>
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
            disabledAppearance={
              isResuming || isCancelling ? "busy" : "unavailable"
            }
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

  const controlsDisabled =
    !connected || isScraping || isDatabaseBusy || isStarting;

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
            <Select
              id="scraper-select"
              label={t("settings.scrapeMedia.scraperPlaceholder")}
              value={selectedScraper}
              onChange={(e) => {
                if (deviceKey) {
                  setMediaScraper(deviceKey, e.target.value);
                }
                setSelectedSystems([]);
              }}
              disabled={controlsDisabled || scrapersLoading}
            >
              <option value="">
                {t("settings.scrapeMedia.scraperPlaceholder")}
              </option>
              {scrapersData?.scrapers.map((scraper) => (
                <option key={scraper.id} value={scraper.id}>
                  {scraper.name}
                </option>
              ))}
            </Select>

            <SystemSelectorTrigger
              aria-label={t("settings.scrapeMedia.allSystems")}
              selectedSystems={selectedSystems}
              systemsData={eligibleSystemsData}
              placeholder={t("settings.scrapeMedia.allSystems")}
              mode="multi"
              onClick={() => setSystemSelectorOpen(true)}
              disabled={controlsDisabled || !selectedScraper}
              includeEmptySystems
            />

            <ToggleSwitch
              reflow
              value={force}
              setValue={setForce}
              disabled={controlsDisabled}
              label={t("settings.scrapeMedia.force")}
            />

            {isDatabaseBusy ? (
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
                isStarting ? <LoadingSpinner size={20} decorative /> : undefined
              }
              className="w-full"
              disabled={
                !connected || !selectedScraper || isDatabaseBusy || isStarting
              }
              disabledAppearance={isStarting ? "busy" : "unavailable"}
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
        includeEmptySystems={true}
      />
    </>
  );
}
