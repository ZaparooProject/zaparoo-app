import { useEffect, useState, RefObject } from "react";
import { ChevronUp } from "lucide-react";
import { useTranslation } from "react-i18next";
import { debounce } from "lodash";

interface BackToTopProps {
  scrollContainerRef: RefObject<HTMLElement>;
  threshold?: number;
}

export function BackToTop({
  scrollContainerRef,
  threshold = 300
}: BackToTopProps) {
  const [isVisible, setIsVisible] = useState(false);
  const { t } = useTranslation();

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const toggleVisibility = debounce(() => {
      // Only update visibility when not at the top (prevents interference during bounce)
      const scrollTop = container.scrollTop;
      if (scrollTop <= 0) {
        setIsVisible(false);
      } else {
        setIsVisible(scrollTop > threshold);
      }
    }, 10);

    setIsVisible(container.scrollTop > threshold);

    container.addEventListener("scroll", toggleVisibility, { passive: true });
    return () => {
      toggleVisibility.cancel();
      container.removeEventListener("scroll", toggleVisibility);
    };
  }, [scrollContainerRef, threshold]);

  const scrollToTop = () => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTo({
        top: 0,
        behavior: "smooth"
      });
    }
  };

  return (
    <div
      className={`absolute bottom-4 right-4 transition-opacity duration-300 ${
        isVisible
          ? "pointer-events-auto opacity-100"
          : "pointer-events-none opacity-0"
      }`}
      style={{
        zIndex: 50,
        transform: "translateZ(0)",
        willChange: "opacity"
      }}
    >
      <button
        onClick={scrollToTop}
        className="rounded-full bg-primary p-3 text-primary-foreground shadow-lg transition-transform hover:scale-105 hover:bg-primary/90 active:scale-95"
        aria-label={t("backToTop")}
      >
        <ChevronUp size={24} />
      </button>
    </div>
  );
}
