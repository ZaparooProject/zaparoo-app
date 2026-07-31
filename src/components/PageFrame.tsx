import React, { RefObject, ReactNode, useLayoutEffect, useRef } from "react";
import { useElementScrollRestoration, useRouter } from "@tanstack/react-router";
import { ResponsiveContainer } from "@/components/ResponsiveContainer";
import { useStatusStore } from "@/lib/store";

export const PAGE_SCROLL_RESTORATION_ID = "page-scroll";
export const PAGE_SCROLL_RESTORATION_SELECTOR = `[data-scroll-restoration-id="${PAGE_SCROLL_RESTORATION_ID}"]`;

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

interface PageFrameLayoutProps extends PageFrameProps {
  restorationEntry?: {
    scrollX: number;
    scrollY: number;
  };
}

export function PageFrame(props: PageFrameProps) {
  const router = useRouter({ warn: false });
  const scrollRestorationEnabled = Boolean(router?.options?.scrollRestoration);

  return scrollRestorationEnabled ? (
    <RoutedPageFrame {...props} />
  ) : (
    <PageFrameLayout {...props} />
  );
}

function RoutedPageFrame(props: PageFrameProps) {
  const restorationEntry = useElementScrollRestoration({
    id: PAGE_SCROLL_RESTORATION_ID,
  });

  return <PageFrameLayout {...props} restorationEntry={restorationEntry} />;
}

function PageFrameLayout(props: PageFrameLayoutProps) {
  const safeInsets = useStatusStore((state) => state.safeInsets);
  const internalScrollRef = useRef<HTMLDivElement>(null);
  const hasRestoredScroll = useRef(false);

  // Destructure known props and collect the rest
  const {
    children,
    header,
    headerLeft,
    headerCenter,
    headerRight,
    scrollRef,
    restorationEntry,
    className,
    ...restProps
  } = props;

  const activeScrollRef = scrollRef ?? internalScrollRef;
  const hasHeaderContent = header || headerLeft || headerCenter || headerRight;

  useLayoutEffect(() => {
    const scrollContainer = activeScrollRef.current;
    if (!scrollContainer || !restorationEntry || hasRestoredScroll.current) {
      return;
    }

    // Restore only on mount. Reapplying the router's original entry during
    // ordinary state updates would snap an actively used page back to the top.
    scrollContainer.scrollLeft = restorationEntry.scrollX;
    scrollContainer.scrollTop = restorationEntry.scrollY;
    hasRestoredScroll.current = true;
  }, [activeScrollRef, restorationEntry]);

  return (
    <div
      className={`flex h-full w-full flex-col ${className || ""}`}
      {...restProps}
    >
      <div
        className="bg-background sticky top-0 z-10"
        style={{
          paddingTop: `calc(1rem + ${safeInsets.top})`,
          paddingRight: `calc(1rem + ${safeInsets.right})`,
          paddingLeft: `calc(1rem + ${safeInsets.left})`,
          paddingBottom: hasHeaderContent ? "1rem" : 0,
        }}
      >
        {hasHeaderContent && (
          <ResponsiveContainer>
            {header ? (
              header
            ) : (
              <div className="grid min-h-8 grid-cols-5 items-center justify-center gap-4">
                <div className="col-span-1 flex">{headerLeft}</div>
                <div className="col-span-3 flex items-center justify-center text-center">
                  {headerCenter}
                </div>
                <div className="col-span-1 flex justify-end">{headerRight}</div>
              </div>
            )}
          </ResponsiveContainer>
        )}
      </div>
      <div
        ref={activeScrollRef}
        data-scroll-restoration-id={PAGE_SCROLL_RESTORATION_ID}
        className="flex-1 overflow-y-auto pb-4"
        style={{
          paddingRight: `calc(1rem + ${safeInsets.right})`,
          paddingLeft: `calc(1rem + ${safeInsets.left})`,
        }}
      >
        <ResponsiveContainer>{children}</ResponsiveContainer>
      </div>
    </div>
  );
}
