import { RefObject, ReactNode } from "react";
import { BackIcon } from "../lib/images";
import { ResponsiveContainer } from "./ResponsiveContainer";

interface PageFrameProps {
  children: ReactNode;
  /** Full custom header that replaces the default header structure */
  header?: ReactNode;
  /** Content for the left side of the header (e.g., back button) */
  headerLeft?: ReactNode;
  /** Content for the center of the header (e.g., title) */
  headerCenter?: ReactNode;
  /** Content for the right side of the header (e.g., action buttons) */
  headerRight?: ReactNode;
  /** @deprecated Use headerCenter instead */
  title?: string;
  /** @deprecated Use headerLeft instead */
  back?: () => void;
  scrollRef?: RefObject<HTMLDivElement | null>;
}

export function PageFrame(props: PageFrameProps) {

  // Support backwards compatibility with deprecated props
  const headerLeft = props.headerLeft || (props.back && (
    <button onClick={props.back} className="cursor-pointer">
      <BackIcon size="24" />
    </button>
  ));

  const headerCenter = props.headerCenter || (props.title && (
    <h1 className="text-foreground text-xl">{props.title}</h1>
  ));

  const hasHeaderContent = props.header || headerLeft || headerCenter || props.headerRight;

  return (
    <div className="flex h-full w-full flex-col">
      {hasHeaderContent && (
        <div className="bg-background sticky top-0 z-10 pt-safe-top-4 p-4 pr-safe-right-4 pl-safe-left-4">
          <ResponsiveContainer>
            {props.header ? (
              props.header
            ) : (
              <div className="grid min-h-8 grid-cols-5 items-center justify-center gap-4">
                <div className="col-span-1 flex">
                  {headerLeft}
                </div>
                <div className="col-span-3 flex items-center justify-center text-center">
                  {headerCenter}
                </div>
                <div className="col-span-1 flex justify-end">
                  {props.headerRight}
                </div>
              </div>
            )}
          </ResponsiveContainer>
        </div>
      )}
      <div
        ref={props.scrollRef}
        className={`flex-1 overflow-y-auto ${hasHeaderContent ? 'px-4 pb-4' : 'p-4'} pr-safe-right-4 pl-safe-left-4 pb-safe-bottom-4`}
      >
        <ResponsiveContainer>
          {props.children}
        </ResponsiveContainer>
      </div>
    </div>
  );
}
