import { useStatusStore } from "@/lib/store";
import toast from "react-hot-toast";
import { useTranslation } from "react-i18next";
import classNames from "classnames";
import { Button } from "./wui/Button";

export const MediaIndexingToast = (props: {
  id: string;
  setHideToast: (hidden: boolean) => void;
}) => {
  const { t } = useTranslation();
  const gamesIndex = useStatusStore((state) => state.gamesIndex);
  return (
    <div
      className="flex flex-grow flex-row items-center justify-between"
      onClick={() => toast.dismiss(props.id)}
    >
      <div className="flex flex-grow flex-col pr-3">
        <div className="font-semibold">{t("toast.updateDbHeading")}</div>
        <div className="text-sm">
          {gamesIndex.currentStepDisplay
            ? gamesIndex.currentStep === gamesIndex.totalSteps
              ? t("toast.writingDb")
              : gamesIndex.currentStepDisplay
            : t("toast.preparingDb")}
        </div>
        <div className="h-[10px] w-full rounded-full border border-solid border-bd-filled bg-background">
          <div
            className={classNames(
              "h-[8px] rounded-full border border-solid border-background bg-button-pattern",
              {
                hidden: gamesIndex.currentStep === 0,
                "animate-pulse":
                  gamesIndex.currentStep === 0 ||
                  gamesIndex.currentStep === gamesIndex.totalSteps
              }
            )}
            style={{
              width:
                gamesIndex.currentStep && gamesIndex.totalSteps
                  ? `${((gamesIndex.currentStep / gamesIndex.totalSteps) * 100).toFixed(2)}%`
                  : "100%"
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
