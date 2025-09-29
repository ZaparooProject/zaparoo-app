import { useTranslation } from "react-i18next";
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Preferences } from "@capacitor/preferences";
import { useStatusStore } from "@/lib/store.ts";
import { CoreAPI } from "@/lib/coreApi.ts";
import { SlideModal } from "@/components/SlideModal.tsx";
import { TextInput } from "@/components/wui/TextInput.tsx";
import { Button } from "@/components/wui/Button.tsx";
import { VirtualSearchResults } from "@/components/VirtualSearchResults.tsx";
import { SearchResultGame } from "@/lib/models.ts";
import { BackToTop } from "@/components/BackToTop.tsx";
import { SearchIcon } from "@/lib/images.tsx";

export function MediaSearchModal(props: {
  isOpen: boolean;
  close: () => void;
  onSelect: (path: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (props.isOpen) {
      // wait for modal animation to complete
      const timer = setTimeout(() => {
        inputRef.current?.focus();
      }, 300);

      return () => clearTimeout(timer);
    }
  }, [props.isOpen]);

  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [selectedSystem, setSelectedSystem] = useState<string>("all");
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
    if (!connected || !gamesIndex.exists || gamesIndex.indexing || query.trim().length < 2) {
      return;
    }

    setIsSearching(true);
    setHasSearched(true);
  };

  useEffect(() => {
    if (selectedResult) {
      onSelect(selectedResult.path);
      close();
      setSelectedResult(null);
    }
  }, [selectedResult, onSelect, close]);

  return (
    <SlideModal
      isOpen={props.isOpen}
      close={props.close}
      title={t("create.search.title")}
      scrollRef={scrollContainerRef}
    >
      <div className="relative">
        <div className="flex flex-col gap-1 p-1">
            <TextInput
              ref={inputRef}
              label={t("create.search.gameInput")}
              placeholder={t("create.search.gameInputPlaceholder")}
              value={query}
              setValue={setQuery}
              type="search"
              disabled={!connected || !gamesIndex.exists || gamesIndex.indexing}
              onKeyUp={(e) => {
                if (e.key === "Enter" || e.keyCode === 13) {
                  e.currentTarget.blur();
                  performSearch();
                }
              }}
            />

            <div className="flex flex-col">
              <label className="text-white">
                {t("create.search.systemInput")}
              </label>
              <select
                value={selectedSystem}
                onChange={(e) => {
                  setSelectedSystem(e.target.value);
                  Preferences.set({
                    key: "searchSystem",
                    value: e.target.value
                  });
                }}
                disabled={
                  !connected || !gamesIndex.exists || gamesIndex.indexing
                }
                className="rounded-md border border-solid border-bd-input bg-background p-3 text-foreground disabled:border-foreground-disabled"
              >
                <option value="all">{t("create.search.allSystems")}</option>
                {systems.isSuccess &&
                  systems.data.systems
                    .sort((a, b) => a.name.localeCompare(b.name))
                    .map((system) => (
                      <option key={system.id} value={system.id}>
                        {system.name}
                      </option>
                    ))}
              </select>
            </div>

            <Button
              label={t("create.search.searchButton")}
              icon={<SearchIcon size="20" />}
              onClick={performSearch}
              disabled={!connected || !gamesIndex.exists || gamesIndex.indexing || query.trim().length < 2 || isSearching}
              className="w-full"
            />
          </div>

          <VirtualSearchResults
            query={hasSearched ? query : ""}
            systems={hasSearched ? (selectedSystem === "all" ? [] : [selectedSystem]) : []}
            selectedResult={selectedResult}
            setSelectedResult={setSelectedResult}
            hasSearched={hasSearched}
            isSearching={isSearching}
            onSearchComplete={() => setIsSearching(false)}
          />
        </div>

        <BackToTop scrollContainerRef={scrollContainerRef} threshold={200} />
    </SlideModal>
  );
}
