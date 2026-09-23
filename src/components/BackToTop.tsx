import { useEffect, useState, type MouseEvent, type RefObject } from "react";
import { ChevronUp } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useDebouncedCallback } from "use-debounce";
import { useStatusStore } from "@/lib/store";
import { CircleButton } from "@/components/wui/CircleButton";

interface BackToTopProps {
  scrollContainerRef: RefObject<HTMLElement | null>;
  threshold?: number;
  bottomOffset?: string;
}

export function BackToTop({
  scrollContainerRef,
  threshold = 300,
  bottomOffset = "1rem",
}: BackToTopProps) {
  const [isVisible, setIsVisible] = useState(false);
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
      className={`fixed right-4 transition-opacity duration-300 motion-reduce:transition-none sm:right-8 ${
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
        bottom: `calc(${bottomOffset} + ${safeInsets.bottom})`,
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
