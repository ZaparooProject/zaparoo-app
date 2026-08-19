import { useRouter } from "@tanstack/react-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useState, useMemo, useRef } from "react";
import { Download, Copy, RefreshCw, Upload, Loader2 } from "lucide-react";
import { Capacitor } from "@capacitor/core";
import { Clipboard } from "@capacitor/clipboard";
import toast from "react-hot-toast";
import { BackToTop } from "@/components/BackToTop";
import { CoreAPI } from "@/lib/coreApi";
import { useHaptics } from "@/hooks/useHaptics";
import { useStatusStore } from "@/lib/store";
import { usePreferencesStore } from "@/lib/preferencesStore";
import { PageFrame } from "@/components/PageFrame";
import { TextInput } from "@/components/wui/TextInput";
import { Button } from "@/components/wui/Button";
import { BackIcon } from "@/lib/images";
import { HeaderButton } from "@/components/wui/HeaderButton";
import { ToggleChip } from "@/components/wui/ToggleChip";
import { Badge, type BadgeVariant } from "@/components/wui/Badge";
import { EmptyState } from "@/components/wui/EmptyState";
import { logger } from "@/lib/logger";
import { uploadLogs } from "@/lib/logsApi";
import { showRateLimitedErrorToast } from "@/lib/toastUtils";
import { usePageHeadingFocus } from "@/hooks/usePageHeadingFocus";
import { appBackNavigationOptions } from "@/lib/tabSessionStore";

interface LogEntry {
  level: string;
  time: string;
  caller?: string;
  message: string;
  [key: string]: unknown;
}

export function Logs() {
  const { t } = useTranslation();
  const headingRef = usePageHeadingFocus<HTMLHeadingElement>(
    t("settings.logs.title"),
  );
  const router = useRouter();
  const goBack = () =>
    void router.navigate(appBackNavigationOptions("/settings"));
  const connected = useStatusStore((state) => state.connected);
  const { impact } = useHaptics();
  const [searchTerm, setSearchTerm] = useState("");
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const levelFilters = usePreferencesStore((s) => s.logLevelFilters);
  const setLogLevelFilters = usePreferencesStore((s) => s.setLogLevelFilters);
  const [expandedEntries, setExpandedEntries] = useState<Set<number>>(
    new Set(),
  );
  const [expandedFields, setExpandedFields] = useState<Set<string>>(new Set());

  const logsQuery = useQuery({
    queryKey: ["logs"],
    queryFn: () => CoreAPI.settingsLogsDownload(),
    enabled: connected,
    refetchOnWindowFocus: false,
  });

  // Parse JSONL content into structured log entries
  // eslint-disable-next-line react-hooks/preserve-manual-memoization -- Intentional: optional chain for safety, actual dep is content property
  const logEntries = useMemo(() => {
    if (!logsQuery.data?.content) return [];

    try {
      const decodedContent = atob(logsQuery.data.content);
      const lines = decodedContent.split("\n").filter((line) => line.trim());

      return lines
        .map((line, index) => {
          try {
            const parsed = JSON.parse(line) as LogEntry;
            return { ...parsed, _index: index };
          } catch {
            // Filter out corrupt JSON lines
            return null;
          }
        })
        .filter((entry) => entry !== null);
    } catch {
      return [];
    }
  }, [logsQuery.data?.content]);

  // Filter and sort log entries
  const filteredEntries = useMemo(() => {
    const filtered = logEntries.filter((entry) => {
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

  const isNative = Capacitor.isNativePlatform();

  const downloadFile = () => {
    if (!logsQuery.data) return;

    try {
      const decodedContent = atob(logsQuery.data.content);
      const bytes = Uint8Array.from(decodedContent, (character) =>
        character.charCodeAt(0),
      );
      const blob = new Blob([bytes], { type: "text/plain" });
      const url = URL.createObjectURL(blob);

      const a = document.createElement("a");
      a.href = url;
      a.download = logsQuery.data.filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      logger.error("Failed to download log file:", error, {
        category: "storage",
        action: "downloadLog",
        severity: "warning",
      });
    }
  };

  const writeToClipboard = async (value: string) => {
    if (isNative) {
      await Clipboard.write({ string: value });
    } else {
      await navigator.clipboard.writeText(value);
    }
  };

  const copyToClipboard = async () => {
    if (!logsQuery.data) return;

    try {
      const decodedContent = atob(logsQuery.data.content);
      await writeToClipboard(decodedContent);
    } catch (error) {
      logger.warn("Failed to copy to clipboard:", error, {
        category: "storage",
        action: "copyLog",
        severity: "warning",
      });
    }
  };

  const uploadMutation = useMutation({
    mutationFn: () => uploadLogs(logsQuery.data!.content),
    onSuccess: () => {
      toast.success(t("settings.logs.uploadSuccess"));
    },
    onError: () => {
      showRateLimitedErrorToast(t("settings.logs.uploadError"));
    },
  });

  const copyUploadUrl = async () => {
    if (!uploadMutation.data) return;

    try {
      await writeToClipboard(uploadMutation.data);
    } catch (error) {
      logger.error("Failed to copy log URL:", error, {
        category: "storage",
        action: "copyUploadUrl",
        severity: "warning",
      });
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

  const getLevelVariant = (level: string): BadgeVariant => {
    switch (level.toLowerCase()) {
      case "error":
        return "error";
      case "warn":
      case "warning":
        return "warning";
      case "info":
        return "info";
      default:
        return "default";
    }
  };

  const MESSAGE_TRUNCATE_LENGTH = 200;

  const toggleExpandEntry = (index: number) => {
    impact("light");
    setExpandedEntries((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(index)) {
        newSet.delete(index);
      } else {
        newSet.add(index);
      }
      return newSet;
    });
  };

  const toggleExpandField = (entryIndex: number, fieldKey: string) => {
    impact("light");
    const fieldId = `${entryIndex}_${fieldKey}`;
    setExpandedFields((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(fieldId)) {
        newSet.delete(fieldId);
      } else {
        newSet.add(fieldId);
      }
      return newSet;
    });
  };

  return (
    <>
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
            {t("settings.logs.title")}
          </h1>
        }
        headerRight={
          <div className="flex gap-2">
            {logsQuery.data && (
              <>
                <HeaderButton
                  onClick={copyToClipboard}
                  icon={<Copy size="20" />}
                  title={t("settings.logs.copy")}
                />
                {!isNative && (
                  <HeaderButton
                    onClick={downloadFile}
                    icon={<Download size="20" />}
                    title={t("settings.logs.download")}
                  />
                )}
              </>
            )}
            <HeaderButton
              onClick={() => logsQuery.refetch()}
              disabled={!connected || logsQuery.isLoading}
              icon={<RefreshCw size="20" />}
              title={
                logsQuery.isLoading ? t("loading") : t("settings.logs.refresh")
              }
            />
          </div>
        }
        scrollRef={scrollContainerRef}
      >
        <div className="flex h-full flex-col gap-3">
          {/* Control Bar */}
          <div className="flex flex-col gap-3">
            {logsQuery.data && (
              <div className="flex flex-col gap-2">
                <Button
                  className="w-full"
                  intent="primary"
                  label={
                    uploadMutation.isPending
                      ? t("settings.logs.uploading")
                      : t("settings.logs.upload")
                  }
                  icon={
                    uploadMutation.isPending ? (
                      <Loader2 size="20" className="animate-spin" />
                    ) : (
                      <Upload size="20" />
                    )
                  }
                  disabled={uploadMutation.isPending}
                  onClick={() => uploadMutation.mutate()}
                />

                {uploadMutation.data && (
                  <div className="flex gap-2" aria-live="polite">
                    <TextInput
                      className="min-w-0 flex-1"
                      type="url"
                      value={uploadMutation.data}
                      readOnly
                      aria-label={t("settings.logs.uploadResult")}
                    />
                    <Button
                      variant="outline"
                      size="lg"
                      icon={<Copy size="20" />}
                      aria-label={t("settings.logs.copyUploadLink")}
                      onClick={copyUploadUrl}
                    />
                  </div>
                )}
              </div>
            )}

            {/* Search */}
            <TextInput
              label=""
              aria-label={t("settings.logs.searchPlaceholder")}
              placeholder={t("settings.logs.searchPlaceholder")}
              value={searchTerm}
              setValue={setSearchTerm}
            />

            {/* Filters and Entry Count */}
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
              <div className="flex flex-row flex-wrap gap-1.5">
                <ToggleChip
                  label="Debug"
                  state={levelFilters.debug}
                  setState={(state) =>
                    setLogLevelFilters({ ...levelFilters, debug: state })
                  }
                  compact
                />
                <ToggleChip
                  label="Info"
                  state={levelFilters.info}
                  setState={(state) =>
                    setLogLevelFilters({ ...levelFilters, info: state })
                  }
                  compact
                />
                <ToggleChip
                  label="Warn"
                  state={levelFilters.warn}
                  setState={(state) =>
                    setLogLevelFilters({ ...levelFilters, warn: state })
                  }
                  compact
                />
                <ToggleChip
                  label="Error"
                  state={levelFilters.error}
                  setState={(state) =>
                    setLogLevelFilters({ ...levelFilters, error: state })
                  }
                  compact
                />
              </div>
              {logsQuery.data && logEntries.length > 0 && (
                <div className="text-muted-foreground text-sm sm:whitespace-nowrap">
                  {searchTerm || Object.values(levelFilters).some((v) => !v) ? (
                    <>
                      Showing {filteredEntries.length} of {logEntries.length}{" "}
                      entries
                    </>
                  ) : (
                    <>{logEntries.length} entries</>
                  )}
                </div>
              )}
            </div>

            {logsQuery.isError && (
              <p className="text-error text-sm">
                {t("settings.logs.fetchError")}
              </p>
            )}
          </div>

          {/* Log Entries */}
          {logsQuery.data && (
            <div className="flex-1 overflow-x-hidden overflow-y-auto">
              <div>
                {filteredEntries.map((entry, index) => (
                  <div
                    key={entry._index}
                    className="p-3 font-mono text-xs"
                    style={{
                      borderBottom:
                        index === filteredEntries.length - 1
                          ? ""
                          : "1px solid rgba(255,255,255,0.6)",
                    }}
                  >
                    <div className="mb-2 flex flex-row items-center gap-2 font-sans">
                      <Badge variant={getLevelVariant(entry.level)}>
                        {entry.level.charAt(0).toUpperCase() +
                          entry.level.slice(1)}
                      </Badge>
                      <span className="text-muted-foreground text-xs">
                        {formatTimestamp(entry.time)}
                      </span>
                    </div>
                    <div className="text-foreground font-mono text-sm break-all whitespace-pre-wrap">
                      {entry.message &&
                      entry.message.length > MESSAGE_TRUNCATE_LENGTH ? (
                        <>
                          {expandedEntries.has(entry._index)
                            ? entry.message
                            : `${entry.message.slice(0, MESSAGE_TRUNCATE_LENGTH)}...`}
                          <button
                            onClick={() => toggleExpandEntry(entry._index)}
                            className="text-muted-foreground hover:text-foreground ml-2 cursor-pointer font-sans text-sm underline"
                            type="button"
                          >
                            {expandedEntries.has(entry._index)
                              ? t("settings.logs.showLess")
                              : t("settings.logs.showMore")}
                          </button>
                        </>
                      ) : (
                        entry.message
                      )}
                    </div>
                    {/* Additional fields */}
                    {Object.entries(entry)
                      .filter(
                        ([key]) =>
                          ![
                            "level",
                            "time",
                            "caller",
                            "message",
                            "_index",
                          ].includes(key),
                      )
                      .map(([key, value]) => {
                        const fieldId = `${entry._index}_${key}`;
                        const valueStr = JSON.stringify(value);
                        const isExpanded = expandedFields.has(fieldId);
                        const needsTruncation =
                          valueStr.length > MESSAGE_TRUNCATE_LENGTH;

                        return (
                          <div
                            key={key}
                            className="text-muted-foreground mt-1 font-sans text-sm break-all"
                          >
                            <span className="font-medium">{key}:</span>{" "}
                            {needsTruncation ? (
                              <>
                                {isExpanded
                                  ? valueStr
                                  : `${valueStr.slice(0, MESSAGE_TRUNCATE_LENGTH)}...`}
                                <button
                                  onClick={() =>
                                    toggleExpandField(entry._index, key)
                                  }
                                  className="text-muted-foreground hover:text-foreground ml-2 cursor-pointer font-sans text-sm underline"
                                  type="button"
                                >
                                  {isExpanded
                                    ? t("settings.logs.showLess")
                                    : t("settings.logs.showMore")}
                                </button>
                              </>
                            ) : (
                              valueStr
                            )}
                          </div>
                        );
                      })}
                  </div>
                ))}
              </div>
            </div>
          )}

          {!connected && <EmptyState title={t("notConnected")} />}

          {connected && logsQuery.data && filteredEntries.length === 0 && (
            <EmptyState title={t("settings.logs.noEntriesFound")} />
          )}
        </div>
      </PageFrame>
      <BackToTop
        scrollContainerRef={scrollContainerRef}
        threshold={200}
        bottomOffset="calc(var(--bottom-nav-base-height) + 1rem)"
      />
    </>
  );
}
