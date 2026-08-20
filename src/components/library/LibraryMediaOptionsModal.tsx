import { Check } from "lucide-react";
import { useTranslation } from "react-i18next";
import classNames from "classnames";
import type { MediaBrowseSort } from "@/lib/models";
import { handleRadioGroupKeyDown } from "@/lib/radioGroup";
import { SlideModal } from "@/components/SlideModal";
import { Button } from "@/components/wui/Button";
import { useHapticPress } from "@/hooks/useHapticPress";

const SORT_OPTIONS: Array<{ value: MediaBrowseSort; labelKey: string }> = [
  { value: "name-asc", labelKey: "library.sortTitleAsc" },
  { value: "name-desc", labelKey: "library.sortTitleDesc" },
  { value: "filename-asc", labelKey: "library.sortFilenameAsc" },
  { value: "filename-desc", labelKey: "library.sortFilenameDesc" },
];

export function LibraryMediaOptionsModal(props: {
  isOpen: boolean;
  close: () => void;
  value: MediaBrowseSort;
  onChange: (sort: MediaBrowseSort) => void;
  canGoToLetter: boolean;
  onGoToLetter: () => void;
}) {
  const { t } = useTranslation();
  const handleHapticPress = useHapticPress();

  return (
    <SlideModal
      isOpen={props.isOpen}
      close={props.close}
      title={t("library.optionsTitle")}
      footer={
        <Button
          label={t("library.goToTitle")}
          variant="outline"
          className="w-full"
          disabled={!props.canGoToLetter}
          onClick={props.onGoToLetter}
        />
      }
    >
      <div className="flex flex-col gap-5 py-3">
        <section className="flex flex-col gap-2">
          <h2 className="font-semibold">{t("library.sortMedia")}</h2>
          <div
            role="radiogroup"
            aria-label={t("library.sortMedia")}
            onKeyDown={handleRadioGroupKeyDown}
            tabIndex={-1}
          >
            {SORT_OPTIONS.map((option, index) => {
              const selected = props.value === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  tabIndex={selected ? 0 : -1}
                  className={classNames(
                    "flex min-h-12 w-full items-center justify-between gap-3 px-2 py-3 text-left focus-visible:ring-2 focus-visible:ring-white/50 focus-visible:outline-none",
                    {
                      "border-b border-white/25":
                        index < SORT_OPTIONS.length - 1,
                      "bg-white/10": selected,
                    },
                  )}
                  onPointerUp={handleHapticPress}
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
        </section>
      </div>
    </SlideModal>
  );
}
