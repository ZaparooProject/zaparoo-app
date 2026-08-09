import { useId } from "react";
import { Check } from "lucide-react";
import { useTranslation } from "react-i18next";
import classNames from "classnames";
import type { SystemReleasePeriod, SystemSort } from "@/lib/systemFilters";
import { SlideModal } from "@/components/SlideModal";
import { Button } from "@/components/wui/Button";

const SORT_OPTIONS: Array<{ value: SystemSort; labelKey: string }> = [
  { value: "name-asc", labelKey: "library.sortNameAsc" },
  { value: "name-desc", labelKey: "library.sortNameDesc" },
  { value: "year-asc", labelKey: "library.sortYearAsc" },
  { value: "year-desc", labelKey: "library.sortYearDesc" },
];

const RELEASE_PERIODS: Array<{
  value: SystemReleasePeriod;
  labelKey: string;
}> = [
  { value: "any", labelKey: "library.releasePeriodAny" },
  { value: "before-1980", labelKey: "library.releasePeriodBefore1980" },
  { value: "1980s", labelKey: "library.releasePeriod1980s" },
  { value: "1990s", labelKey: "library.releasePeriod1990s" },
  { value: "2000s", labelKey: "library.releasePeriod2000s" },
  { value: "2010s", labelKey: "library.releasePeriod2010s" },
  { value: "2020s", labelKey: "library.releasePeriod2020s" },
];

export function LibrarySystemFiltersModal(props: {
  isOpen: boolean;
  close: () => void;
  manufacturers: string[];
  selectedManufacturer: string;
  onSelectedManufacturerChange: (manufacturer: string) => void;
  releasePeriod: SystemReleasePeriod;
  onReleasePeriodChange: (period: SystemReleasePeriod) => void;
  sort: SystemSort;
  onSortChange: (sort: SystemSort) => void;
  resultCount: number;
  onReset: () => void;
  onApply: () => void;
}) {
  const { t } = useTranslation();
  const manufacturerId = useId();
  const releasePeriodId = useId();
  const hasDraftOptions =
    props.selectedManufacturer !== "" ||
    props.releasePeriod !== "any" ||
    props.sort !== "name-asc";

  const footer = (
    <div className="border-border flex gap-3 border-t pt-3">
      <Button
        label={t("library.resetOptions")}
        variant="outline"
        className="flex-1"
        disabled={!hasDraftOptions}
        onClick={props.onReset}
      />
      <Button
        label={t("library.showSystems", { count: props.resultCount })}
        className="flex-1"
        intent="primary"
        onClick={props.onApply}
      />
    </div>
  );

  return (
    <SlideModal
      isOpen={props.isOpen}
      close={props.close}
      title={t("library.optionsTitle")}
      footer={footer}
    >
      <div className="flex flex-col gap-5 py-3">
        <section className="flex flex-col gap-2">
          <h2 className="font-semibold">{t("library.sortSystems")}</h2>
          <div role="radiogroup" aria-label={t("library.sortSystems")}>
            {SORT_OPTIONS.map((option, index) => {
              const selected = props.sort === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  className={classNames(
                    "flex min-h-12 w-full items-center justify-between gap-3 px-2 py-3 text-left focus-visible:ring-2 focus-visible:ring-white/50 focus-visible:outline-none",
                    {
                      "border-b border-white/25":
                        index < SORT_OPTIONS.length - 1,
                      "bg-white/10": selected,
                    },
                  )}
                  onClick={() => props.onSortChange(option.value)}
                >
                  <span>{t(option.labelKey)}</span>
                  {selected && <Check size={20} aria-hidden="true" />}
                </button>
              );
            })}
          </div>
        </section>

        <section className="flex flex-col gap-2">
          <label htmlFor={manufacturerId} className="font-semibold">
            {t("library.manufacturer")}
          </label>
          <select
            id={manufacturerId}
            value={props.selectedManufacturer}
            onChange={(event) =>
              props.onSelectedManufacturerChange(event.target.value)
            }
            disabled={props.manufacturers.length === 0}
            className="border-input bg-background text-foreground w-full rounded-md border px-3 py-2 focus-visible:ring-2 focus-visible:ring-white/50 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60"
          >
            <option value="">{t("library.anyManufacturer")}</option>
            {props.manufacturers.map((manufacturer) => (
              <option key={manufacturer} value={manufacturer}>
                {manufacturer}
              </option>
            ))}
          </select>
        </section>

        <section className="flex flex-col gap-2">
          <label htmlFor={releasePeriodId} className="font-semibold">
            {t("library.releasePeriod")}
          </label>
          <select
            id={releasePeriodId}
            value={props.releasePeriod}
            onChange={(event) =>
              props.onReleasePeriodChange(
                event.target.value as SystemReleasePeriod,
              )
            }
            className="border-input bg-background text-foreground w-full rounded-md border px-3 py-2 focus-visible:ring-2 focus-visible:ring-white/50 focus-visible:outline-none"
          >
            {RELEASE_PERIODS.map((option) => (
              <option key={option.value} value={option.value}>
                {t(option.labelKey)}
              </option>
            ))}
          </select>
        </section>
      </div>
    </SlideModal>
  );
}
