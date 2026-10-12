import { useId } from "react";
import { useTranslation } from "react-i18next";
import type { SystemReleasePeriod, SystemSort } from "@/lib/systemFilters";
import { SlideModal } from "@/components/SlideModal";
import { Button } from "@/components/wui/Button";
import { ModalActionBar } from "@/components/wui/ModalActionBar";
import { LibrarySortOptionList } from "@/components/library/LibrarySortOptionList";
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
        <LibrarySortOptionList
          label={t("library.sortSystems")}
          options={SORT_OPTIONS}
          value={props.sort}
          onChange={props.onSortChange}
        />

        <section className="flex flex-col gap-2">
          <label htmlFor={manufacturerId} className="text-lg font-semibold">
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
          <label htmlFor={releasePeriodId} className="text-lg font-semibold">
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
