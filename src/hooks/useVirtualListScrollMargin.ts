import { useLayoutEffect, useState, type RefObject } from "react";

/** Position of a virtual list within its page scroller, including preceding content. */
export function useVirtualListScrollMargin(
  scrollRef?: RefObject<HTMLElement | null>,
) {
  const [listElement, listRef] = useState<HTMLElement | null>(null);
  const [geometry, setGeometry] = useState({
    scrollMargin: 0,
    scrollPaddingStart: 0,
  });

  useLayoutEffect(() => {
    const scroller = scrollRef?.current;
    if (!listElement || !scroller) return;

    const measure = () => {
      const offset =
        listElement.getBoundingClientRect().top -
        scroller.getBoundingClientRect().top +
        scroller.scrollTop -
        scroller.clientTop;
      const scrollMargin = Math.max(0, offset);
      const scrollPaddingStart =
        parseFloat(getComputedStyle(scroller).paddingTop) || 0;
      setGeometry((previous) =>
        previous.scrollMargin === scrollMargin &&
        previous.scrollPaddingStart === scrollPaddingStart
          ? previous
          : { scrollMargin, scrollPaddingStart },
      );
    };
    // Restored rows need the content origin before paint.
    measure();

    const observer =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(measure);
    // Header/filter changes can move the list without resizing the list itself.
    let element: HTMLElement | null = listElement;
    while (element && element !== scroller) {
      observer?.observe(element);
      let preceding = element.previousElementSibling;
      while (preceding) {
        observer?.observe(preceding);
        preceding = preceding.previousElementSibling;
      }
      element = element.parentElement;
    }
    observer?.observe(scroller);
    window.addEventListener("resize", measure);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [listElement, scrollRef]);

  return { listRef, ...geometry };
}
