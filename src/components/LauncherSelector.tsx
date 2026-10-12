import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { CoreAPI } from "@/lib/coreApi";
import { useActiveDeviceKey } from "@/hooks/useActiveDeviceKey";
import { useHapticPress } from "@/hooks/useHapticPress";
import { EmptyState } from "@/components/wui/EmptyState";
import { TextInput } from "@/components/wui/TextInput";
import { Button } from "@/components/wui/Button";
import { DelayedLoading } from "@/components/DelayedLoading";
import { InlineLoading } from "@/components/InlineLoading";
import { BackToTop } from "@/components/BackToTop";
import { SlideModal } from "@/components/SlideModal";
import { selectorOptionClassName } from "@/components/selectorOptionClassName";

// Core's own launchers for virtual systems; a script never names one.
const VIRTUAL_LAUNCHER_PREFIX = "ZaparooVirtual-";

/** Picks one of the launchers the connected Core reports, by its ID. */
export function LauncherSelector({
  isOpen,
  onClose,
  onSelect,
}: {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (launcherId: string) => void;
}) {
  const { t } = useTranslation();
  const scrollRef = useRef<HTMLDivElement>(null);
  const handleHapticPress = useHapticPress();
  const deviceKey = useActiveDeviceKey();
  const [query, setQuery] = useState("");
  const [wasOpen, setWasOpen] = useState(isOpen);
  if (wasOpen !== isOpen) {
    setWasOpen(isOpen);
    if (!isOpen) setQuery("");
  }
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["launchers", deviceKey],
    queryFn: () => CoreAPI.launchers(),
    enabled: isOpen,
    staleTime: 0,
  });
  const needle = query.trim().toLowerCase();
  const launchers = (data?.launchers ?? []).filter(
    (launcher) =>
      !launcher.id.startsWith(VIRTUAL_LAUNCHER_PREFIX) &&
      (launcher.id.toLowerCase().includes(needle) ||
        (launcher.systemName ?? launcher.systemId ?? "")
          .toLowerCase()
          .includes(needle)),
  );

  return (
    <SlideModal
      isOpen={isOpen}
      close={onClose}
      title={t("launcherSelector.title")}
      scrollRef={scrollRef}
      fixedHeight="90vh"
    >
      <div className="pb-2">
        <TextInput
          type="search"
          inputMode="search"
          aria-label={t("launcherSelector.search")}
          placeholder={t("launcherSelector.search")}
          value={query}
          setValue={(value) => {
            setQuery(value);
            scrollRef.current?.scrollTo({ top: 0 });
          }}
          clearable
        />
      </div>
      {isLoading ? (
        <DelayedLoading>
          <InlineLoading />
        </DelayedLoading>
      ) : isError ? (
        <EmptyState
          className="h-32"
          title={t("launcherSelector.loadError")}
          action={
            <Button
              label={t("library.tryAgain")}
              variant="outline"
              onClick={() => void refetch()}
            />
          }
        />
      ) : launchers.length === 0 ? (
        <EmptyState
          className="h-32"
          title={t(
            needle
              ? "launcherSelector.noResults"
              : "launcherSelector.noLaunchers",
          )}
        />
      ) : (
        <ul aria-label={t("launcherSelector.title")}>
          {launchers.map((launcher) => {
            const system = launcher.systemName ?? launcher.systemId;
            const detail = launcher.available
              ? system
              : [system, t("launcherSelector.unavailable")]
                  .filter(Boolean)
                  .join(" · ");
            return (
              // Core lists one launcher ID once per system it serves.
              <li key={`${launcher.systemId ?? ""}:${launcher.id}`}>
                <button
                  type="button"
                  className={selectorOptionClassName(false, { twoLine: true })}
                  onPointerUp={handleHapticPress}
                  onClick={() => {
                    onSelect(launcher.id);
                    onClose();
                  }}
                >
                  <span className="flex min-w-0 flex-col">
                    <span className="text-foreground font-medium break-words">
                      {launcher.id}
                    </span>
                    {detail && (
                      <span className="text-muted-foreground text-sm">
                        {detail}
                      </span>
                    )}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <BackToTop scrollContainerRef={scrollRef} threshold={200} />
    </SlideModal>
  );
}
