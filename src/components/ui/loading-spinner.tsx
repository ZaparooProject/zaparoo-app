import * as React from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

interface LoadingSpinnerProps {
  className?: string;
  size?: number;
  decorative?: boolean;
}

export const LoadingSpinner = React.forwardRef<
  SVGSVGElement,
  LoadingSpinnerProps
>(({ className, size = 24, decorative = false }, ref) => {
  const { t } = useTranslation();
  return (
    <svg
      ref={ref}
      role={decorative ? undefined : "status"}
      aria-label={decorative ? undefined : t("loading")}
      aria-hidden={decorative || undefined}
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn("animate-spin", className)}
    >
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  );
});

LoadingSpinner.displayName = "LoadingSpinner";
