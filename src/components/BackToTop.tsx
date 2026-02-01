import { useEffect, useState, RefObject } from "react";
import { ChevronUp } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useDebouncedCallback } from "use-debounce";
import { useStatusStore } from "@/lib/store";

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

  const scrollToTop = () => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTo({
        top: 0,
        behavior: "smooth",
      });
    }
  };

  return (
    <div
      className={`fixed right-4 transition-opacity duration-300 sm:right-8 ${
        isVisible
          ? "pointer-events-auto opacity-100"
          : "pointer-events-none opacity-0"
      }`}
      aria-hidden={!isVisible}
      style={{
        zIndex: 30,
        transform: "translateZ(0)",
        willChange: "opacity",
        bottom: `calc(${bottomOffset} + ${safeInsets.bottom})`,
      }}
    >
      <button
        type="button"
        onClick={scrollToTop}
        className="bg-primary text-primary-foreground hover:bg-primary/90 rounded-full p-3 shadow-lg transition-transform hover:scale-105 active:scale-95"
        aria-label={t("backToTop")}
      >
        <ChevronUp size={24} />
      </button>
    </div>
  );
}
