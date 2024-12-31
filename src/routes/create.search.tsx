import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { CoreAPI } from "../lib/coreApi.ts";
import {
  CreateIcon,
  NextIcon,
  PlayIcon,
  SearchIcon,
  SettingsIcon,
  WarningIcon
} from "../lib/images";
import { useNfcWriter, WriteAction } from "../lib/writeNfcHook";
import { SearchResultGame, SearchResultsResponse } from "../lib/models";
import { SlideModal } from "../components/SlideModal";
import { Button } from "../components/wui/Button";
import { useSwipeable } from "react-swipeable";
import { useStatusStore } from "../lib/store";
import { TextInput } from "../components/wui/TextInput";
import { Card } from "../components/wui/Card";
import { WriteModal } from "../components/WriteModal";
import { PageFrame } from "../components/PageFrame";
import { useTranslation } from "react-i18next";
import { Preferences } from "@capacitor/preferences";

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

function SearchResults(props: {
  loading: boolean;
  error: boolean;
  resp: SearchResultsResponse | null;
  selectedResult: SearchResultGame | null;
  setSelectedResult: (game: SearchResultGame | null) => void;
}) {
  const gamesIndex = useStatusStore((state) => state.gamesIndex);

  const { t } = useTranslation();

  if (!gamesIndex.exists) {
    return (
      <Card className="mt-3">
        <div className="flex flex-row items-center justify-between gap-3">
          <div className="px-1.5 text-error">
            <WarningIcon size="24" />
          </div>
          <div className="flex flex-grow flex-col">
            <span className="font-medium">
              {t("create.search.gamesDbUpdate")}
            </span>
          </div>
          <Link
            to="/settings"
            search={{
              focus: "database"
            }}
          >
            <Button icon={<SettingsIcon size="24" />} variant="text" />
          </Link>
        </div>
      </Card>
    );
  }

  if (props.loading) {
    return (
      <div className="flex flex-col items-center justify-center pt-3">
        <div className="text-primary">
          <div className="lds-facebook">
            <div></div>
            <div></div>
            <div></div>
          </div>
        </div>
      </div>
    );
  }

  if (props.error) {
    return <p className="pt-2 text-center">{t("create.search.searchError")}</p>;
  }

  if (!props.resp) {
    return <></>;
  }

  if (props.resp.total === 0) {
    return (
      <p className="pt-2 text-center">{t("create.search.noGamesFound")}</p>
    );
  }

  if (props.resp.total > 0) {
    return (
      <>
        <p className="pt-2 text-center">
          {props.resp.total > props.resp.results.length
            ? t("create.search.gamesFoundMax", {
                count: props.resp.total,
                max: props.resp.results.length
              })
            : t("create.search.gamesFound", { count: props.resp.total })}
        </p>
        <div>
          {props.resp.results.map((game, i) => (
            <div
              key={i}
              className="flex flex-row items-center justify-between gap-1 p-1 py-3"
              style={{
                borderBottom:
                  i === (props.resp ? props.resp.results.length : 0) - 1
                    ? ""
                    : "1px solid rgba(255,255,255,0.6)"
              }}
              onClick={(e) => {
                e.preventDefault();
                if (
                  props.selectedResult &&
                  props.selectedResult.path === game.path
                ) {
                  props.setSelectedResult(null);
                } else if (
                  props.selectedResult &&
                  props.selectedResult.path !== game.path
                ) {
                  props.setSelectedResult(null);
                  setTimeout(() => {
                    props.setSelectedResult(game);
                  }, 150);
                } else {
                  props.setSelectedResult(game);
                }
              }}
            >
              <div className="flex flex-col">
                <p className="font-semibold">{game.name}</p>
                <p className="text-sm">{game.system.name}</p>
              </div>
              <div>
                <NextIcon size="20" />
              </div>
            </div>
          ))}
        </div>
      </>
    );
  }
}

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
    CoreAPI.status().then((s) => {
      setGamesIndex(s.gamesIndex);
    });
  }, [setGamesIndex]);

  const navigate = useNavigate();
  const swipeHandlers = useSwipeable({
    onSwipedRight: () => navigate({ to: "/create" })
  });

  return (
    <>
      <div {...swipeHandlers}>
        <PageFrame
          title={t("create.search.title")}
          back={() => navigate({ to: "/create" })}
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
              className="rounded-md border border-solid border-bd-input bg-background p-3 text-foreground disabled:border-foreground-disabled"
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
            {t("create.search.pathLabel")} {selectedResult?.path}
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
              className="flex-grow"
            />
            <Button
              label={t("create.search.playLabel")}
              icon={<PlayIcon size="20" />}
              variant="outline"
              disabled={!selectedResult || !connected}
              onClick={() => {
                if (selectedResult) {
                  CoreAPI.launch({
                    uid: "",
                    text: selectedResult.path
                  });
                }
              }}
            />
          </div>
        </div>
      </SlideModal>
      <WriteModal isOpen={writeOpen} close={closeWriteModal} />
    </>
  );
}
