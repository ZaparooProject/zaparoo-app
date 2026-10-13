import { useTranslation } from "react-i18next";
import type { MediaBrowseSort } from "@/lib/models";
import { SlideModal } from "@/components/SlideModal";
import { Button } from "@/components/wui/Button";
import { LibrarySortOptionList } from "@/components/library/LibrarySortOptionList";

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
        <LibrarySortOptionList
          label={t("library.sortMedia")}
          options={SORT_OPTIONS}
          value={props.value}
          onChange={(sort) => {
            props.onChange(sort);
            props.close();
          }}
        />
      </div>
    </SlideModal>
  );
}
