import classNames from "classnames";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";

interface ModalActionRailProps {
  actions: ReactNode;
  primaryAction?: ReactNode;
  /** "content" sizes each action to its caption so short rails fit narrow phones. */
  itemWidth?: "uniform" | "content";
  "aria-label": string;
}

export function ModalActionRail({
  actions,
  primaryAction,
  itemWidth = "uniform",
  "aria-label": ariaLabel,
}: ModalActionRailProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ left: false, right: false });

  useEffect(() => {
    const scroller = scrollRef.current;
    const content = contentRef.current;
    if (!scroller || !content) return;

    const updateEdges = () => {
      const left = scroller.scrollLeft > 2;
      const right =
        scroller.scrollWidth - scroller.clientWidth - scroller.scrollLeft > 2;
      setEdges((previous) =>
        previous.left === left && previous.right === right
          ? previous
          : { left, right },
      );
    };
    updateEdges();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", updateEdges);
      return () => window.removeEventListener("resize", updateEdges);
    }
    const observer = new ResizeObserver(updateEdges);
    observer.observe(scroller);
    observer.observe(content);
    return () => observer.disconnect();
  }, []);

  const maskImage =
    edges.left && edges.right
      ? "linear-gradient(to right, transparent, black 20px, black calc(100% - 20px), transparent)"
      : edges.left
        ? "linear-gradient(to right, transparent, black 20px)"
        : edges.right
          ? "linear-gradient(to left, transparent, black 20px)"
          : undefined;

  return (
    <div
      className={
        primaryAction
          ? "flex flex-col gap-2 sm:grid sm:grid-cols-[minmax(0,auto)_minmax(12rem,1fr)]"
          : "flex flex-col gap-2"
      }
    >
      <div className="relative min-w-0 overflow-hidden">
        <div
          ref={scrollRef}
          role="group"
          aria-label={ariaLabel}
          onScroll={() => {
            const scroller = scrollRef.current;
            if (!scroller) return;
            setEdges({
              left: scroller.scrollLeft > 2,
              right:
                scroller.scrollWidth -
                  scroller.clientWidth -
                  scroller.scrollLeft >
                2,
            });
          }}
          className="overflow-x-auto overscroll-x-contain py-1"
          style={{ maskImage, WebkitMaskImage: maskImage }}
        >
          <div
            ref={contentRef}
            className={classNames(
              "grid min-w-full grid-flow-col gap-1 sm:min-w-0 [&>*]:min-h-14 [&>*]:w-full [&>*]:min-w-0 sm:[&>*]:min-h-12",
              itemWidth === "content"
                ? "auto-cols-[minmax(max-content,1fr)]"
                : "auto-cols-[minmax(5.5rem,1fr)]",
            )}
          >
            {actions}
          </div>
        </div>
        {edges.left && (
          <ChevronLeftIcon
            size={14}
            aria-hidden="true"
            data-testid="rail-scroll-left"
            className="text-muted-foreground pointer-events-none absolute top-1/2 left-0 -translate-y-1/2"
          />
        )}
        {edges.right && (
          <ChevronRightIcon
            size={14}
            aria-hidden="true"
            data-testid="rail-scroll-right"
            className="text-muted-foreground pointer-events-none absolute top-1/2 right-0 -translate-y-1/2"
          />
        )}
      </div>
      {primaryAction && (
        <div className="min-w-0 [&>*]:min-h-12 [&>*]:w-full">
          {primaryAction}
        </div>
      )}
    </div>
  );
}
