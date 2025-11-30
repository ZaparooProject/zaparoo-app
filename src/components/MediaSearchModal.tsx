import { useTranslation } from "react-i18next";
import { useRef, useState } from "react";
import { Preferences } from "@capacitor/preferences";
import classNames from "classnames";
import { useStatusStore } from "@/lib/store.ts";
import { logger } from "@/lib/logger";
import { SlideModal } from "@/components/SlideModal.tsx";
import { TextInput } from "@/components/wui/TextInput.tsx";
import { Button } from "@/components/wui/Button.tsx";
import { VirtualSearchResults } from "@/components/VirtualSearchResults.tsx";
import { SearchResultGame } from "@/lib/models.ts";
import { BackToTop } from "@/components/BackToTop.tsx";
import { SearchIcon } from "@/lib/images.tsx";
import { SimpleSystemSelect } from "@/components/SimpleSystemSelect.tsx";

export function MediaSearchModal(props: {
  isOpen: boolean;
  close: () => void;
  onSelect: (path: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [selectedSystem, setSelectedSystem] = useState<string>("all");
  const [selectedResult, setSelectedResult] = useState<SearchResultGame | null>(
    null
  );

  // State for tracking actual searched parameters
  const [searchParams, setSearchParams] = useState<{
    query: string;
    system: string;
  } | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const connected = useStatusStore((state) => state.connected);
  const { close, onSelect } = props;
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const gamesIndex = useStatusStore((state) => state.gamesIndex);

  // Manual search function
  const performSearch = () => {
    if (
      !connected ||
      !gamesIndex.exists ||
      gamesIndex.indexing
    ) {
      return;
    }

    setIsSearching(true);
    setSearchParams({
      query: query,
      system: selectedSystem
    });
  };

  // Handle system selection
  const handleSystemSelect = async (systemId: string) => {
    setSelectedSystem(systemId);
    await Preferences.set({ key: "searchSystem", value: systemId }).catch((e) => {
      logger.error("Failed to save search system preference:", e, { category: "storage", action: "set", key: "searchSystem", severity: "warning" });
    });
  };

  // Handle result selection - called by VirtualSearchResults when a result is clicked
  const handleResultSelect = (result: SearchResultGame | null) => {
    if (result) {
      // Use zapScript if available, otherwise fall back to path
      const valueToInsert = result.zapScript || result.path;
      onSelect(valueToInsert);
      close();
    }
    setSelectedResult(result);
  };

  const canSearch = connected && gamesIndex.exists && !gamesIndex.indexing;

  return (
    <>
      <SlideModal
        isOpen={props.isOpen}
        close={props.close}
        title={t("create.search.title")}
        scrollRef={scrollContainerRef}
        fixedHeight="90vh"
      >
        <div className="flex min-h-0 flex-col">
          <div className="flex flex-col gap-3 p-2 pt-3">
            <TextInput
              ref={inputRef}
              label={t("create.search.gameInput")}
              placeholder={t("create.search.gameInputPlaceholder")}
              value={query}
              setValue={setQuery}
              type="search"
              clearable={true}
              disabled={!canSearch}
              onKeyUp={(e) => {
                if (e.key === "Enter" || e.keyCode === 13) {
                  e.currentTarget.blur();
                  performSearch();
                }
              }}
            />

            <div className="flex flex-col">
              <label className="mb-1 text-white">
                {t("create.search.systemInput")}
              </label>
              <SimpleSystemSelect
                value={selectedSystem}
                onSelect={handleSystemSelect}
                includeAllOption={true}
                className={classNames({
                  "opacity-50": !canSearch
                })}
              />
            </div>

            <Button
              label={t("create.search.searchButton")}
              icon={<SearchIcon size="20" />}
              onClick={performSearch}
              disabled={!canSearch || isSearching}
              className="w-full"
            />
          </div>

          <div className="min-h-0 flex-1">
            <VirtualSearchResults
              query={searchParams?.query || ""}
              systems={
                searchParams
                  ? searchParams.system === "all"
                    ? []
                    : [searchParams.system]
                  : []
              }
              selectedResult={selectedResult}
              setSelectedResult={handleResultSelect}
              hasSearched={searchParams !== null}
              isSearching={isSearching}
              onSearchComplete={() => setIsSearching(false)}
              scrollContainerRef={scrollContainerRef}
            />
          </div>
        </div>

        <BackToTop
          scrollContainerRef={scrollContainerRef}
          threshold={200}
          bottomOffset="1rem"
        />
      </SlideModal>
    </>
  );
}
