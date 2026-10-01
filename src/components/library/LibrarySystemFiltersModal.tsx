import { useId } from "react";
import { Check } from "lucide-react";
import { useTranslation } from "react-i18next";
import classNames from "classnames";
import type { SystemReleasePeriod, SystemSort } from "@/lib/systemFilters";
import { handleRadioGroupKeyDown } from "@/lib/radioGroup";
import { SlideModal } from "@/components/SlideModal";
import { Button } from "@/components/wui/Button";
import { ModalActionBar } from "@/components/wui/ModalActionBar";
import { useHapticPress } from "@/hooks/useHapticPress";
import { Select } from "@/components/wui/Select";

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
  const handleHapticPress = useHapticPress();
  const manufacturerId = useId();
  const releasePeriodId = useId();
  const hasDraftOptions =
    props.selectedManufacturer !== "" ||
    props.releasePeriod !== "any" ||
    props.sort !== "name-asc";

  const footer = (
    <ModalActionBar
      secondaryAction={
        <Button
          label={t("library.resetOptions")}
          variant="outline"
          disabled={!hasDraftOptions}
          onClick={props.onReset}
        />
      }
      primaryAction={
        <Button
          label={t("library.showSystems", { count: props.resultCount })}
          intent="primary"
          onClick={props.onApply}
        />
      }
    />
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
          <div
            role="radiogroup"
            aria-label={t("library.sortSystems")}
            onKeyDown={handleRadioGroupKeyDown}
            tabIndex={-1}
          >
            {SORT_OPTIONS.map((option, index) => {
              const selected = props.sort === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  tabIndex={selected ? 0 : -1}
                  className={classNames(
                    "focus-visible:ring-ring flex min-h-12 w-full items-center justify-between gap-3 px-2 py-3 text-left focus-visible:ring-2 focus-visible:outline-none",
                    {
                      "border-border border-b": index < SORT_OPTIONS.length - 1,
                      "bg-foreground/10": selected,
                    },
                  )}
                  onPointerUp={handleHapticPress}
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
          <Select
            id={manufacturerId}
            value={props.selectedManufacturer}
            onChange={(event) =>
              props.onSelectedManufacturerChange(event.target.value)
            }
            disabled={props.manufacturers.length === 0}
          >
            <option value="">{t("library.anyManufacturer")}</option>
            {props.manufacturers.map((manufacturer) => (
              <option key={manufacturer} value={manufacturer}>
                {manufacturer}
              </option>
            ))}
          </Select>
        </section>

        <section className="flex flex-col gap-2">
          <label htmlFor={releasePeriodId} className="font-semibold">
            {t("library.releasePeriod")}
          </label>
          <Select
            id={releasePeriodId}
            value={props.releasePeriod}
            onChange={(event) =>
              props.onReleasePeriodChange(
                event.target.value as SystemReleasePeriod,
              )
            }
          >
            {RELEASE_PERIODS.map((option) => (
              <option key={option.value} value={option.value}>
                {t(option.labelKey)}
              </option>
            ))}
          </Select>
        </section>
      </div>
    </SlideModal>
  );
}
