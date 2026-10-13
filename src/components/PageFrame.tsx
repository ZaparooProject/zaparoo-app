import React, { RefObject, ReactNode, useLayoutEffect, useRef } from "react";
import classNames from "classnames";
import {
  useElementScrollRestoration,
  useRouter,
  useRouterState,
  type LinkProps,
} from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { ResponsiveContainer } from "@/components/ResponsiveContainer";
import { SwipeBackIndicator } from "@/components/SwipeBackIndicator";
import { useStatusStore } from "@/lib/store";
import { useTabSessionStore } from "@/lib/tabSessionStore";
import { InitialPageScrollOffsetContext } from "@/lib/pageScrollContext";
import { useSwipeBack } from "@/hooks/useSwipeBack";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { PageParentLink } from "@/components/PageParentLink";

export const PAGE_SCROLL_RESTORATION_ID = "page-scroll";
export const PAGE_SCROLL_RESTORATION_SELECTOR = `[data-scroll-restoration-id="${PAGE_SCROLL_RESTORATION_ID}"]`;

export type PageBreadcrumb =
  | {
      label: string;
      to: NonNullable<LinkProps["to"]>;
      params?: LinkProps["params"];
      onNavigate?: () => void;
      onClick?: never;
    }
  | {
      label: string;
      onClick: () => void;
      to?: never;
      params?: never;
      onNavigate?: never;
    };

interface PageFrameProps extends React.HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  /** Broad browsing workspaces opt out of the default form width. */
  layout?: "default" | "workspace";
  /** One stable supporting surface, modal on narrow windows and docked on wide ones. */
  supportingPane?: ReactNode;
  /** Full custom header that replaces the default header structure */
  header?: ReactNode;
  /** Phone chrome can be omitted or become a scrolling content row on wider screens. */
  headerMode?: "always" | "phone" | "content-wide";
  /** Ancestors inline with the current heading on tablet/desktop; hidden on phones. */
  breadcrumbs?: readonly PageBreadcrumb[];
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
  contentWide?: boolean;
  breadcrumbs?: readonly PageBreadcrumb[];
}

export function PageHeader({
  left,
  title,
  actions,
  contentWide = false,
  breadcrumbs = [],
}: PageHeaderProps) {
  const { t } = useTranslation();
  const wide = useMediaQuery("(min-width: 760px)");
  const hasBreadcrumbs = breadcrumbs.length > 0;
  return (
    <div
      className={classNames("grid min-h-14 items-center", {
        "grid-cols-[auto_minmax(0,1fr)_auto]": !contentWide,
        // In-flow titles need only the 48px control row from 760px.
        "page-header-content-row md:min-h-12": contentWide,
      })}
    >
      <div
        className={classNames({
          "flex shrink-0": !contentWide,
          "page-header-leading": contentWide,
          "mr-[12px] md:mr-[16px]": left,
        })}
      >
        {left}
      </div>
      <div
        className={classNames(
          "page-header-title min-w-0 text-left [&_h1]:text-xl [&_h1]:leading-tight [&_h1]:font-semibold [&_h1]:tracking-tight [&_h1]:break-words [&_h1]:outline-none",
          {
            "pl-[4px]": !left && !contentWide,
            "page-header-title-inset": !left && contentWide,
          },
        )}
      >
        {hasBreadcrumbs ? (
          <div
            role={wide ? "navigation" : undefined}
            aria-label={wide ? t("nav.breadcrumbs") : undefined}
          >
            <ol
              className="page-header-breadcrumbs"
              role={wide ? "list" : "presentation"}
            >
              {breadcrumbs.map((crumb, index) => (
                <li
                  className="page-header-ancestor"
                  key={index}
                  role={wide ? undefined : "presentation"}
                >
                  {crumb.to !== undefined ? (
                    <PageParentLink
                      to={crumb.to}
                      label={crumb.label}
                      params={crumb.params}
                      onNavigate={crumb.onNavigate}
                    />
                  ) : (
                    <button
                      type="button"
                      className="page-parent-link"
                      onClick={crumb.onClick}
                    >
                      {crumb.label}
                    </button>
                  )}
                  <span className="page-header-separator" aria-hidden="true">
                    ›
                  </span>
                </li>
              ))}
              <li
                key="current"
                className="page-header-current"
                role={wide ? undefined : "presentation"}
                aria-current={wide ? "page" : undefined}
              >
                {title}
              </li>
            </ol>
          </div>
        ) : (
          title
        )}
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
  restoreSessionScroll?: boolean;
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
  const { restorationKey, routeHref, restoreSessionScroll } = useRouterState({
    select: (state) => ({
      restorationKey:
        state.location.state.__TSR_key || state.location.href || "",
      routeHref: state.location.href,
      // Sidebar entries use per-history restoration, not phone tab memory.
      restoreSessionScroll:
        state.location.state.appNavigationSource !== "desktop-sidebar",
    }),
  });

  return (
    <PageFrameLayout
      {...props}
      restorationEntry={restorationEntry}
      restorationKey={restorationKey}
      restoreSessionScroll={restoreSessionScroll}
      sessionScrollKey={props.sessionScrollKey ?? routeHref}
    />
  );
}

function PageFrameLayout(props: PageFrameLayoutProps) {
  const safeInsets = useStatusStore((state) => state.safeInsets);
  const contentSafeTop = `var(--page-content-safe-top, ${safeInsets.top})`;
  const internalScrollRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const hasRestoredScroll = useRef(false);
  const restoredEntryKey = useRef<string | undefined>(undefined);
  const appliedRouterRestoration = useRef<string | null>(null);

  // Destructure known props and collect the rest
  const {
    children,
    layout = "default",
    supportingPane,
    header,
    headerMode = "always",
    breadcrumbs,
    headerLeft,
    headerCenter,
    headerRight,
    scrollRef,
    sessionScrollKey,
    restorationEntry,
    restorationKey,
    restoreSessionScroll = true,
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
  const initialScrollOffset =
    restoreSessionScroll && sessionScrollKey
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

    const sessionPosition =
      restoreSessionScroll && sessionScrollKey
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
  }, [
    activeScrollRef,
    restorationEntry,
    restorationKey,
    restoreSessionScroll,
    sessionScrollKey,
  ]);

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

  const headerShell = (
    <div
      ref={headerRef}
      className={classNames("top-0 z-10", {
        sticky: !hasHeaderContent,
        "page-header-shell": hasHeaderContent,
        "absolute md:pointer-events-none":
          hasHeaderContent && headerMode !== "content-wide",
      })}
      style={
        hasHeaderContent
          ? ({
              "--page-header-safe-top": contentSafeTop,
              "--page-header-safe-right": safeInsets.right,
              "--page-header-safe-left": safeInsets.left,
            } as React.CSSProperties)
          : {
              paddingTop: `calc(1rem + ${contentSafeTop})`,
              paddingRight: `calc(1rem + ${safeInsets.right})`,
              paddingLeft: `calc(1rem + var(--page-content-safe-left, ${safeInsets.left}))`,
            }
      }
    >
      {hasHeaderContent && (
        <div className="page-header-surface">
          <ResponsiveContainer maxWidth="full" className="page-header-content">
            {header ? (
              header
            ) : (
              <PageHeader
                left={headerLeft}
                title={headerCenter}
                actions={headerRight}
                contentWide={headerMode === "content-wide"}
                breadcrumbs={breadcrumbs}
              />
            )}
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );

  return (
    <div
      className={classNames(
        "page-frame relative h-full w-full",
        {
          "page-frame-workspace": layout === "workspace",
          "page-frame-with-pane": Boolean(supportingPane),
          "page-frame-phone-header": headerMode === "phone",
          "page-frame-content-wide-header": headerMode === "content-wide",
        },
        className,
      )}
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
      {headerMode !== "content-wide" && headerShell}
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
            "--page-header-overlay-height": `calc(${contentSafeTop} + max(56px, 3.5rem) + 1px)`,
            "--page-header-overlay-clearance": `calc(${contentSafeTop} + 1.5rem + max(68px, 3.5rem))`,
            "--page-scroll-safe-top": safeInsets.top,
            "--page-scroll-safe-right": safeInsets.right,
            "--page-scroll-safe-left": safeInsets.left,
          } as React.CSSProperties
        }
      >
        {headerMode === "content-wide" && headerShell}
        <ResponsiveContainer maxWidth={layout === "workspace" ? "full" : "app"}>
          <InitialPageScrollOffsetContext.Provider value={initialScrollOffset}>
            {children}
          </InitialPageScrollOffsetContext.Provider>
        </ResponsiveContainer>
      </div>
      {supportingPane && (
        <div
          className="page-frame-support"
          style={
            { "--page-support-safe-top": contentSafeTop } as React.CSSProperties
          }
        >
          {supportingPane}
        </div>
      )}
      {onSwipeBack && <SwipeBackIndicator progress={progress} />}
    </div>
  );
}
