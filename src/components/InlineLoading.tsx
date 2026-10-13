import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { LoadingSpinner } from "@/components/ui/loading-spinner";

interface InlineLoadingProps {
  /** Specific status text; defaults to the generic loading label. */
  label?: string;
  className?: string;
}

/** The single centered spinner-and-text row for pending lists and panels. */
export function InlineLoading({ label, className }: InlineLoadingProps) {
  const { t } = useTranslation();
  return (
    <div
      className={cn(
        "text-muted-foreground flex items-center justify-center gap-2 py-8",
        className,
      )}
      role="status"
    >
      <LoadingSpinner size={16} decorative />
      <span>{label ?? t("loading")}</span>
    </div>
  );
}
