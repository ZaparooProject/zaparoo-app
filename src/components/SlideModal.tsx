import { ReactNode, RefObject, useEffect, useId, useRef } from "react";
import classNames from "classnames";
import { X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useStatusStore } from "@/lib/store.ts";
import { useSmartSwipe } from "@/hooks/useSmartSwipe";
import { useBackButtonHandler } from "@/hooks/useBackButtonHandler";
import { useSlideModalManager } from "@/hooks/useSlideModalManager";
import { useFocusTrap } from "@/hooks/useFocusTrap";
import { useHaptics } from "@/hooks/useHaptics";

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
  const { t } = useTranslation();
  const modalId = useId();
  const modalManager = useSlideModalManager();
  const modalRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLParagraphElement>(null);
  const { impact } = useHaptics();
  const wasOpenRef = useRef(props.isOpen);

  // Haptic feedback on modal open/close
  useEffect(() => {
    if (props.isOpen !== wasOpenRef.current) {
      impact("medium");
      wasOpenRef.current = props.isOpen;
    }
  }, [props.isOpen, impact]);

  // Trap focus within modal when open
  useFocusTrap({
    isActive: props.isOpen,
    containerRef: modalRef,
    restoreFocus: true,
    autoFocus: false, // We'll focus the title ourselves
  });

  // Focus the title when modal opens (better for screen readers)
  useEffect(() => {
    if (props.isOpen && titleRef.current) {
      titleRef.current.setAttribute("tabindex", "-1");
      titleRef.current.focus();
    }
  }, [props.isOpen]);

  const swipeHandlers = useSmartSwipe({
    onSwipeDown: props.close,
    preventScrollOnSwipe: false,
    swipeThreshold: 30,
    velocityThreshold: 0.2,
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
      {/* Overlay - click to dismiss, hidden from screen readers */}
      <div
        data-testid="modal-overlay"
        className="fixed inset-0 z-40 bg-black/50 transition-opacity duration-200 ease-in-out"
        style={{
          opacity: props.isOpen ? 1 : 0,
          pointerEvents: props.isOpen ? "auto" : "none",
        }}
        onClick={props.close}
        aria-hidden="true"
      />

      {/* Modal */}
      <div
        ref={modalRef}
        role="dialog"
        // eslint-disable-next-line react-hooks/refs -- props.isOpen is a boolean prop, not a ref
        aria-modal={props.isOpen}
        aria-hidden={!props.isOpen}
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
          "px-3",
          "pt-3",
          "mix-blend-normal",
          "backdrop-blur-lg",
          props.className,
        )}
        style={{
          bottom: props.isOpen ? "0" : "-100vh",
          transition: "bottom 0.2s ease-in-out",
          paddingBottom: `calc(${safeInsets.bottom} + 0.75rem)`,
          ...(props.fixedHeight
            ? { height: props.fixedHeight }
            : { maxHeight: `calc(100vh - ${safeInsets.top} - 75px)` }),
        }}
      >
        {/* Swipeable header area - includes drag handle and title on mobile */}
        <div
          className="sm:hidden"
          style={{ touchAction: "pan-x" }}
          {...swipeHandlers}
        >
          <div className="flex w-full justify-center pb-3">
            {/* Drag handle - accessible button for TalkBack, visual bar for sighted users */}
            <button
              type="button"
              onClick={props.close}
              aria-label={t("nav.close")}
              className="h-[5px] w-[80px] rounded-full bg-[#00E0FF] focus:ring-2 focus:ring-white/50 focus:outline-none"
            />
          </div>
          <div className="relative pb-2">
            <p
              ref={titleRef}
              id={`${modalId}-title`}
              className="text-center text-lg outline-none"
            >
              {props.title}
            </p>
          </div>
        </div>
        {/* Desktop header - not swipeable */}
        <div className="relative hidden pb-2 sm:block">
          <p className="text-center text-lg outline-none">{props.title}</p>
          <button
            onClick={props.close}
            className="absolute top-[-5px] right-0 flex h-8 w-8 items-center justify-center rounded-md opacity-70 transition-opacity hover:bg-white/10 hover:opacity-100 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:outline-none"
            aria-label={t("nav.close")}
          >
            <X className="h-5 w-5" aria-hidden="true" />
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
