import { useTranslation } from "react-i18next";
import { Trash2 } from "lucide-react";
import { RecentSearch } from "../hooks/useRecentSearches";
import { SearchIcon } from "../lib/images";
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
  getSearchDisplayText
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
          <div className="text-center text-muted-foreground py-8">
            <p>{t("create.search.noRecentSearches")}</p>
            <p className="text-sm mt-2">{t("create.search.noRecentSearchesHint")}</p>
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
                    <Button icon={<SearchIcon size="20" />} />
                    <div className="flex grow flex-col">
                      <span className="font-semibold text-sm">
                        {getSearchDisplayText(search)}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {new Date(search.timestamp).toLocaleString()}
                      </span>
                    </div>
                  </div>
                </Card>
              ))}
            </div>

            <div className="pt-3 border-t border-foreground-muted/20">
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