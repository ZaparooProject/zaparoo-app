import { Check } from "lucide-react";
import { useTranslation } from "react-i18next";
import classNames from "classnames";
import type { SystemSort } from "@/lib/systemFilters";
import { SlideModal } from "@/components/SlideModal";

const SORT_OPTIONS: Array<{ value: SystemSort; labelKey: string }> = [
  { value: "name-asc", labelKey: "library.sortNameAsc" },
  { value: "name-desc", labelKey: "library.sortNameDesc" },
  { value: "year-asc", labelKey: "library.sortYearAsc" },
  { value: "year-desc", labelKey: "library.sortYearDesc" },
];

export function LibrarySystemSortModal(props: {
  isOpen: boolean;
  close: () => void;
  value: SystemSort;
  onChange: (sort: SystemSort) => void;
}) {
  const { t } = useTranslation();

  return (
    <SlideModal
      isOpen={props.isOpen}
      close={props.close}
      title={t("library.sortSystems")}
    >
      <div
        className="flex flex-col py-2"
        role="radiogroup"
        aria-label={t("library.sortSystems")}
      >
        {SORT_OPTIONS.map((option, index) => {
          const selected = props.value === option.value;
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={selected}
              className={classNames(
                "flex min-h-12 items-center justify-between gap-3 px-2 py-3 text-left focus-visible:ring-2 focus-visible:ring-white/50 focus-visible:outline-none",
                {
                  "border-b border-white/25": index < SORT_OPTIONS.length - 1,
                  "bg-white/10": selected,
                },
              )}
              onClick={() => {
                props.onChange(option.value);
                props.close();
              }}
            >
              <span>{t(option.labelKey)}</span>
              {selected && <Check size={20} aria-hidden="true" />}
            </button>
          );
        })}
      </div>
    </SlideModal>
  );
}
