import { useEffect, useRef } from "react";

/**
 * Refs for an editor screen on the Zap page and its bar. Opening the screen
 * starts it at the top by resetting the page's own scroller (scrolling the
 * editor into view would also scroll the window and leave the bar under the
 * page header). The bar runs edge to edge, so it takes the scroller's padding
 * as its negative margin and follows it as the padding changes with the
 * window.
 */
export function useEditorBar() {
  const rootRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let scroller = rootRef.current?.parentElement ?? null;
    while (scroller) {
      const { overflowY } = getComputedStyle(scroller);
      if (overflowY === "auto" || overflowY === "scroll") break;
      scroller = scroller.parentElement;
    }
    if (!scroller) return;
    scroller.scrollTop = 0;
    // Form screens have no bar; they only start at the top.
    const bar = barRef.current;
    if (!bar) return;
    const fit = () => {
      const padding = getComputedStyle(scroller);
      // Sticky offsets are measured inside the scroller's padding, so the bar
      // sits where it should by pulling both its place and its stuck position
      // up by that padding.
      const wanted =
        parseFloat(getComputedStyle(bar).getPropertyValue("--zap-bar-top")) ||
        0;
      const lift = `${wanted - (parseFloat(padding.paddingTop) || 0)}px`;
      bar.style.marginLeft = `-${padding.paddingLeft}`;
      bar.style.marginRight = `-${padding.paddingRight}`;
      bar.style.marginTop = lift;
      bar.style.top = lift;
    };
    fit();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(fit);
    observer.observe(scroller);
    return () => observer.disconnect();
  }, []);

  return { rootRef, barRef };
}
