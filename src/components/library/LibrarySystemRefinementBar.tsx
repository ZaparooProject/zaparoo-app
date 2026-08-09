import { X } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { SystemReleasePeriod, SystemSort } from "@/lib/systemFilters";
import { Button } from "@/components/wui/Button";

function sortLabelKey(sort: SystemSort) {
  switch (sort) {
    case "name-asc":
      return "library.sortNameAsc";
    case "name-desc":
      return "library.sortNameDesc";
    case "year-asc":
      return "library.sortYearAsc";
    case "year-desc":
      return "library.sortYearDesc";
  }
}

function releasePeriodLabelKey(period: SystemReleasePeriod) {
  switch (period) {
    case "any":
      return "library.releasePeriodAny";
    case "before-1980":
      return "library.releasePeriodBefore1980";
    case "1980s":
      return "library.releasePeriod1980s";
    case "1990s":
      return "library.releasePeriod1990s";
    case "2000s":
      return "library.releasePeriod2000s";
    case "2010s":
      return "library.releasePeriod2010s";
    case "2020s":
      return "library.releasePeriod2020s";
  }
}

export function LibraryRefinementSummary(props: {
  labels: string[];
  onClear: () => void;
}) {
  const { t } = useTranslation();
  if (props.labels.length === 0) return null;

  return (
    <div
      className="flex min-h-8 items-center justify-between gap-2 px-1 pb-2"
      aria-label={t("library.activeOptions")}
    >
      <span className="text-muted-foreground min-w-0 truncate text-sm">
        {props.labels.join(" · ")}
      </span>
      <Button
        icon={<X size={16} />}
        size="sm"
        variant="text"
        aria-label={t("library.clearOptions")}
        onClick={props.onClear}
      />
    </div>
  );
}

export function LibrarySystemRefinementBar(props: {
  activeManufacturer: string;
  releasePeriod: SystemReleasePeriod;
  sort: SystemSort;
  onClearAll: () => void;
}) {
  const { t } = useTranslation();
  const activeLabels = [
    ...(props.activeManufacturer === "" ? [] : [props.activeManufacturer]),
    ...(props.releasePeriod === "any"
      ? []
      : [t(releasePeriodLabelKey(props.releasePeriod))]),
    ...(props.sort === "name-asc" ? [] : [t(sortLabelKey(props.sort))]),
  ];

  return (
    <LibraryRefinementSummary
      labels={activeLabels}
      onClear={props.onClearAll}
    />
  );
}
