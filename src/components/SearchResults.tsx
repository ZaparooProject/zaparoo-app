import { useTranslation } from "react-i18next";
import { Link } from "@tanstack/react-router";
import { SearchResultGame, SearchResultsResponse } from "@/lib/models.ts";
import { useStatusStore } from "@/lib/store.ts";
import { Card } from "@/components/wui/Card.tsx";
import { NextIcon, SettingsIcon, WarningIcon } from "@/lib/images.tsx";
import { Button } from "@/components/wui/Button.tsx";

export function SearchResults(props: {
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
          <div className="flex grow flex-col">
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
          {props.resp.results.map((game, i) => {
            const handleGameSelect = () => {
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
            };

            return (
              <div
                key={i}
                className="flex cursor-pointer flex-row items-center justify-between gap-1 p-1 py-3"
                style={{
                  borderBottom:
                    i === (props.resp ? props.resp.results.length : 0) - 1
                      ? ""
                      : "1px solid rgba(255,255,255,0.6)"
                }}
                role="button"
                tabIndex={0}
                onClick={(e) => {
                  e.preventDefault();
                  handleGameSelect();
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleGameSelect();
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
            );
          })}
        </div>
      </>
    );
  }
}
