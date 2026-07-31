import React, { RefObject, ReactNode, useLayoutEffect, useRef } from "react";
import {
  useElementScrollRestoration,
  useRouter,
  useRouterState,
} from "@tanstack/react-router";
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
  restorationKey?: string;
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
  const restorationKey = useRouterState({
    select: (state) =>
      state.location.state.__TSR_key || state.location.href || "",
  });

  return (
    <PageFrameLayout
      {...props}
      restorationEntry={restorationEntry}
      restorationKey={restorationKey}
    />
  );
}

function PageFrameLayout(props: PageFrameLayoutProps) {
  const safeInsets = useStatusStore((state) => state.safeInsets);
  const internalScrollRef = useRef<HTMLDivElement>(null);
  const hasRestoredScroll = useRef(false);
  const restoredEntryKey = useRef<string | undefined>(undefined);

  // Destructure known props and collect the rest
  const {
    children,
    header,
    headerLeft,
    headerCenter,
    headerRight,
    scrollRef,
    restorationEntry,
    restorationKey,
    className,
    ...restProps
  } = props;

  const activeScrollRef = scrollRef ?? internalScrollRef;
  const hasHeaderContent = header || headerLeft || headerCenter || headerRight;

  useLayoutEffect(() => {
    if (restoredEntryKey.current !== restorationKey) {
      restoredEntryKey.current = restorationKey;
      hasRestoredScroll.current = false;
    }

    const scrollContainer = activeScrollRef.current;
    if (!scrollContainer || !restorationEntry || hasRestoredScroll.current) {
      return;
    }

    // Restore once per history entry. Ordinary state updates keep the same
    // entry key, while same-route parameter navigation receives a new key.
    scrollContainer.scrollLeft = restorationEntry.scrollX;
    scrollContainer.scrollTop = restorationEntry.scrollY;
    hasRestoredScroll.current = true;
  }, [activeScrollRef, restorationEntry, restorationKey]);

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
