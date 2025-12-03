import { useEffect } from "react";
import { Preferences } from "@capacitor/preferences";
import { useShallow } from "zustand/react/shallow";
import { IndexResponse, TokenResponse, PlayingResponse } from "@/lib/models";
import { useStatusStore } from "@/lib/store";
import { logger } from "@/lib/logger";

export function useDataCache(): void {
  const { setGamesIndex, setLastToken, setPlaying } = useStatusStore(
    useShallow((state) => ({
      setGamesIndex: state.setGamesIndex,
      setLastToken: state.setLastToken,
      setPlaying: state.setPlaying,
    })),
  );

  useEffect(() => {
    const loadCachedData = async () => {
      try {
        const gamesIndexResult = await Preferences.get({
          key: "cached_gamesIndex",
        });
        if (gamesIndexResult.value) {
          setGamesIndex(JSON.parse(gamesIndexResult.value) as IndexResponse);
        }

        const lastTokenResult = await Preferences.get({
          key: "cached_lastToken",
        });
        if (lastTokenResult.value) {
          setLastToken(JSON.parse(lastTokenResult.value) as TokenResponse);
        }

        const playingResult = await Preferences.get({ key: "cached_playing" });
        if (playingResult.value) {
          setPlaying(JSON.parse(playingResult.value) as PlayingResponse);
        }

        // Note: lastConnection is not stored in Zustand store, so we skip it
      } catch (error) {
        logger.error("Failed to load cached data:", error, {
          category: "storage",
          action: "get",
          key: "cached_data",
          severity: "warning",
        });
      }
    };
    void loadCachedData();
  }, [setGamesIndex, setLastToken, setPlaying]);
}
