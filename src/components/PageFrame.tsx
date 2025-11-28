import React, { RefObject, ReactNode } from "react";
import { ResponsiveContainer } from "./ResponsiveContainer";

interface PageFrameProps extends React.HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  /** Full custom header that replaces the default header structure */
  header?: ReactNode;
  /** Content for the left side of the header (e.g., back button) */
  headerLeft?: ReactNode;
  /** Content for the center of the header (e.g., title) */
  headerCenter?: ReactNode;
  /** Content for the right side of the header (e.g., action buttons) */
  headerRight?: ReactNode;
  scrollRef?: RefObject<HTMLDivElement | null>;
}

export function PageFrame(props: PageFrameProps) {
  // Destructure known props and collect the rest
  const {
    children,
    header,
    headerLeft,
    headerCenter,
    headerRight,
    scrollRef,
    className,
    ...restProps
  } = props;

  const hasHeaderContent = header || headerLeft || headerCenter || headerRight;

  return (
    <div
      className={`flex h-full w-full flex-col ${className || ''}`}
      {...restProps}
    >
      {hasHeaderContent && (
        <div className="bg-background sticky top-0 z-10 pt-safe-top-4 p-4 pr-safe-right-4 pl-safe-left-4">
          <ResponsiveContainer>
            {header ? (
              header
            ) : (
              <div className="grid min-h-8 grid-cols-5 items-center justify-center gap-4">
                <div className="col-span-1 flex">
                  {headerLeft}
                </div>
                <div className="col-span-3 flex items-center justify-center text-center">
                  {headerCenter}
                </div>
                <div className="col-span-1 flex justify-end">
                  {headerRight}
                </div>
              </div>
            )}
          </ResponsiveContainer>
        </div>
      )}
      <div
        ref={scrollRef}
        className={`flex-1 overflow-y-auto ${hasHeaderContent ? 'px-4 pb-4' : 'p-4'} pr-safe-right-4 pl-safe-left-4 pb-safe-bottom-4`}
      >
        <ResponsiveContainer>
          {children}
        </ResponsiveContainer>
      </div>
    </div>
  );
}
