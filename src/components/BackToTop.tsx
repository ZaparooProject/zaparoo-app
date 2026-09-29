import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent,
  type RefObject,
} from "react";
import { ChevronUp } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useDebouncedCallback } from "use-debounce";
import { useStatusStore } from "@/lib/store";
import { CircleButton } from "@/components/wui/CircleButton";

/** Inset from the right and bottom edges, so the button sits evenly in its corner. */
const EDGE_MARGIN = "1rem";

/**
 * A transformed ancestor (such as an open SlideModal) becomes the containing
 * block of `position: fixed` children, so offsets must be measured from it.
 */
function fixedContainingBlock(element: HTMLElement): HTMLElement | null {
  for (
    let parent = element.parentElement;
    parent;
    parent = parent.parentElement
  ) {
    const style = window.getComputedStyle(parent);
    const creates = (value: string) => value !== "" && value !== "none";
    if (
      creates(style.transform) ||
      creates(style.perspective) ||
      creates(style.filter) ||
      /transform|perspective|filter/.test(style.willChange)
    ) {
      return parent;
    }
  }
  return null;
}

interface BackToTopProps {
  scrollContainerRef: RefObject<HTMLElement | null>;
  threshold?: number;
  /**
   * Distance above the bottom edge. Inside a dialog it is measured from the
   * bottom of the scroll area (the footer separator, if there is a footer);
   * on pages it defaults to the measured footer clearance. Either way the
   * button keeps a 1rem margin.
   */
  bottomOffset?: string;
}

export function BackToTop({
  scrollContainerRef,
  threshold = 300,
  bottomOffset,
}: BackToTopProps) {
  const [isVisible, setIsVisible] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [dialogGap, setDialogGap] = useState<number | null>(null);
  const { t } = useTranslation();
  const safeInsets = useStatusStore((state) => state.safeInsets);

  const toggleVisibility = useDebouncedCallback(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    // Only update visibility when not at the top (prevents interference during bounce)
    const scrollTop = container.scrollTop;
    if (scrollTop <= 0) {
      setIsVisible(false);
    } else {
      setIsVisible(scrollTop > threshold);
    }
  }, 10);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    setIsVisible(container.scrollTop > threshold);

    container.addEventListener("scroll", toggleVisibility, { passive: true });
    return () => {
      toggleVisibility.cancel();
      container.removeEventListener("scroll", toggleVisibility);
    };
  }, [scrollContainerRef, threshold, toggleVisibility]);

  const measureDialogGap = useCallback(() => {
    const container = scrollContainerRef.current;
    const wrapper = wrapperRef.current;
    if (!container || !wrapper || bottomOffset !== undefined) return;
    if (!container.closest('[role="dialog"]')) {
      setDialogGap(null);
      return;
    }
    const blockBottom =
      fixedContainingBlock(wrapper)?.getBoundingClientRect().bottom ??
      window.innerHeight;
    const gap = Math.max(
      0,
      blockBottom - container.getBoundingClientRect().bottom,
    );
    setDialogGap((previous) => (previous === gap ? previous : gap));
  }, [bottomOffset, scrollContainerRef]);

  useEffect(() => {
    measureDialogGap();
    const container = scrollContainerRef.current;
    window.addEventListener("resize", measureDialogGap);
    if (typeof ResizeObserver === "undefined" || !container) {
      return () => window.removeEventListener("resize", measureDialogGap);
    }
    const observer = new ResizeObserver(measureDialogGap);
    observer.observe(container);
    if (container.parentElement) observer.observe(container.parentElement);
    return () => {
      window.removeEventListener("resize", measureDialogGap);
      observer.disconnect();
    };
  }, [measureDialogGap, scrollContainerRef]);

  useEffect(() => {
    if (isVisible) measureDialogGap();
  }, [isVisible, measureDialogGap]);

  const scrollToTop = (event: MouseEvent<HTMLButtonElement>) => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const reduceMotion = window.matchMedia?.(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    container.scrollTo({
      top: 0,
      behavior: reduceMotion ? "auto" : "smooth",
    });

    // Pointer users retain their current focus. Keyboard activation moves focus
    // with the viewport so assistive technology lands at the returned context.
    if (event.detail === 0) {
      const scope =
        container.closest('[role="dialog"]') ?? container.parentElement;
      const focusTarget = scope?.querySelector<HTMLElement>(
        "[data-back-to-top-target], h1, h2",
      );
      focusTarget?.focus({ preventScroll: true });
    }
  };

  return (
    <div
      ref={wrapperRef}
      className={`fixed transition-opacity duration-300 motion-reduce:transition-none ${
        isVisible
          ? "pointer-events-auto opacity-100"
          : "pointer-events-none opacity-0"
      }`}
      aria-hidden={!isVisible}
      inert={!isVisible}
      style={{
        zIndex: 30,
        transform: "translateZ(0)",
        willChange: "opacity",
        right: EDGE_MARGIN,
        bottom:
          dialogGap !== null
            ? `calc(${dialogGap}px + ${EDGE_MARGIN})`
            : bottomOffset
              ? `calc(${bottomOffset} + ${safeInsets.bottom})`
              : `calc(var(--app-footer-overlay-clearance, 92px) + ${EDGE_MARGIN} + ${safeInsets.bottom})`,
      }}
    >
      <CircleButton
        icon={<ChevronUp size={24} />}
        variant="secondary"
        onClick={scrollToTop}
        aria-label={t("backToTop")}
      />
    </div>
  );
}
