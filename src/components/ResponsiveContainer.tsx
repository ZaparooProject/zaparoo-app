import { ReactNode } from "react";
import classNames from "classnames";

interface ResponsiveContainerProps {
  children: ReactNode;
  className?: string;
  maxWidth?: "app" | "nav" | "full";
}

export function ResponsiveContainer({
  children,
  className,
  maxWidth = "app"
}: ResponsiveContainerProps) {
  return (
    <div
      className={classNames(
        "w-full",
        {
          "sm:max-w-2xl sm:mx-auto": maxWidth === "app",    // 672px max-width on 640px+ screens
          "sm:max-w-lg sm:mx-auto": maxWidth === "nav",     // 512px max-width on 640px+ screens
          // "full" uses no max-width constraints
        },
        className
      )}
    >
      {children}
    </div>
  );
}