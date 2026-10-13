import { useTranslation } from "react-i18next";
import { useRef, useState } from "react";
import { PlusIcon } from "lucide-react";
import { SlideModal } from "@/components/SlideModal.tsx";
import { Button } from "@/components/wui/Button.tsx";
import { SearchResultGame } from "@/lib/models.ts";
import {
  MediaSearchForm,
  MediaSearchSelectors,
} from "@/components/MediaSearchForm";
import { useMediaSearchForm } from "@/hooks/useMediaSearchForm";
import { MediaDetailsModal } from "@/components/MediaDetailsModal";

type MediaSearchModalProps = {
  isOpen: boolean;
  close: () => void;
  onAddCustom?: () => void;
} & (
  | { onSelect: (value: string) => void; onSelectMedia?: never }
  | { onSelectMedia: (result: SearchResultGame) => void; onSelect?: never }
);

export function MediaSearchModal(props: MediaSearchModalProps) {
  const { t } = useTranslation();
  const [selectedResult, setSelectedResult] = useState<SearchResultGame | null>(
    null,
  );
  const { close } = props;
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const form = useMediaSearchForm({
    active: props.isOpen,
    dropUnsupportedTags: true,
  });

  // Handle result selection - called by VirtualSearchResults when a result is clicked
  const handleResultSelect = (result: SearchResultGame | null) => {
    if (result && props.onSelectMedia) {
      props.onSelectMedia(result);
      return;
    }
    setSelectedResult(result);
  };

  return (
    <>
      <SlideModal
        // Steps aside for the details and tag selector it opens.
        isOpen={
          props.isOpen && selectedResult === null && !form.tagSelectorOpen
        }
        close={props.close}
        title={t("create.search.title")}
        scrollRef={scrollContainerRef}
        fixedHeight="90vh"
        footer={
          props.onAddCustom ? (
            <Button
              label={t("decks.addCustomScript")}
              variant="outline"
              className="w-full"
              onClick={props.onAddCustom}
            />
          ) : undefined
        }
      >
        <MediaSearchForm
          form={form}
          layout="media"
          scrollRef={scrollContainerRef}
          labels={{
            region: t("create.search.title"),
            input: t("create.search.gameInput"),
            placeholder: t("create.search.gameInputPlaceholder"),
            action: t("create.search.searchButton"),
          }}
          // A native select, so choosing a system never nests a dialog here.
          systemPicker="native"
          disabled={!props.isOpen}
          selectedResult={selectedResult}
          setSelectedResult={handleResultSelect}
          compactEmptyState
          filterRecovery={false}
        />
      </SlideModal>
      <MediaSearchSelectors
        form={form}
        systemPicker="native"
        active={props.isOpen}
      />
      {props.onSelect && (
        <MediaDetailsModal
          isOpen={props.isOpen && selectedResult !== null}
          close={() => setSelectedResult(null)}
          media={selectedResult}
          onWrite={(value) => {
            props.onSelect?.(value);
            setSelectedResult(null);
            close();
          }}
          primaryActionLabel={t("create.custom.insert")}
          primaryActionIcon={<PlusIcon size="20" />}
          showFavorite={false}
        />
      )}
    </>
  );
}
