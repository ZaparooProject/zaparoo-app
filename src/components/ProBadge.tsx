import { useTranslation } from "react-i18next";

export const ProBadge = () => {
  const { t } = useTranslation();
  return (
    <span className="ml-2 inline-flex items-center rounded-full bg-amber-500/20 px-2 py-0.5 text-xs font-medium text-amber-400">
      {t("settings.app.proFeature")}
    </span>
  );
};
