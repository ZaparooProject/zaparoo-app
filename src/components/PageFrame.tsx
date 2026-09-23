import React, { RefObject, ReactNode, useLayoutEffect, useRef } from "react";
import classNames from "classnames";
import {
  useElementScrollRestoration,
  useRouter,
  useRouterState,
} from "@tanstack/react-router";
import { ResponsiveContainer } from "@/components/ResponsiveContainer";
import { SwipeBackIndicator } from "@/components/SwipeBackIndicator";
import { useStatusStore } from "@/lib/store";
import { useTabSessionStore } from "@/lib/tabSessionStore";
import { InitialPageScrollOffsetContext } from "@/lib/pageScrollContext";
import { useSwipeBack } from "@/hooks/useSwipeBack";

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
  /** Navigate to this page's parent after a completed rightward swipe. */
  onSwipeBack?: () => void;
}

interface PageHeaderProps {
  left?: ReactNode;
  title?: ReactNode;
  actions?: ReactNode;
}

export function PageHeader({ left, title, actions }: PageHeaderProps) {
  return (
    <div className="grid min-h-14 grid-cols-[auto_minmax(0,1fr)_auto] items-center">
      <div
        className={classNames("flex shrink-0", {
          "mr-[12px] md:mr-[16px]": left,
        })}
      >
        {left}
      </div>
      <div
        className={classNames(
          "min-w-0 text-left [&>h1]:text-xl [&>h1]:leading-tight [&>h1]:font-semibold [&>h1]:tracking-tight [&>h1]:break-words [&>h1]:outline-none",
          { "pl-[4px]": !left },
        )}
      >
        {title}
      </div>
      <div
        className={classNames("flex shrink-0 justify-end", {
          "ml-[4px]": actions,
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
  const headerRef = useRef<HTMLDivElement>(null);
  const hasRestoredScroll = useRef(false);
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
    onSwipeBack,
    onMouseDown,
    onTouchCancel,
    className,
    ...restProps
  } = props;

  const { cancelSwipeBack, progress, swipeHandlers } =
    useSwipeBack(onSwipeBack);
  const { ref: swipeRef, onMouseDown: onSwipeMouseDown } = swipeHandlers;
  const rootSwipeHandlers = {
    ref: onSwipeBack ? swipeRef : undefined,
    onMouseDown:
      onSwipeBack || onMouseDown
        ? (event: React.MouseEvent<HTMLDivElement>) => {
            if (onSwipeBack) onSwipeMouseDown?.(event);
            onMouseDown?.(event);
          }
        : undefined,
  };
  const activeScrollRef = scrollRef ?? internalScrollRef;
  const hasHeaderContent = Boolean(
    header || headerLeft || headerCenter || headerRight,
  );
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

  useLayoutEffect(() => {
    const headerElement = headerRef.current;
    const scrollContainer = activeScrollRef.current;
    if (!hasHeaderContent || !headerElement || !scrollContainer) return;

    const updateHeaderClearance = () => {
      const headerHeight = Math.ceil(
        headerElement.getBoundingClientRect().height,
      );
      const surface = headerElement.querySelector<HTMLElement>(
        ".page-header-surface",
      );
      const outerGutter = surface
        ? Number.parseFloat(getComputedStyle(surface).marginTop) || 0
        : 0;
      if (headerHeight > 0) {
        scrollContainer.style.setProperty(
          "--page-header-overlay-height",
          `${headerHeight}px`,
        );
        scrollContainer.style.setProperty(
          "--page-header-overlay-clearance",
          `${Math.ceil(headerHeight + outerGutter)}px`,
        );
      }
    };

    updateHeaderClearance();
    if (typeof ResizeObserver === "undefined") return;

    const observer = new ResizeObserver(updateHeaderClearance);
    observer.observe(headerElement);
    return () => observer.disconnect();
  }, [activeScrollRef, hasHeaderContent, safeInsets.top]);

  return (
    <div
      className={`relative flex h-full w-full flex-col ${className || ""}`}
      {...restProps}
      {...rootSwipeHandlers}
      onTouchCancel={
        onSwipeBack || onTouchCancel
          ? (event) => {
              cancelSwipeBack();
              onTouchCancel?.(event);
            }
          : undefined
      }
    >
      <div
        ref={headerRef}
        className={classNames("top-0 z-10", {
          sticky: !hasHeaderContent,
          "page-header-shell absolute inset-x-0 md:pointer-events-none":
            hasHeaderContent,
        })}
        style={
          hasHeaderContent
            ? ({
                "--page-header-safe-top": safeInsets.top,
                "--page-header-safe-right": safeInsets.right,
                "--page-header-safe-left": safeInsets.left,
              } as React.CSSProperties)
            : {
                paddingTop: `calc(1rem + ${safeInsets.top})`,
                paddingRight: `calc(1rem + ${safeInsets.right})`,
                paddingLeft: `calc(1rem + ${safeInsets.left})`,
              }
        }
      >
        {hasHeaderContent && (
          <div className="page-header-surface">
            <ResponsiveContainer
              maxWidth="full"
              className="page-header-content"
            >
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
          </div>
        )}
      </div>
      <div
        ref={activeScrollRef}
        data-scroll-restoration-id={PAGE_SCROLL_RESTORATION_ID}
        className={classNames("page-frame-scroll flex-1 overflow-y-auto", {
          "page-frame-scroll-with-header": hasHeaderContent,
        })}
        onScroll={(event) => {
          const scrollContainer = event.currentTarget;
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
        style={
          {
            "--page-header-overlay-height": `calc(${safeInsets.top} + max(56px, 3.5rem) + 1px)`,
            "--page-header-overlay-clearance": `calc(${safeInsets.top} + 1.5rem + max(68px, 3.5rem))`,
            paddingRight: `calc(1rem + ${safeInsets.right})`,
            paddingLeft: `calc(1rem + ${safeInsets.left})`,
          } as React.CSSProperties
        }
      >
        <ResponsiveContainer>
          <InitialPageScrollOffsetContext.Provider value={initialScrollOffset}>
            {children}
          </InitialPageScrollOffsetContext.Provider>
        </ResponsiveContainer>
      </div>
      {onSwipeBack && <SwipeBackIndicator progress={progress} />}
    </div>
  );
}
