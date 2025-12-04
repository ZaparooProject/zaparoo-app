import { useTranslation } from "react-i18next";

interface ProBadgeProps {
  onPress?: () => void;
  show?: boolean;
}

export const ProBadge = ({ onPress, show = true }: ProBadgeProps) => {
  const { t } = useTranslation();

  if (!show) return null;

  const badge = (
    <span className="ml-2 inline-flex items-center rounded-full bg-amber-500/20 px-2 py-0.5 text-xs font-medium text-amber-300">
      {t("settings.app.proFeature")}
    </span>
  );

  if (onPress) {
    return (
      <button
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onPress();
        }}
        type="button"
        className="inline-flex items-center"
      >
        {badge}
      </button>
    );
  }

  return badge;
};
