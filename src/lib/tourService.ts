import Shepherd from "shepherd.js";
import type { NavigateOptions } from "@tanstack/react-router";
import type { TFunction } from "i18next";

export interface TourNavigate {
  (opts: NavigateOptions): Promise<void>;
}

/**
 * Creates the Zaparoo app onboarding tour
 *
 * A quick 4-5 step passive guidance tour that introduces first-time users to:
 * - Connecting to Zaparoo Core
 * - Updating the media database
 * - Creating cards
 */
export const createAppTour = (
  navigate: TourNavigate,
  t: TFunction,
  connected: boolean,
) => {
  const TOTAL_STEPS = connected ? 4 : 5;

  // Helper to format text with step indicator and progress bar
  const formatText = (step: number, text: string) => {
    const indicator = t("tour.stepIndicator", {
      current: step,
      total: TOTAL_STEPS,
    });
    const progress = (step / TOTAL_STEPS) * 100;
    return `
      <div style="display: flex; align-items: center; gap: 0.75rem; margin-bottom: 0.75rem;">
        <div style="flex: 1; height: 2px; background: rgba(255, 255, 255, 0.2); border-radius: 1px; overflow: hidden;">
          <div style="height: 100%; width: ${progress}%; background: hsl(0 0% 100%); transition: width 0.3s ease;"></div>
        </div>
        <span style="font-size: 0.75rem; font-weight: 600; color: hsl(0 0% 100%); flex-shrink: 0;">${indicator}</span>
      </div>
      ${text}
    `;
  };

  const tour = new Shepherd.Tour({
    useModalOverlay: true,
    defaultStepOptions: {
      cancelIcon: { enabled: true },
      classes: "zaparoo-tour-step",
      scrollTo: { behavior: "smooth", block: "center" },
    },
  });

  // Step 1: Welcome
  tour.addStep({
    id: "welcome",
    title: t("tour.welcome.title"),
    text: formatText(1, t("tour.welcome.text")),
    buttons: [
      {
        text: t("tour.buttons.skip"),
        action: tour.cancel,
        secondary: true,
      },
      {
        text: t("tour.buttons.getStarted"),
        action: tour.next,
      },
    ],
  });

  // Step 2: Device Address (only if not connected)
  if (!connected) {
    tour.addStep({
      id: "device-address",
      title: t("tour.deviceAddress.title"),
      text: formatText(2, t("tour.deviceAddress.text")),
      attachTo: {
        element: '[data-tour="device-address"]',
        on: "bottom",
      },
      beforeShowPromise: function () {
        return new Promise((resolve) => {
          navigate({ to: "/settings" }).then(() => {
            // Small delay to ensure DOM is ready
            setTimeout(resolve, 300);
          });
        });
      },
      buttons: [
        {
          text: t("tour.buttons.back"),
          action: () => {
            tour.hide();
            navigate({ to: "/" }).then(() => {
              setTimeout(() => tour.back(), 300);
            });
          },
          secondary: true,
        },
        {
          text: t("tour.buttons.next"),
          action: tour.next,
        },
      ],
    });
  }

  // Step 3 (or 2 if connected): Media Database Update
  tour.addStep({
    id: "media-database",
    title: t("tour.mediaDatabase.title"),
    text: formatText(connected ? 2 : 3, t("tour.mediaDatabase.text")),
    attachTo: {
      element: '[data-tour="update-database"]',
      on: "top",
    },
    beforeShowPromise: connected
      ? function () {
          return new Promise((resolve) => {
            navigate({ to: "/settings" }).then(() => {
              setTimeout(resolve, 300);
            });
          });
        }
      : undefined,
    buttons: [
      {
        text: t("tour.buttons.back"),
        action: connected
          ? () => {
              tour.hide();
              navigate({ to: "/" }).then(() => {
                setTimeout(() => tour.back(), 300);
              });
            }
          : tour.back,
        secondary: true,
      },
      {
        text: t("tour.buttons.next"),
        action: tour.next,
      },
    ],
  });

  // Step 4 (or 3 if connected): Card Creation/Search
  tour.addStep({
    id: "create-cards",
    title: t("tour.createCards.title"),
    text: formatText(connected ? 3 : 4, t("tour.createCards.text")),
    attachTo: {
      element: '[data-tour="create-search"]',
      on: "bottom",
    },
    beforeShowPromise: function () {
      return new Promise((resolve) => {
        navigate({ to: "/create" }).then(() => {
          setTimeout(resolve, 300);
        });
      });
    },
    buttons: [
      {
        text: t("tour.buttons.back"),
        action: () => {
          tour.hide();
          navigate({ to: "/settings" }).then(() => {
            setTimeout(() => tour.back(), 300);
          });
        },
        secondary: true,
      },
      {
        text: t("tour.buttons.next"),
        action: tour.next,
      },
    ],
  });

  // Step 5 (or 4 if connected): Complete - Navigate back to home
  tour.addStep({
    id: "complete",
    title: t("tour.complete.title"),
    text: formatText(connected ? 4 : 5, t("tour.complete.text")),
    beforeShowPromise: function () {
      return new Promise((resolve) => {
        navigate({ to: "/" }).then(() => {
          setTimeout(resolve, 300);
        });
      });
    },
    buttons: [
      {
        text: t("tour.buttons.finish"),
        action: tour.complete,
      },
    ],
  });

  return tour;
};
