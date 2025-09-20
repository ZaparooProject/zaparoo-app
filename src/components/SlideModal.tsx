import { ReactNode } from "react";
import classNames from "classnames";
import { X } from "lucide-react";
import { useStatusStore } from "@/lib/store.ts";
import { useSmartSwipe } from "@/hooks/useSmartSwipe";

export function SlideModal(props: {
  isOpen: boolean;
  close: () => void;
  title: string;
  children: ReactNode;
  className?: string;
}) {
  const swipeHandlers = useSmartSwipe({
    onSwipeDown: props.close,
    preventScrollOnSwipe: false,
    swipeThreshold: 50,
    velocityThreshold: 0.3
  });

  const safeInsets = useStatusStore((state) => state.safeInsets);

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 z-40 bg-black/50 transition-opacity duration-200 ease-in-out"
        style={{
          opacity: props.isOpen ? 1 : 0,
          pointerEvents: props.isOpen ? "auto" : "none"
        }}
        onClick={props.close}
        onKeyDown={(e) => e.key === 'Escape' && props.close()}
        role="button"
        tabIndex={0}
        aria-label="Close modal"
      />

      {/* Modal */}
      <div
        className={classNames(
          "fixed",
          "z-50",
          "left-0", // Mobile: align to left edge
          "sm:left-1/2", // Desktop: center horizontally
          "sm:-translate-x-1/2", // Desktop: translate back to center
          "w-full",
          "max-w-none", // Mobile: full width
          "sm:max-w-2xl", // Desktop: responsive width (672px)
          "rounded-tl-md",
          "rounded-tr-md",
          "border",
          "border-b-0",
          "border-solid",
          "border-[rgba(255,255,255,0.13)]",
          "bg-[rgba(17,25,40,0.7)]",
          "p-3",
          "mix-blend-normal",
          "backdrop-blur-lg",
          props.className
        )}
        style={{
          bottom: props.isOpen ? "0" : "-100vh",
          transition: "bottom 0.2s ease-in-out",
          maxHeight: `calc(100vh - ${safeInsets.top} - 75px)`,
          paddingBottom: `calc(0.75rem + ${safeInsets.bottom})`
        }}
      >
        <div
          className="flex w-full justify-center pb-3 sm:hidden"
          style={{ overflowY: "initial" }}
          {...swipeHandlers}
        >
          <div
            onClick={props.close}
            onKeyDown={(e) => e.key === 'Enter' && props.close()}
            role="button"
            tabIndex={0}
            aria-label="Drag to close"
            className="h-[5px] w-[80px] rounded-full bg-[#00E0FF]"
          ></div>
        </div>
        <div className="relative">
          <p className="text-center text-lg">{props.title}</p>
          {/* Desktop close button */}
          <button
            onClick={props.close}
            className="absolute right-0 top-0 hidden sm:flex items-center justify-center w-8 h-8 rounded-md opacity-70 transition-opacity hover:opacity-100 hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
            aria-label="Close modal"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div
          style={{
            maxHeight: "80vh",
            overflowY: "auto"
          }}
        >
          {props.children}
        </div>
      </div>
    </>
  );
}
