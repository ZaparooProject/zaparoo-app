import { useTranslation } from "react-i18next";
import { Badge } from "@/components/wui/Badge";

interface ProBadgeProps {
  onPress?: () => void;
  show?: boolean;
}

export const ProBadge = ({ onPress, show = true }: ProBadgeProps) => {
  const { t } = useTranslation();

  if (!show) return null;

  const badge = (
    <Badge variant="pro" className="ml-2">
      {t("settings.app.proFeature")}
    </Badge>
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
