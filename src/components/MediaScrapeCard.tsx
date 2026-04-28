import { useTranslation } from "react-i18next";
import classNames from "classnames";
import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useStatusStore } from "@/lib/store";
import { CoreAPI } from "@/lib/coreApi";
import { logger } from "@/lib/logger";
import { Card } from "./wui/Card";
import { Button } from "./wui/Button";
import { SystemSelector, SystemSelectorTrigger } from "./SystemSelector";
import { LoadingSpinner } from "./ui/loading-spinner";

export function MediaScrapeCard() {
  const { t } = useTranslation();
  const connected = useStatusStore((state) => state.connected);
  const scrapingStatus = useStatusStore((state) => state.scrapingStatus);
  const setScrapingStatus = useStatusStore((state) => state.setScrapingStatus);
  const [selectedScraper, setSelectedScraper] = useState("");
  const [selectedSystems, setSelectedSystems] = useState<string[]>([]);
  const [systemSelectorOpen, setSystemSelectorOpen] = useState(false);
  const [cancelRequested, setCancelRequested] = useState(false);

  const isScraping = scrapingStatus?.scraping === true;
  const isDone = scrapingStatus?.done === true && !isScraping;
  const isCancelling = cancelRequested && isScraping;

  useEffect(() => {
    if (!isScraping && cancelRequested) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Intentional: syncing local UI state with external store
      setCancelRequested(false);
    }
  }, [isScraping, cancelRequested]);

  const { data: scrapersData, isLoading: scrapersLoading } = useQuery({
    queryKey: ["scrapers"],
    queryFn: () => CoreAPI.scrapers(),
    enabled: connected,
  });

  const { data: systemsData } = useQuery({
    queryKey: ["systems"],
    queryFn: () => CoreAPI.systems(),
    enabled: connected,
  });

  const handleScrape = () => {
    const totalSystems = systemsData?.systems?.length ?? 0;
    const systemsToScrape =
      selectedSystems.length > 0 && selectedSystems.length < totalSystems
        ? selectedSystems
        : undefined;

    CoreAPI.mediaScrape({
      scraperId: selectedScraper,
      systems: systemsToScrape,
    }).catch((error) => {
      logger.error("Failed to start media scrape:", error, {
        category: "api",
        action: "mediaScrape",
        severity: "error",
      });
    });
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

  const getStatusText = (): string => {
    if (isDone) {
      return t("settings.scrapeMedia.done", {
        matched: scrapingStatus?.matched ?? 0,
        skipped: scrapingStatus?.skipped ?? 0,
      });
    }
    if (isScraping) {
      return scrapingStatus?.systemId ?? t("settings.scrapeMedia.preparing");
    }
    return "";
  };

  const renderStatus = () => {
    if (isDone) {
      return (
        <div className="mt-3 space-y-3">
          <div className="text-muted-foreground text-sm">
            {t("settings.scrapeMedia.done", {
              matched: scrapingStatus?.matched ?? 0,
              skipped: scrapingStatus?.skipped ?? 0,
            })}
          </div>
          <Button
            label={t("settings.scrapeMedia.dismiss")}
            variant="outline"
            className="w-full"
            onClick={() => setScrapingStatus(null)}
          />
        </div>
      );
    }

    if (isScraping) {
      const hasProgress =
        scrapingStatus.total != null && scrapingStatus.total > 0;
      const progressPct = hasProgress
        ? (scrapingStatus.processed / scrapingStatus.total) * 100
        : 0;

      return (
        <div className="mt-3 space-y-3">
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span>
                {scrapingStatus.systemId
                  ? scrapingStatus.systemId
                  : t("settings.scrapeMedia.preparing")}
              </span>
              {scrapingStatus.systemId && hasProgress && (
                <LoadingSpinner size={16} className="text-muted-foreground" />
              )}
            </div>
            <div
              role="progressbar"
              aria-valuenow={hasProgress ? Math.round(progressPct) : 0}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={t("settings.scrapeMedia.progressLabel")}
              className="border-bd-filled bg-background h-[10px] w-full rounded-full border border-solid"
            >
              <div
                className={classNames(
                  "border-background bg-button-pattern h-[8px] rounded-full border border-solid",
                  {
                    hidden: hasProgress && scrapingStatus.processed === 0,
                    "animate-pulse": !hasProgress || scrapingStatus.processed === 0,
                  },
                )}
                style={{
                  width: hasProgress
                    ? `${progressPct.toFixed(2)}%`
                    : "100%",
                }}
              />
            </div>
            <div className="text-muted-foreground text-xs">
              {t("settings.scrapeMedia.stats", {
                matched: scrapingStatus.matched,
                skipped: scrapingStatus.skipped,
              })}
            </div>
          </div>
          <Button
            label={isCancelling ? t("cancelling") : t("settings.scrapeMedia.cancel")}
            variant="outline"
            className="w-full"
            disabled={!connected || isCancelling}
            onClick={handleCancel}
          />
        </div>
      );
    }

    if (!connected) {
      return (
        <div className="text-muted-foreground mt-3 text-sm">
          {t("settings.scrapeMedia.status.noConnection")}
        </div>
      );
    }

    return null;
  };

  return (
    <>
      <div aria-live="polite" aria-atomic="true" className="sr-only">
        {getStatusText()}
      </div>

      <Card>
        <div className="space-y-3">
          <select
            value={selectedScraper}
            onChange={(e) => setSelectedScraper(e.target.value)}
            disabled={!connected || scrapersLoading || isScraping}
            className={classNames(
              "border-input text-foreground w-full rounded-md border px-3 py-2 transition-colors focus:ring-2 focus:ring-white/20 focus:outline-none",
              {
                "hover:bg-white/10": connected && !scrapersLoading && !isScraping,
                "cursor-not-allowed opacity-50": !connected || scrapersLoading || isScraping,
              },
            )}
            style={{ backgroundColor: "var(--color-background)" }}
          >
            <option value="">{t("settings.scrapeMedia.scraperPlaceholder")}</option>
            {scrapersData?.scrapers.map((scraper) => (
              <option key={scraper.id} value={scraper.id}>
                {scraper.name}
              </option>
            ))}
          </select>

          <SystemSelectorTrigger
            selectedSystems={selectedSystems}
            systemsData={systemsData}
            placeholder={t("settings.scrapeMedia.allSystems")}
            mode="multi"
            onClick={() => setSystemSelectorOpen(true)}
            disabled={!connected || isScraping}
          />

          <Button
            label={t("settings.scrapeMedia")}
            className="w-full"
            disabled={!connected || !selectedScraper || isScraping}
            onClick={handleScrape}
          />

          {renderStatus()}
        </div>
      </Card>

      <SystemSelector
        isOpen={systemSelectorOpen}
        onClose={() => setSystemSelectorOpen(false)}
        onSelect={setSelectedSystems}
        selectedSystems={selectedSystems}
        mode="multi"
        title={t("settings.scrapeMedia.selectSystemsTitle")}
        includeAllOption={true}
      />
    </>
  );
}
