import { SlidersHorizontal } from "lucide-react";
import { useTranslation } from "react-i18next";
import { SearchIcon } from "@/lib/images";
import { HeaderButton } from "@/components/wui/HeaderButton";

export function LibraryHeaderActions(props: {
  onSearch: () => void;
  onOpenOptions: () => void;
  searchDisabled?: boolean;
  optionsDisabled?: boolean;
  optionsActive?: boolean;
}) {
  const { t } = useTranslation();

  return (
    <div className="flex shrink-0 gap-1">
      <HeaderButton
        onClick={props.onSearch}
        icon={<SearchIcon size="24" />}
        aria-label={t("library.searchTitle")}
        disabled={props.searchDisabled}
      />
      <HeaderButton
        onClick={props.onOpenOptions}
        icon={<SlidersHorizontal size={24} />}
        aria-label={t("library.optionsTitle")}
        disabled={props.optionsDisabled}
        active={props.optionsActive}
      />
    </div>
  );
}
