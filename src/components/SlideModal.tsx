import { ReactNode, RefObject, useEffect, useId, useRef } from "react";
import classNames from "classnames";
import { X } from "lucide-react";
import { useStatusStore } from "@/lib/store.ts";
import { useSmartSwipe } from "@/hooks/useSmartSwipe";
import { useBackButtonHandler } from "@/hooks/useBackButtonHandler";
import { useSlideModalManager } from "@/hooks/useSlideModalManager";
import { useFocusTrap } from "@/hooks/useFocusTrap";

export function SlideModal(props: {
  isOpen: boolean;
  close: () => void;
  title: string;
  children: ReactNode;
  className?: string;
  scrollRef?: RefObject<HTMLDivElement | null>;
  footer?: ReactNode;
  fixedHeight?: string;
}) {
  const modalId = useId();
  const modalManager = useSlideModalManager();
  const modalRef = useRef<HTMLDivElement>(null);

  // Trap focus within modal when open
  useFocusTrap({
    isActive: props.isOpen,
    containerRef: modalRef,
    restoreFocus: true,
    autoFocus: true,
  });

  const swipeHandlers = useSmartSwipe({
    onSwipeDown: props.close,
    preventScrollOnSwipe: false,
    swipeThreshold: 50,
    velocityThreshold: 0.3,
  });

  // Handle Android back button
  useBackButtonHandler(
    "slide-modal",
    () => {
      if (props.isOpen) {
        props.close();
        return true; // Consume the event
      }
      return false; // Let other handlers process it
    },
    100, // High priority
    props.isOpen, // Only active when modal is open
  );

  // Register/unregister modal with manager and handle auto-close
  useEffect(() => {
    if (props.isOpen) {
      // Close any other open modals before opening this one
      modalManager.closeAllExcept(modalId);

      // Register this modal
      modalManager.registerModal(modalId, props.close);

      // Cleanup function to unregister when modal closes
      return () => {
        modalManager.unregisterModal(modalId);
      };
    } else {
      // Unregister when modal closes
      modalManager.unregisterModal(modalId);
    }
  }, [props.isOpen, modalId, modalManager, props.close]);

  const safeInsets = useStatusStore((state) => state.safeInsets);

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 z-40 bg-black/50 transition-opacity duration-200 ease-in-out"
        style={{
          opacity: props.isOpen ? 1 : 0,
          pointerEvents: props.isOpen ? "auto" : "none",
        }}
        onClick={props.close}
        onKeyDown={(e) => e.key === "Escape" && props.close()}
        role="button"
        tabIndex={0}
        aria-label="Close modal"
      />

      {/* Modal */}
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${modalId}-title`}
        className={classNames(
          "fixed",
          "z-50",
          "left-0", // Mobile: align to left edge
          "sm:left-1/2", // Desktop: center horizontally
          "sm:-translate-x-1/2", // Desktop: translate back to center
          "w-full",
          "max-w-none", // Mobile: full width
          "sm:max-w-2xl", // Desktop: responsive width (672px)
          "flex",
          "flex-col",
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
          props.className,
        )}
        style={{
          bottom: props.isOpen ? "0" : "-100vh",
          transition: "bottom 0.2s ease-in-out",
          ...(props.fixedHeight
            ? { height: props.fixedHeight }
            : { maxHeight: `calc(100vh - ${safeInsets.top} - 75px)` }),
        }}
      >
        <div
          className="flex w-full justify-center pb-3 sm:hidden"
          style={{ overflowY: "initial" }}
          {...swipeHandlers}
        >
          <div
            onClick={props.close}
            onKeyDown={(e) => e.key === "Enter" && props.close()}
            role="button"
            tabIndex={0}
            aria-label="Drag to close"
            className="h-[5px] w-[80px] rounded-full bg-[#00E0FF]"
          ></div>
        </div>
        <div className="relative sm:pb-2">
          <p id={`${modalId}-title`} className="text-center text-lg">
            {props.title}
          </p>
          {/* Desktop close button */}
          <button
            onClick={props.close}
            className="hidden h-8 w-8 items-center justify-center rounded-md opacity-70 transition-opacity hover:bg-white/10 hover:opacity-100 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:outline-none sm:flex"
            aria-label="Close modal"
            style={{
              position: "absolute",
              top: "-5px",
              right: "0",
            }}
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        {/* eslint-disable react-hooks/refs -- False positives: scrollRef is passed as ref prop, children/footer are ReactNode props */}
        <div ref={props.scrollRef} className="flex-1 overflow-y-auto">
          {props.children}
        </div>
        {props.footer && <div className="flex-shrink-0">{props.footer}</div>}
        {/* eslint-enable react-hooks/refs */}
      </div>
    </>
  );
}
