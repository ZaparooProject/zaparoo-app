import React, {
  RefObject,
  ReactNode,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import classNames from "classnames";
import {
  useElementScrollRestoration,
  useRouter,
  useRouterState,
} from "@tanstack/react-router";
import { ResponsiveContainer } from "@/components/ResponsiveContainer";
import { useStatusStore } from "@/lib/store";
import { useTabSessionStore } from "@/lib/tabSessionStore";
import { InitialPageScrollOffsetContext } from "@/lib/pageScrollContext";

export const PAGE_SCROLL_RESTORATION_ID = "page-scroll";
export const PAGE_SCROLL_RESTORATION_SELECTOR = `[data-scroll-restoration-id="${PAGE_SCROLL_RESTORATION_ID}"]`;

interface PageFrameProps extends React.HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  /** Full custom header that replaces the default header structure */
  header?: ReactNode;
  /** Leading header content, such as a back button. */
  headerLeft?: ReactNode;
  /** Left-aligned title content that uses all remaining header width. */
  headerCenter?: ReactNode;
  /** Trailing header actions. */
  headerRight?: ReactNode;
  scrollRef?: RefObject<HTMLDivElement | null>;
  /** In-memory scroll slot used when revisiting a bottom-tab screen. */
  sessionScrollKey?: string;
}

interface PageHeaderProps {
  left?: ReactNode;
  title?: ReactNode;
  actions?: ReactNode;
}

export function PageHeader({ left, title, actions }: PageHeaderProps) {
  return (
    <div className="grid min-h-8 grid-cols-[auto_minmax(0,1fr)_auto] items-center">
      <div
        className={classNames("flex shrink-0 -translate-x-1", {
          "mr-1": left,
        })}
      >
        {left}
      </div>
      <div className="min-w-0 overflow-hidden text-left [&>h1]:truncate">
        {title}
      </div>
      <div
        className={classNames("flex shrink-0 translate-x-1 justify-end", {
          "ml-2": actions,
        })}
      >
        {actions}
      </div>
    </div>
  );
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
  const { restorationKey, routeHref } = useRouterState({
    select: (state) => ({
      restorationKey:
        state.location.state.__TSR_key || state.location.href || "",
      routeHref: state.location.href,
    }),
  });

  return (
    <PageFrameLayout
      {...props}
      restorationEntry={restorationEntry}
      restorationKey={restorationKey}
      sessionScrollKey={props.sessionScrollKey ?? routeHref}
    />
  );
}

function PageFrameLayout(props: PageFrameLayoutProps) {
  const safeInsets = useStatusStore((state) => state.safeInsets);
  const internalScrollRef = useRef<HTMLDivElement>(null);
  const hasRestoredScroll = useRef(false);
  const [headerScrolled, setHeaderScrolled] = useState(false);
  const restoredEntryKey = useRef<string | undefined>(undefined);
  const appliedRouterRestoration = useRef<string | null>(null);

  // Destructure known props and collect the rest
  const {
    children,
    header,
    headerLeft,
    headerCenter,
    headerRight,
    scrollRef,
    sessionScrollKey,
    restorationEntry,
    restorationKey,
    className,
    ...restProps
  } = props;

  const activeScrollRef = scrollRef ?? internalScrollRef;
  const hasHeaderContent = header || headerLeft || headerCenter || headerRight;
  const initialScrollOffset = sessionScrollKey
    ? (useTabSessionStore.getState().scrollPositions[sessionScrollKey]
        ?.scrollY ?? 0)
    : (restorationEntry?.scrollY ?? 0);

  useLayoutEffect(() => {
    const entryKey = `${restorationKey ?? ""}\u0001${sessionScrollKey ?? ""}`;
    if (restoredEntryKey.current !== entryKey) {
      restoredEntryKey.current = entryKey;
      hasRestoredScroll.current = false;
      appliedRouterRestoration.current = null;
    }

    const scrollContainer = activeScrollRef.current;
    if (!scrollContainer) return;

    const restoreScroll = (scrollX: number, scrollY: number) => {
      scrollContainer.scrollLeft = scrollX;
      scrollContainer.scrollTop = scrollY;
    };

    const sessionPosition = sessionScrollKey
      ? useTabSessionStore.getState().scrollPositions[sessionScrollKey]
      : undefined;
    if (sessionPosition) {
      if (!hasRestoredScroll.current) {
        hasRestoredScroll.current = true;
        restoreScroll(sessionPosition.scrollX, sessionPosition.scrollY);
      }
      return;
    }

    if (restorationEntry) {
      const routerPosition = `${restorationEntry.scrollX}:${restorationEntry.scrollY}`;
      if (appliedRouterRestoration.current !== routerPosition) {
        appliedRouterRestoration.current = routerPosition;
        hasRestoredScroll.current = true;
        restoreScroll(restorationEntry.scrollX, restorationEntry.scrollY);
      }
      return;
    }

    if (hasRestoredScroll.current) return;
    hasRestoredScroll.current = true;
    restoreScroll(0, 0);
  }, [activeScrollRef, restorationEntry, restorationKey, sessionScrollKey]);

  return (
    <div
      className={`flex h-full w-full flex-col ${className || ""}`}
      {...restProps}
    >
      <div
        className={classNames(
          "bg-background sticky top-0 z-10 transition-colors duration-150",
          {
            "border-b": hasHeaderContent,
            "border-b-[#ffffff21]": hasHeaderContent && headerScrolled,
            "border-transparent": !hasHeaderContent || !headerScrolled,
          },
        )}
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
              <PageHeader
                left={headerLeft}
                title={headerCenter}
                actions={headerRight}
              />
            )}
          </ResponsiveContainer>
        )}
      </div>
      <div
        ref={activeScrollRef}
        data-scroll-restoration-id={PAGE_SCROLL_RESTORATION_ID}
        className="flex-1 overflow-y-auto pb-4"
        onScroll={(event) => {
          const scrollContainer = event.currentTarget;
          setHeaderScrolled(scrollContainer.scrollTop > 0);
          if (sessionScrollKey) {
            useTabSessionStore
              .getState()
              .rememberScroll(
                sessionScrollKey,
                scrollContainer.scrollLeft,
                scrollContainer.scrollTop,
              );
          }
        }}
        style={{
          paddingRight: `calc(1rem + ${safeInsets.right})`,
          paddingLeft: `calc(1rem + ${safeInsets.left})`,
        }}
      >
        <ResponsiveContainer>
          <InitialPageScrollOffsetContext.Provider value={initialScrollOffset}>
            {children}
          </InitialPageScrollOffsetContext.Provider>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
