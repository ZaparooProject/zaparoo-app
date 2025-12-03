import toast from "react-hot-toast";
import { useTranslation } from "react-i18next";
import { useStatusStore } from "@/lib/store";
import { useHaptics } from "@/hooks/useHaptics";

export const MediaFinishedToast = (props: { id: string }) => {
  const { t } = useTranslation();
  const gamesIndex = useStatusStore((state) => state.gamesIndex);
  const { notification } = useHaptics();
  return (
    <div
      className="flex grow cursor-pointer flex-col"
      onClick={() => {
        notification("success");
        toast.dismiss(props.id);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          notification("success");
          toast.dismiss(props.id);
        }
      }}
      role="button"
      tabIndex={0}
    >
      <div className="font-semibold">{t("toast.updatedDb")}</div>
      <div className="text-sm">
        {t("toast.filesFound", { count: gamesIndex.totalFiles })}
      </div>
    </div>
  );
};
