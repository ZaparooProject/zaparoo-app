import { useEffect, useRef } from "react";
import { useScreenReaderEnabled } from "./useScreenReaderEnabled";

/**
 * Hook that focuses an element on mount for screen reader accessibility.
 * Use this on page headings so screen readers announce the page when navigating.
 *
 * Focus is only applied when a screen reader is enabled, to avoid showing
 * distracting focus rings during normal usage.
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
  const screenReaderEnabled = useScreenReaderEnabled();

  useEffect(() => {
    // Set document title for screen reader announcement (always)
    if (title) {
      document.title = `${title} - Zaparoo`;
    }

    // Only force focus when screen reader is active
    if (screenReaderEnabled && ref.current) {
      // Make focusable without affecting tab order
      ref.current.setAttribute("tabindex", "-1");
      ref.current.focus();
    }

    // Reset title on unmount
    return () => {
      document.title = "Zaparoo";
    };
  }, [title, screenReaderEnabled]);

  return ref;
}
