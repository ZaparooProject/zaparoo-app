import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { CoreAPI } from "../lib/coreApi.ts";
import { CreateIcon, PlayIcon, SearchIcon } from "../lib/images";
import { useNfcWriter, WriteAction } from "../lib/writeNfcHook";
import { SearchResultGame } from "../lib/models";
import { SlideModal } from "../components/SlideModal";
import { Button } from "../components/wui/Button";
import { useSmartSwipe } from "../hooks/useSmartSwipe";
import { useStatusStore } from "../lib/store";
import { TextInput } from "../components/wui/TextInput";
import { WriteModal } from "../components/WriteModal";
import { PageFrame } from "../components/PageFrame";
import { useTranslation } from "react-i18next";
import { Preferences } from "@capacitor/preferences";
import { SearchResults } from "@/components/SearchResults.tsx";
import { CopyButton } from "@/components/CopyButton.tsx";
import { BackToTop } from "@/components/BackToTop.tsx";

const initData = {
  systemQuery: "all"
};

export const Route = createFileRoute("/create/search")({
  loader: async () => {
    initData.systemQuery =
      (await Preferences.get({ key: "searchSystem" })).value || "all";
  },
  component: Search
});

interface SearchParams {
  query: string;
  system: string;
}

function Search() {
  const gamesIndex = useStatusStore((state) => state.gamesIndex);
  const setGamesIndex = useStatusStore((state) => state.setGamesIndex);
  const connected = useStatusStore((state) => state.connected);

  const [querySystem, setQuerySystem] = useState(initData.systemQuery);
  const [query, setQuery] = useState("");

  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const search = useMutation({
    mutationFn: (sp: SearchParams) =>
      CoreAPI.mediaSearch({
        query: sp.query,
        systems: sp.system == "all" ? [] : [sp.system]
      })
  });

  const systems = useQuery({
    queryKey: ["systems"],
    queryFn: () => CoreAPI.systems()
  });

  const [selectedResult, setSelectedResult] = useState<SearchResultGame | null>(
    null
  );

  const nfcWriter = useNfcWriter();
  const [writeOpen, setWriteOpen] = useState(false);
  const closeWriteModal = () => {
    setWriteOpen(false);
    nfcWriter.end();
  };

  const { t } = useTranslation();

  useEffect(() => {
    if (nfcWriter.status !== null) {
      setWriteOpen(false);
      nfcWriter.end();
    }
  }, [nfcWriter]);

  useEffect(() => {
    CoreAPI.media().then((s) => {
      setGamesIndex(s.database);
    });
  }, [setGamesIndex]);

  const navigate = useNavigate();
  const swipeHandlers = useSmartSwipe({
    onSwipeRight: () => navigate({ to: "/create" }),
    preventScrollOnSwipe: false
  });

  return (
    <>
      <div {...swipeHandlers} className="h-full w-full overflow-y-auto">
        <PageFrame
          title={t("create.search.title")}
          back={() => navigate({ to: "/create" })}
          scrollRef={scrollContainerRef}
        >
          <TextInput
            label={t("create.search.gameInput")}
            placeholder={t("create.search.gameInputPlaceholder")}
            value={query}
            setValue={(v) => setQuery(v)}
            type="search"
            disabled={!connected || !gamesIndex.exists || gamesIndex.indexing}
            onKeyUp={(e) => {
              if (e.key === "Enter" || e.keyCode === 13) {
                e.currentTarget.blur();
              }
            }}
          />

          <div className="flex flex-col">
            <label className="text-white">
              {t("create.search.systemInput")}
            </label>
            <select
              value={querySystem}
              onChange={(e) => {
                setSelectedResult(null);
                setQuerySystem(e.target.value);
                Preferences.set({ key: "searchSystem", value: e.target.value });
              }}
              disabled={!connected || !gamesIndex.exists || gamesIndex.indexing}
              className="border-bd-input bg-background text-foreground disabled:border-foreground-disabled rounded-md border border-solid p-3"
            >
              <option value="all">{t("create.search.allSystems")}</option>
              {systems.isSuccess &&
                systems.data.systems
                  .sort((a, b) => a.name.localeCompare(b.name))
                  .map((system, i) => (
                    <option key={i} value={system.id}>
                      {system.name}
                    </option>
                  ))}
            </select>

            <Button
              label={t("create.search.searchButton")}
              className="mt-2 w-full"
              icon={<SearchIcon size="20" />}
              disabled={query === "" && querySystem === "all"}
              onClick={() => {
                console.log(query, querySystem);
                search.mutate({
                  query: query,
                  system: querySystem
                });
              }}
            />
          </div>

          <SearchResults
            loading={search.isPending}
            error={search.isError}
            resp={search.isSuccess ? search.data : null}
            setSelectedResult={setSelectedResult}
            selectedResult={selectedResult}
          />
        </PageFrame>
      </div>
      <SlideModal
        isOpen={selectedResult !== null && !writeOpen}
        close={() => setSelectedResult(null)}
        title={selectedResult?.name || "Game Details"}
      >
        <div className="flex flex-col gap-3 pt-2">
          <p>
            {t("create.search.systemLabel")} {selectedResult?.system.name}
          </p>
          <p>
            {t("create.search.pathLabel")} {selectedResult?.path}{" "}
            {selectedResult?.path !== "" && (
              <CopyButton text={selectedResult?.path ?? ""} />
            )}
          </p>
          <div className="flex flex-row gap-2 pt-1">
            <Button
              label={t("create.search.writeLabel")}
              icon={<CreateIcon size="20" />}
              disabled={!selectedResult}
              onClick={() => {
                if (selectedResult) {
                  nfcWriter.write(WriteAction.Write, selectedResult.path);
                  setWriteOpen(true);
                }
              }}
              className="grow"
            />
            <Button
              label={t("create.search.playLabel")}
              icon={<PlayIcon size="20" />}
              variant="outline"
              disabled={!selectedResult || !connected}
              onClick={() => {
                if (selectedResult) {
                  CoreAPI.run({
                    uid: "",
                    text: selectedResult.path
                  });
                }
              }}
            />
          </div>
        </div>
      </SlideModal>
      <BackToTop
        scrollContainerRef={scrollContainerRef}
        threshold={200}
        paddingBottom="5em"
      />
      <WriteModal isOpen={writeOpen} close={closeWriteModal} />
    </>
  );
}
