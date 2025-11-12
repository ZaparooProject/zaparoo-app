import { useTranslation } from "react-i18next";
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Preferences } from "@capacitor/preferences";
import classNames from "classnames";
import { useStatusStore } from "@/lib/store.ts";
import { CoreAPI } from "@/lib/coreApi.ts";
import { SlideModal } from "@/components/SlideModal.tsx";
import { TextInput } from "@/components/wui/TextInput.tsx";
import { Button } from "@/components/wui/Button.tsx";
import { VirtualSearchResults } from "@/components/VirtualSearchResults.tsx";
import { SearchResultGame } from "@/lib/models.ts";
import { BackToTop } from "@/components/BackToTop.tsx";
import { SearchIcon } from "@/lib/images.tsx";
import {
  SystemSelector,
  SystemSelectorTrigger
} from "@/components/SystemSelector.tsx";

export function MediaSearchModal(props: {
  isOpen: boolean;
  close: () => void;
  onSelect: (path: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [selectedSystem, setSelectedSystem] = useState<string>("all");
  const [systemSelectorOpen, setSystemSelectorOpen] = useState(false);
  const [selectedResult, setSelectedResult] = useState<SearchResultGame | null>(
    null
  );
  const [hasSearched, setHasSearched] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const connected = useStatusStore((state) => state.connected);
  const { close, onSelect } = props;
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const systems = useQuery({
    queryKey: ["systems"],
    queryFn: () => CoreAPI.systems()
  });

  const gamesIndex = useStatusStore((state) => state.gamesIndex);

  // Manual search function
  const performSearch = () => {
    if (
      !connected ||
      !gamesIndex.exists ||
      gamesIndex.indexing ||
      query.trim().length < 2
    ) {
      return;
    }

    setIsSearching(true);
    setHasSearched(true);
  };

  // Handle system selection
  const handleSystemSelect = async (systemsArray: string[]) => {
    const newSystem = systemsArray.length === 1 ? systemsArray[0] : "all";
    setSelectedSystem(newSystem);
    await Preferences.set({ key: "searchSystem", value: newSystem });
  };

  useEffect(() => {
    if (selectedResult) {
      // Use zapScript if available, otherwise fall back to path
      const valueToInsert = selectedResult.zapScript || selectedResult.path;
      onSelect(valueToInsert);
      close();
      setSelectedResult(null);
    }
  }, [selectedResult, onSelect, close]);

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
              <SystemSelectorTrigger
                selectedSystems={
                  selectedSystem === "all" ? [] : [selectedSystem]
                }
                systemsData={systems.data}
                placeholder={t("create.search.allSystems")}
                mode="single"
                onClick={() => setSystemSelectorOpen(true)}
                className={classNames({
                  "opacity-50": !canSearch
                })}
              />
            </div>

            <Button
              label={t("create.search.searchButton")}
              icon={<SearchIcon size="20" />}
              onClick={performSearch}
              disabled={!canSearch || query.trim().length < 2 || isSearching}
              className="w-full"
            />
          </div>

          <div className="min-h-0 flex-1">
            <VirtualSearchResults
              query={hasSearched ? query : ""}
              systems={
                hasSearched
                  ? selectedSystem === "all"
                    ? []
                    : [selectedSystem]
                  : []
              }
              selectedResult={selectedResult}
              setSelectedResult={setSelectedResult}
              hasSearched={hasSearched}
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

      <SystemSelector
        isOpen={systemSelectorOpen}
        onClose={() => setSystemSelectorOpen(false)}
        onSelect={handleSystemSelect}
        selectedSystems={selectedSystem === "all" ? [] : [selectedSystem]}
        mode="single"
        title={t("create.search.selectSystem")}
        includeAllOption={false}
        defaultSelection="all"
      />
    </>
  );
}
