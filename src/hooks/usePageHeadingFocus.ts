import { useEffect, useRef } from "react";

const activePageTitles = new Map<symbol, string>();

function applyCurrentPageTitle() {
  const titles = Array.from(activePageTitles.values());
  document.title = titles.at(-1) ?? "Zaparoo";
}

/**
 * Hook that focuses a page heading on mount so route changes have a clear
 * keyboard and screen-reader destination.
 *
 * Programmatic focus uses `preventScroll` and a temporary tab stop, so it does
 * not alter restored page scroll positions or normal tab order.
 *
 * Optionally sets the document title, which helps TalkBack announce the page
 * name instead of "webview" when navigating.
 *
 * @param title - Optional page title to set. If provided, sets document.title to "title - Zaparoo"
 *
 * @example
 * function MyPage() {
 *   const { t } = useTranslation();
 *   const headingRef = usePageHeadingFocus<HTMLHeadingElement>(t("page.title"));
 *   return <h1 ref={headingRef}>{t("page.title")}</h1>;
 * }
 */
export function usePageHeadingFocus<T extends HTMLElement>(title?: string) {
  const ref = useRef<T>(null);
  const titleOwner = useRef(Symbol("page-title"));

  useEffect(() => {
    const owner = titleOwner.current;
    if (title) {
      activePageTitles.delete(owner);
      activePageTitles.set(owner, `${title} - Zaparoo`);
      applyCurrentPageTitle();
    }

    const heading = ref.current;
    if (heading) {
      heading.setAttribute("tabindex", "-1");
      heading.focus({ preventScroll: true });
    }

    return () => {
      if (title) {
        activePageTitles.delete(owner);
        applyCurrentPageTitle();
      }
    };
  }, [title]);

  return ref;
}
