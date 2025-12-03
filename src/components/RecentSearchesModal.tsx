import { useTranslation } from "react-i18next";
import { Trash2 } from "lucide-react";
import { RecentSearch } from "@/hooks/useRecentSearches";
import { SearchIcon } from "@/lib/images";
import { SlideModal } from "./SlideModal";
import { Card } from "./wui/Card";
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

  const handleClearHistory = () => {
    onClearHistory();
    onClose();
  };

  return (
    <SlideModal
      isOpen={isOpen}
      close={onClose}
      title={t("create.search.recentSearches")}
    >
      <div className="flex flex-col gap-3 pt-2">
        {recentSearches.length === 0 ? (
          <div className="text-muted-foreground py-8 text-center">
            <p>{t("create.search.noRecentSearches")}</p>
            <p className="mt-2 text-sm">
              {t("create.search.noRecentSearchesHint")}
            </p>
          </div>
        ) : (
          <>
            <div className="flex flex-col gap-2">
              {recentSearches.map((search, index) => (
                <Card
                  key={index}
                  className="cursor-pointer"
                  onClick={() => handleSearchSelect(search)}
                >
                  <div className="flex flex-row items-center gap-3">
                    <Button
                      icon={<SearchIcon size="20" />}
                      aria-label={t("create.search.searchResult")}
                    />
                    <div className="flex grow flex-col">
                      <span className="text-sm font-semibold">
                        {getSearchDisplayText(search)}
                      </span>
                      <span className="text-muted-foreground text-xs">
                        {new Date(search.timestamp).toLocaleString()}
                      </span>
                    </div>
                  </div>
                </Card>
              ))}
            </div>

            <div className="border-foreground-muted/20 border-t pt-3">
              <Button
                label={t("create.search.clearHistory")}
                icon={<Trash2 size="20" />}
                variant="outline"
                onClick={handleClearHistory}
                className="w-full"
              />
            </div>
          </>
        )}
      </div>
    </SlideModal>
  );
}
