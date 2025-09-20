import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useState, useMemo, useRef } from "react";
import { Download, Copy, RefreshCw } from "lucide-react";
import { BackToTop } from "../components/BackToTop";
import { CoreAPI } from "../lib/coreApi.ts";
import { useSmartSwipe } from "../hooks/useSmartSwipe";
import { useStatusStore } from "../lib/store";
import { PageFrame } from "../components/PageFrame";
import { TextInput } from "../components/wui/TextInput";
import { BackIcon } from "../lib/images";

interface LogEntry {
  level: string;
  time: string;
  caller?: string;
  message: string;
  [key: string]: unknown;
}

export const Route = createFileRoute("/settings/logs")({
  component: Logs
});

function Logs() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const connected = useStatusStore((state) => state.connected);
  const [searchTerm, setSearchTerm] = useState("");
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [levelFilters, setLevelFilters] = useState({
    debug: true,
    info: true,
    warn: true,
    error: true
  });

  const swipeHandlers = useSmartSwipe({
    onSwipeRight: () => navigate({ to: "/settings" }),
    preventScrollOnSwipe: false
  });

  const logsQuery = useQuery({
    queryKey: ["logs"],
    queryFn: () => CoreAPI.settingsLogsDownload(),
    enabled: connected,
    refetchOnWindowFocus: false,
    staleTime: 30000, // 30 seconds
  });

  // Parse JSONL content into structured log entries
  const logEntries = useMemo(() => {
    if (!logsQuery.data?.content) return [];

    try {
      const decodedContent = atob(logsQuery.data.content);
      const lines = decodedContent.split('\n').filter(line => line.trim());

      return lines.map((line, index) => {
        try {
          const parsed = JSON.parse(line) as LogEntry;
          return { ...parsed, _index: index };
        } catch {
          // If line isn't valid JSON, treat as plain text
          return {
            level: "info",
            time: new Date().toISOString(),
            message: line,
            _index: index
          } as LogEntry & { _index: number };
        }
      });
    } catch {
      return [];
    }
  }, [logsQuery.data?.content]);

  // Filter and sort log entries
  const filteredEntries = useMemo(() => {
    const filtered = logEntries.filter(entry => {
      // Level filter
      const levelKey = entry.level.toLowerCase() as keyof typeof levelFilters;
      if (!levelFilters[levelKey] && levelFilters[levelKey] !== undefined) {
        return false;
      }

      // Search filter
      if (searchTerm) {
        const searchLower = searchTerm.toLowerCase();
        return (
          entry.message?.toLowerCase().includes(searchLower) ||
          entry.caller?.toLowerCase().includes(searchLower) ||
          entry.level.toLowerCase().includes(searchLower)
        );
      }

      return true;
    });

    // Sort by time (newest first)
    return filtered.sort((a, b) => {
      const timeA = new Date(a.time).getTime();
      const timeB = new Date(b.time).getTime();
      return timeB - timeA;
    });
  }, [logEntries, levelFilters, searchTerm]);

  const downloadFile = () => {
    if (!logsQuery.data) return;

    try {
      const decodedContent = atob(logsQuery.data.content);
      const blob = new Blob([decodedContent], { type: "text/plain" });
      const url = URL.createObjectURL(blob);

      const a = document.createElement("a");
      a.href = url;
      a.download = logsQuery.data.filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Failed to download log file:", error);
    }
  };

  const copyToClipboard = async () => {
    if (!logsQuery.data) return;

    try {
      const decodedContent = atob(logsQuery.data.content);
      await navigator.clipboard.writeText(decodedContent);
    } catch (error) {
      console.error("Failed to copy to clipboard:", error);
    }
  };


  const formatTimestamp = (timeStr: string) => {
    try {
      const date = new Date(timeStr);
      return date.toLocaleString();
    } catch {
      return timeStr;
    }
  };

  const getLevelColor = (level: string) => {
    switch (level.toLowerCase()) {
      case 'error':
        return 'text-red-500 bg-red-50 border-red-200';
      case 'warn':
      case 'warning':
        return 'text-yellow-600 bg-yellow-50 border-yellow-200';
      case 'info':
        return 'text-blue-500 bg-blue-50 border-blue-200';
      case 'debug':
        return 'text-gray-500 bg-gray-50 border-gray-200';
      default:
        return 'text-gray-600 bg-gray-50 border-gray-200';
    }
  };

  const toggleLevelFilter = (level: keyof typeof levelFilters) => {
    setLevelFilters(prev => ({
      ...prev,
      [level]: !prev[level]
    }));
  };

  return (
    <>
      <div {...swipeHandlers} className="h-full w-full overflow-y-auto">
        <PageFrame
        headerLeft={
          <button onClick={() => navigate({ to: "/settings" })} className="cursor-pointer">
            <BackIcon size="24" />
          </button>
        }
        headerCenter={
          <h1 className="text-foreground text-xl">{t("settings.logs.title")}</h1>
        }
        headerRight={
          <div className="flex gap-2">
            {logsQuery.data && (
              <>
                <button
                  onClick={copyToClipboard}
                  className="cursor-pointer"
                  title={t("settings.logs.copy")}
                >
                  <Copy size="20" />
                </button>
                <button
                  onClick={downloadFile}
                  className="cursor-pointer"
                  title={t("settings.logs.download")}
                >
                  <Download size="20" />
                </button>
              </>
            )}
            <button
              onClick={() => logsQuery.refetch()}
              disabled={!connected || logsQuery.isLoading}
              className="cursor-pointer disabled:opacity-50"
              title={logsQuery.isLoading ? t("loading") : t("settings.logs.refresh")}
            >
              <RefreshCw size="20" />
            </button>
          </div>
        }
        scrollRef={scrollContainerRef}
      >
        <div className="flex flex-col gap-3 h-full">
          {/* Control Bar */}
          <div className="flex flex-col gap-3">

            {/* Search */}
            <TextInput
              label=""
              placeholder={t("settings.logs.searchPlaceholder")}
              value={searchTerm}
              setValue={setSearchTerm}
            />

            {/* Filters and Entry Count */}
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2 sm:gap-4">
              <div className="flex flex-row gap-2 flex-wrap">
                {Object.entries(levelFilters).map(([level, enabled]) => (
                  <button
                    key={level}
                    onClick={() => toggleLevelFilter(level as keyof typeof levelFilters)}
                    className={`px-3 py-2 rounded-full text-sm font-medium border transition-colors ${
                      enabled
                        ? getLevelColor(level)
                        : 'text-foreground-muted bg-transparent border-foreground-muted'
                    }`}
                  >
                    {level.charAt(0).toUpperCase() + level.slice(1)}
                  </button>
                ))}
              </div>
              {logsQuery.data && logEntries.length > 0 && (
                <div className="text-sm text-foreground-muted sm:whitespace-nowrap">
                  {searchTerm || Object.values(levelFilters).some(v => !v) ? (
                    <>Showing {filteredEntries.length} of {logEntries.length} entries</>
                  ) : (
                    <>{logEntries.length} entries</>
                  )}
                </div>
              )}
            </div>


            {logsQuery.isError && (
              <p className="text-sm text-error">
                {t("settings.logs.fetchError")}
              </p>
            )}
          </div>

          {/* Log Entries */}
          {logsQuery.data && (
            <div className="flex-1 overflow-y-auto">
              <div>
                {filteredEntries.map((entry, index) => (
                  <div
                    key={entry._index}
                    className="p-3 text-xs font-mono"
                    style={{
                      borderBottom:
                        index === filteredEntries.length - 1
                          ? ""
                          : "1px solid rgba(255,255,255,0.6)"
                    }}
                  >
                    <div className="flex flex-row items-center gap-2 mb-2 font-sans">
                      <span
                        className={`px-2 py-1 rounded-full text-xs font-medium ${getLevelColor(entry.level)}`}
                      >
                        {entry.level.charAt(0).toUpperCase() + entry.level.slice(1)}
                      </span>
                      <span className="text-foreground-muted text-xs">
                        {formatTimestamp(entry.time)}
                      </span>
                    </div>
                    <div className="text-foreground whitespace-pre-wrap break-words font-mono text-sm">
                      {entry.message}
                    </div>
                    {/* Additional fields */}
                    {Object.entries(entry).filter(([key]) =>
                      !['level', 'time', 'caller', 'message', '_index'].includes(key)
                    ).map(([key, value]) => (
                      <div key={key} className="mt-1 text-foreground-muted text-sm font-sans">
                        <span className="font-medium">{key}:</span> {JSON.stringify(value)}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          )}

          {!connected && (
            <div className="text-center text-sm text-foreground-muted py-8">
              {t("settings.logs.notConnected")}
            </div>
          )}

          {connected && logsQuery.data && filteredEntries.length === 0 && (
            <div className="text-center text-sm text-foreground-muted py-8">
              {t("settings.logs.noEntriesFound")}
            </div>
          )}
        </div>
      </PageFrame>
      </div>
      <BackToTop
        scrollContainerRef={scrollContainerRef}
        threshold={200}
        paddingBottom="5em"
      />
    </>
  );
}