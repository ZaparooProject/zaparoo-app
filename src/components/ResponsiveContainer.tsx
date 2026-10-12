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
  maxWidth = "app",
}: ResponsiveContainerProps) {
  return (
    <div
      className={classNames(
        "w-full",
        {
          // 672px max-width on 640px+ screens; from 1024px it starts at the left
          // edge so every page's title sits in the same place beside the sidebar.
          "sm:mx-auto sm:max-w-2xl lg:mx-0": maxWidth === "app",
          "sm:mx-auto sm:max-w-lg": maxWidth === "nav", // 512px max-width on 640px+ screens
          // "full" uses no max-width constraints
        },
        className,
      )}
    >
      {children}
    </div>
  );
}
