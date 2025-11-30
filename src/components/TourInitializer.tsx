import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { usePreferencesStore } from "@/lib/preferencesStore";
import { useStatusStore } from "@/lib/store";
import { createAppTour } from "@/lib/tourService";

export function TourInitializer() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const tourCompleted = usePreferencesStore((state) => state.tourCompleted);
  const setTourCompleted = usePreferencesStore(
    (state) => state.setTourCompleted,
  );

  useEffect(() => {
    // Only start tour if not completed and after a delay for DOM readiness
    if (!tourCompleted) {
      const timer = setTimeout(() => {
        // Check connection state right before starting tour (after 1s delay)
        const isConnected = useStatusStore.getState().connected;
        const tour = createAppTour(navigate, t, isConnected);

        // Mark as completed when tour finishes or is cancelled
        tour.on("complete", () => {
          setTourCompleted(true);
        });

        tour.on("cancel", () => {
          setTourCompleted(true);
        });

        tour.start();
      }, 1000);

      return () => clearTimeout(timer);
    }
  }, [tourCompleted, navigate, setTourCompleted, t]);

  return null;
}
