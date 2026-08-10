import toast from "react-hot-toast";
import { useTranslation } from "react-i18next";
import classNames from "classnames";
import { useStatusStore } from "@/lib/store";
import { Button } from "./wui/Button";

export const MediaIndexingToast = (props: {
  id: string;
  setHideToast: (hidden: boolean) => void;
}) => {
  const { t } = useTranslation();
  const gamesIndex = useStatusStore((state) => state.gamesIndex);
  return (
    <div className="flex grow flex-row items-center justify-between">
      <div className="flex grow flex-col pr-3">
        <button
          type="button"
          onClick={() => toast.dismiss(props.id)}
          className="rounded text-left focus-visible:ring-2 focus-visible:ring-white/50 focus-visible:outline-none"
        >
          <span className="block font-semibold">
            {t("toast.updateDbHeading")}
          </span>
          <span className="block text-sm">
            {gamesIndex.currentStepDisplay &&
            gamesIndex.currentStepDisplay !== ""
              ? gamesIndex.currentStepDisplay
              : t("toast.preparingDb")}
          </span>
        </button>
        <div
          role="progressbar"
          aria-valuenow={
            gamesIndex.currentStep && gamesIndex.totalSteps
              ? Math.round(
                  (gamesIndex.currentStep / gamesIndex.totalSteps) * 100,
                )
              : 0
          }
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={t("toast.indexingProgress")}
          className="border-bd-filled bg-background h-[10px] w-full rounded-full border border-solid"
        >
          <div
            className={classNames(
              "border-background bg-button-pattern h-[8px] rounded-full border border-solid",
              {
                hidden: gamesIndex.currentStep === 0,
                "animate-pulse":
                  gamesIndex.currentStep === 0 ||
                  gamesIndex.currentStep === gamesIndex.totalSteps,
              },
            )}
            style={{
              width:
                gamesIndex.currentStep && gamesIndex.totalSteps
                  ? `${((gamesIndex.currentStep / gamesIndex.totalSteps) * 100).toFixed(2)}%`
                  : "100%",
            }}
          ></div>
        </div>
      </div>
      <div>
        <Button
          label={t("toast.hideLabel")}
          variant="outline"
          onClick={() => {
            props.setHideToast(true);
            toast.dismiss(props.id);
          }}
          className="h-full w-4 text-sm"
        />
      </div>
    </div>
  );
};
