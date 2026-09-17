import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { libraryBrowseIndexQueryOptions } from "@/lib/libraryBrowse";
import type { MediaBrowseIndexGroup, MediaBrowseSort } from "@/lib/models";
import { SlideModal } from "@/components/SlideModal";
import { EmptyState } from "@/components/wui/EmptyState";
import { Button } from "@/components/wui/Button";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { DelayedLoading } from "@/components/DelayedLoading";
import { useHapticPress } from "@/hooks/useHapticPress";

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
  const handleHapticPress = useHapticPress();
  const indexQuery = useQuery({
    ...libraryBrowseIndexQueryOptions({
      deviceKey: props.deviceKey,
      systemId: props.systemId,
      path: props.path,
      sort: props.sort,
    }),
    enabled: props.isOpen && props.path !== "",
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
              className="hover:bg-foreground/10 focus-visible:ring-ring flex min-h-[48px] items-center justify-between rounded-lg px-4 py-3 text-left focus-visible:ring-2 focus-visible:outline-none"
              onPointerUp={handleHapticPress}
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
