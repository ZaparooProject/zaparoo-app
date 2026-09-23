import { useTranslation } from "react-i18next";
import { Trash2 } from "lucide-react";
import { RecentSearch } from "@/hooks/useRecentSearches";
import { SearchIcon } from "@/lib/images";
import { EmptyState } from "@/components/wui/EmptyState";
import { HistoryListRow } from "./HistoryListRow";
import { SlideModal } from "./SlideModal";
import { Button } from "./wui/Button";

interface RecentSearchesModalProps {
  isOpen: boolean;
  onClose: () => void;
  recentSearches: RecentSearch[];
  onSearchSelect: (search: RecentSearch) => void;
  onClearHistory: () => void;
  getSearchDisplayText: (search: RecentSearch) => string;
}

export function RecentSearchesModal({
  isOpen,
  onClose,
  recentSearches,
  onSearchSelect,
  onClearHistory,
  getSearchDisplayText,
}: RecentSearchesModalProps) {
  const { t } = useTranslation();

  const handleSearchSelect = (search: RecentSearch) => {
    onSearchSelect(search);
    onClose();
  };

  return (
    <SlideModal
      isOpen={isOpen}
      close={onClose}
      title={t("create.search.recentSearches")}
    >
      {recentSearches.length === 0 ? (
        <EmptyState
          title={t("create.search.noRecentSearches")}
          description={t("create.search.noRecentSearchesHint")}
        />
      ) : (
        <>
          <ul>
            {recentSearches.map((search, index) => {
              const displayText = getSearchDisplayText(search);

              return (
                <HistoryListRow
                  key={`${search.timestamp}:${index}`}
                  title={<span className="break-words">{displayText}</span>}
                  meta={new Date(search.timestamp).toLocaleString()}
                  action={
                    <Button
                      icon={<SearchIcon size="20" />}
                      variant="ghost"
                      size="sm"
                      aria-label={displayText}
                      onClick={() => handleSearchSelect(search)}
                    />
                  }
                />
              );
            })}
          </ul>
          <div className="px-3 pt-2">
            <Button
              label={t("create.search.clearHistory")}
              icon={<Trash2 size="18" />}
              variant="text"
              size="sm"
              intent="destructive"
              className="w-full"
              onClick={onClearHistory}
            />
          </div>
        </>
      )}
    </SlideModal>
  );
}
