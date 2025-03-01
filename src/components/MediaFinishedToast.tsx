import { useStatusStore } from "@/lib/store";
import toast from "react-hot-toast";
import { useTranslation } from "react-i18next";

export const MediaFinishedToast = (props: { id: string }) => {
  const { t } = useTranslation();
  const gamesIndex = useStatusStore((state) => state.gamesIndex);
  return (
    <div
      className="flex flex-grow flex-col"
      onClick={() => toast.dismiss(props.id)}
    >
      <div className="font-semibold">{t("toast.updatedDb")}</div>
      <div className="text-sm">
        {t("toast.filesFound", { count: gamesIndex.totalFiles })}
      </div>
    </div>
  );
};
