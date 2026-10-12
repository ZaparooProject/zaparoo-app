import { useId, type RefObject } from "react";
import { useTranslation } from "react-i18next";
import type { MediaSearchFormState } from "@/hooks/useMediaSearchForm";
import { SearchIcon } from "@/lib/images";
import type { SearchResultGame } from "@/lib/models";
import { BackToTop } from "@/components/BackToTop";
import { SimpleSystemSelect } from "@/components/SimpleSystemSelect";
import {
  SystemSelector,
  SystemSelectorTrigger,
} from "@/components/SystemSelector";
import { TagSelector, TagSelectorTrigger } from "@/components/TagSelector";
import { VirtualSearchResults } from "@/components/VirtualSearchResults";
import { Button } from "@/components/wui/Button";
import { TextInput } from "@/components/wui/TextInput";

/** Which surface the form sits in; selects its layout classes. */
type MediaSearchLayout = "create" | "library" | "media";
/** A selector dialog, or a native select where a dialog would nest. */
type SystemPicker = "dialog" | "native";

interface MediaSearchFormProps {
  form: MediaSearchFormState;
  layout: MediaSearchLayout;
  /** Scroller that owns the virtual results. */
  scrollRef: RefObject<HTMLDivElement | null>;
  labels: {
    /** Accessible name of the search region. */
    region: string;
    input: string;
    placeholder: string;
    action: string;
  };
  systemPicker?: SystemPicker;
  /** Locks the filters, for example while the surface is closed. */
  disabled?: boolean;
  selectedResult: SearchResultGame | null;
  setSelectedResult: (result: SearchResultGame | null) => void;
  selectionPresentation?: "modal" | "pane";
  compactEmptyState?: boolean;
  /** Library surfaces use the artwork rows of their browse lists. */
  rowVariant?: "plain" | "library";
  /** Offer Clear filters, with filter-aware hints, when nothing is found. */
  filterRecovery?: boolean;
}

/**
 * Query input, system and tag filters, the Search action and the results list.
 * Result rows are rendered by VirtualSearchResults alone, so a row variant is
 * added there. Pair with MediaSearchSelectors for the filter dialogs.
 */
export function MediaSearchForm({
  form,
  layout,
  scrollRef,
  labels,
  systemPicker = "dialog",
  disabled = false,
  selectedResult,
  setSelectedResult,
  selectionPresentation,
  compactEmptyState,
  rowVariant,
  filterRecovery = true,
}: MediaSearchFormProps) {
  const { t } = useTranslation();
  const id = useId();
  const systemLabelId = `${id}-system-label`;
  const tagsLabelId = `${id}-tags-label`;
  const fieldsDisabled = !form.canUseSearch || disabled;
  const { searchSystem, searchTags, ...results } = form.results;

  return (
    <>
      <div className={`${layout}-search-workspace`}>
        <div
          role="search"
          aria-label={labels.region}
          className={`${layout}-search-filters flex flex-col gap-3`}
        >
          <TextInput
            label={labels.input}
            placeholder={labels.placeholder}
            value={form.query}
            setValue={form.setQuery}
            type="search"
            clearable
            disabled={!form.canUseSearch}
            onKeyUp={(event) => {
              if (event.key === "Enter") {
                event.currentTarget.blur();
                form.submit();
              }
            }}
          />

          <div
            className={
              layout === "media"
                ? "flex flex-col gap-3"
                : `${layout}-search-filter-selectors`
            }
          >
            <div className="flex flex-col md:flex-1">
              <span id={systemLabelId} className="text-foreground mb-1">
                {t("create.search.systemInput")}
              </span>
              {systemPicker === "native" ? (
                <SimpleSystemSelect
                  aria-labelledby={systemLabelId}
                  value={form.system}
                  onSelect={form.setSystem}
                  includeAllOption
                  disabled={fieldsDisabled}
                />
              ) : (
                <SystemSelectorTrigger
                  aria-labelledby={systemLabelId}
                  selectedSystems={form.system === "all" ? [] : [form.system]}
                  systemsData={form.systemsData}
                  placeholder={t("create.search.allSystems")}
                  mode="single"
                  onClick={() => form.setSystemSelectorOpen(true)}
                  disabled={fieldsDisabled}
                />
              )}
            </div>

            {form.mediaTagsAvailable && (
              <div className="flex flex-col md:flex-1">
                <span id={tagsLabelId} className="text-foreground mb-1">
                  {t("create.search.tagsInput")}
                </span>
                <TagSelectorTrigger
                  aria-labelledby={tagsLabelId}
                  selectedTags={form.tags}
                  placeholder={t("create.search.allTags")}
                  onClick={() => form.setTagSelectorOpen(true)}
                  disabled={fieldsDisabled}
                />
              </div>
            )}
          </div>

          <Button
            label={labels.action}
            icon={<SearchIcon size="20" />}
            onClick={form.submit}
            disabled={!form.canSubmit || form.resultsLoading}
            disabledAppearance={form.resultsLoading ? "busy" : "unavailable"}
            className="w-full"
          />
        </div>

        <div className={`${layout}-search-results`}>
          <VirtualSearchResults
            {...results}
            {...(filterRecovery
              ? {
                  searchSystem,
                  searchTags,
                  onClearFilters: form.clearFilters,
                }
              : {})}
            selectedResult={selectedResult}
            setSelectedResult={setSelectedResult}
            selectionPresentation={selectionPresentation}
            compactEmptyState={compactEmptyState}
            rowVariant={rowVariant}
            scrollContainerRef={scrollRef}
          />
        </div>
      </div>
      <BackToTop scrollContainerRef={scrollRef} threshold={200} />
    </>
  );
}

/**
 * The form's system and tag selector dialogs. Rendered by the owner beside its
 * own dialogs, so a surface that is itself a dialog can step aside for them.
 */
export function MediaSearchSelectors({
  form,
  systemPicker = "dialog",
  active = true,
}: {
  form: MediaSearchFormState;
  systemPicker?: SystemPicker;
  /** False while the owning surface is closed. */
  active?: boolean;
}) {
  const { t } = useTranslation();

  return (
    <>
      {systemPicker === "dialog" && (
        <SystemSelector
          isOpen={active && form.systemSelectorOpen}
          onClose={() => form.setSystemSelectorOpen(false)}
          onSelect={(systems) => form.setSystem(systems[0] ?? "all")}
          selectedSystems={form.system === "all" ? [] : [form.system]}
          mode="single"
          title={t("create.search.selectSystem")}
          includeAllOption
          defaultSelection="all"
        />
      )}
      {form.mediaTagsAvailable && (
        <TagSelector
          isOpen={active && form.tagSelectorOpen}
          onClose={() => form.setTagSelectorOpen(false)}
          onSelect={form.setTags}
          selectedTags={form.tags}
          systems={form.system === "all" ? [] : [form.system]}
          title={t("create.search.selectTags")}
        />
      )}
    </>
  );
}
