import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { CoreAPI } from "@/lib/coreApi";
import { LIBRARY_QUERY_KEYS } from "@/lib/libraryMedia";
import type { MediaBrowseIndexGroup, MediaBrowseSort } from "@/lib/models";
import { SlideModal } from "@/components/SlideModal";
import { EmptyState } from "@/components/wui/EmptyState";
import { Button } from "@/components/wui/Button";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { DelayedLoading } from "@/components/DelayedLoading";

export function LibraryLetterJumpModal(props: {
  isOpen: boolean;
  close: () => void;
  systemId: string;
  path: string;
  deviceKey: string;
  sort: MediaBrowseSort;
  onSelect: (group: MediaBrowseIndexGroup) => void;
}) {
  const { t } = useTranslation();
  const indexQuery = useQuery({
    queryKey: [
      LIBRARY_QUERY_KEYS.browseIndex,
      props.deviceKey,
      props.systemId,
      props.path,
      props.sort,
    ],
    queryFn: ({ signal }) =>
      CoreAPI.mediaBrowseIndex(
        {
          path: props.path,
          systems: [props.systemId],
          sort: props.sort,
        },
        signal,
      ),
    enabled: props.isOpen && props.path !== "",
    staleTime: 5 * 60 * 1000,
  });

  return (
    <SlideModal
      isOpen={props.isOpen}
      close={props.close}
      title={t("library.goToTitle")}
      fixedHeight="70vh"
    >
      <div className="flex flex-col gap-2 py-2">
        {indexQuery.isLoading ? (
          <DelayedLoading>
            <div className="text-muted-foreground flex items-center justify-center gap-2 py-8">
              <LoadingSpinner size={16} className="text-primary" />
              <span>{t("library.loadingLetters")}</span>
            </div>
          </DelayedLoading>
        ) : indexQuery.isError ? (
          <EmptyState
            title={t("library.lettersError")}
            action={
              <Button
                label={t("library.tryAgain")}
                variant="outline"
                onClick={() => void indexQuery.refetch()}
              />
            }
          />
        ) : indexQuery.data?.scheme === "none" ||
          indexQuery.data?.groups.length === 0 ? (
          <EmptyState title={t("library.noLetterIndex")} />
        ) : (
          indexQuery.data?.groups.map((group) => (
            <button
              key={group.key}
              type="button"
              className="flex min-h-[48px] items-center justify-between rounded-lg px-4 py-3 text-left hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-white/50 focus-visible:outline-none"
              onClick={() => props.onSelect(group)}
            >
              <span className="font-medium">{group.label}</span>
              <span className="text-muted-foreground text-sm">
                {t("library.itemCount", { count: group.count })}
              </span>
            </button>
          ))
        )}
      </div>
    </SlideModal>
  );
}
