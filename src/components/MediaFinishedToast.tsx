import toast from "react-hot-toast";
import { useTranslation } from "react-i18next";
import { useStatusStore } from "@/lib/store";
import { useHaptics } from "@/hooks/useHaptics";

export const MediaFinishedToast = (props: { id: string }) => {
  const { t } = useTranslation();
  const gamesIndex = useStatusStore((state) => state.gamesIndex);
  const { notification } = useHaptics();
  return (
    <button
      type="button"
      className="flex grow cursor-pointer flex-col text-left focus-visible:ring-2 focus-visible:ring-white/50 focus-visible:outline-none"
      onClick={() => {
        notification("success");
        toast.dismiss(props.id);
      }}
    >
      <div className="font-semibold">{t("toast.updatedDb")}</div>
      <div className="text-sm">
        {t("toast.filesFound", { count: gamesIndex.totalFiles })}
      </div>
    </button>
  );
};
