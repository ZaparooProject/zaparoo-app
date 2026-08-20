import {
  ReactNode,
  RefObject,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
} from "react";
import classNames from "classnames";
import { X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useStatusStore } from "@/lib/store.ts";
import { useBackButtonHandler } from "@/hooks/useBackButtonHandler";
import { useSlideModalManager } from "@/hooks/useSlideModalManager";
import { useFocusTrap } from "@/hooks/useFocusTrap";
import { useHaptics } from "@/hooks/useHaptics";
import { useScreenReaderEnabled } from "@/hooks/useScreenReaderEnabled";
import { SkipLink } from "@/components/SkipLink";

const OPEN_TRANSFORM = "translate3d(0, 0, 0)";
const CLOSED_TRANSFORM = "translate3d(0, 100%, 0)";
const DRAG_TRANSITION = "transform 0.2s ease-in-out";
const DRAG_START_THRESHOLD_PX = 8;
const DRAG_CLOSE_THRESHOLD = 0.25;
const DRAG_VELOCITY_THRESHOLD = 0.4;
const DRAG_FLICK_MIN_DISTANCE_PX = 30;
const DRAG_EXCLUDED_SELECTOR = [
  "a[href]",
  "button",
  "input",
  "textarea",
  "select",
  '[contenteditable]:not([contenteditable="false"])',
  '[draggable="true"]',
  "[data-slide-modal-no-drag]",
  '[role="button"]',
  '[role="checkbox"]',
  '[role="combobox"]',
  '[role="link"]',
  '[role="menuitem"]',
  '[role="option"]',
  '[role="radio"]',
  '[role="slider"]',
  '[role="spinbutton"]',
  '[role="switch"]',
  '[role="tab"]',
  '[role="textbox"]',
  '[role="treeitem"]',
].join(", ");

interface ModalDragState {
  startX: number;
  startY: number;
  lastY: number;
  startTime: number;
  dragging: boolean;
  scrollElement: HTMLElement | null;
  scrollTopAtStart: number;
}

function isDragExcluded(target: Element): boolean {
  if (target.closest("[data-slide-modal-drag-handle]")) return false;
  return target.closest(DRAG_EXCLUDED_SELECTOR) !== null;
}

function findScrollableAncestor(
  target: Element,
  boundary: HTMLElement,
): HTMLElement | null {
  let current: HTMLElement | null =
    target instanceof HTMLElement ? target : target.parentElement;

  while (current && current !== boundary) {
    const overflowY = window.getComputedStyle(current).overflowY;
    if (
      current.scrollHeight > current.clientHeight &&
      (overflowY === "auto" || overflowY === "scroll")
    ) {
      return current;
    }
    current = current.parentElement;
  }

  return null;
}

export function SlideModal(props: {
  isOpen: boolean;
  close: () => void;
  title: string;
  children: ReactNode;
  className?: string;
  scrollRef?: RefObject<HTMLDivElement | null>;
  /** Persistent actions shown below the body, with overflow fallback on short viewports. */
  footer?: ReactNode;
  /** Optional label for an early link that moves focus to a long modal's footer. */
  footerSkipLabel?: string;
  /** Whether overlay, Escape, back, close buttons, and drag may dismiss the modal. */
  dismissible?: boolean;
  fixedHeight?: string;
}) {
  const { t } = useTranslation();
  const modalId = useId();
  const footerId = `${modalId}-footer`;
  const modalManager = useSlideModalManager();
  const modalRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const closeRef = useRef(props.close);
  const { impact } = useHaptics();
  const screenReaderEnabled = useScreenReaderEnabled();
  const wasOpenRef = useRef(props.isOpen);
  const dismissible = props.dismissible ?? true;
  const requestedOpen = props.isOpen;
  const requestClose = props.close;

  useEffect(() => {
    closeRef.current = props.close;
  }, [props.close]);

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
    autoFocus: false, // The dialog heading receives initial focus.
    onEscape: dismissible ? props.close : undefined,
  });

  // Focus the title when modal opens (better for screen readers)
  useEffect(() => {
    if (props.isOpen) titleRef.current?.focus();
  }, [props.isOpen]);

  // Install drag handling before paint so a sheet revealed after a covering
  // modal closes cannot briefly appear without responding to touchstart.
  useLayoutEffect(() => {
    const modal = modalRef.current;
    if (!modal) return;

    if (!props.isOpen || screenReaderEnabled || !dismissible) {
      modal.removeAttribute("data-dragging");
      modal.style.transition = DRAG_TRANSITION;
      modal.style.transform = props.isOpen ? OPEN_TRANSFORM : CLOSED_TRANSFORM;
      return;
    }

    let dragState: ModalDragState | null = null;
    let dragFrame: number | null = null;
    let pendingOffset = 0;

    const cancelDragFrame = () => {
      if (dragFrame === null) return;
      window.cancelAnimationFrame(dragFrame);
      dragFrame = null;
    };

    const applyDragOffset = () => {
      modal.style.transform = `translate3d(0, ${pendingOffset}px, 0)`;
      dragFrame = null;
    };

    const scheduleDragOffset = (offset: number) => {
      pendingOffset = Math.max(0, offset);
      if (dragFrame !== null) return;
      dragFrame = window.requestAnimationFrame(applyDragOffset);
    };

    const finishDrag = (shouldClose: boolean) => {
      if (!dragState?.dragging) {
        dragState = null;
        return;
      }

      cancelDragFrame();
      modal.removeAttribute("data-dragging");
      modal.style.transition = DRAG_TRANSITION;
      // Controlled callers may reject close requests while busy.
      // Keep the sheet visible until the isOpen prop confirms closure.
      modal.style.transform = OPEN_TRANSFORM;
      dragState = null;

      if (shouldClose) {
        impact("light");
        closeRef.current();
      }
    };

    const handleTouchStart = (event: TouchEvent) => {
      const touch = event.touches[0];
      const target = event.target;
      if (
        event.touches.length !== 1 ||
        !touch ||
        !(target instanceof Element) ||
        isDragExcluded(target) ||
        window.getSelection()?.toString()
      ) {
        finishDrag(false);
        return;
      }

      const scrollElement = findScrollableAncestor(target, modal);
      dragState = {
        startX: touch.clientX,
        startY: touch.clientY,
        lastY: touch.clientY,
        startTime: event.timeStamp,
        dragging: false,
        scrollElement,
        scrollTopAtStart: scrollElement?.scrollTop ?? 0,
      };
    };

    const handleTouchMove = (event: TouchEvent) => {
      if (!dragState) return;
      const touch = event.touches[0];
      if (event.touches.length !== 1 || !touch) {
        finishDrag(false);
        return;
      }

      dragState.lastY = touch.clientY;
      const deltaX = touch.clientX - dragState.startX;
      const deltaY = touch.clientY - dragState.startY;

      if (!dragState.dragging) {
        if (
          Math.abs(deltaX) < DRAG_START_THRESHOLD_PX &&
          Math.abs(deltaY) < DRAG_START_THRESHOLD_PX
        ) {
          return;
        }

        if (
          deltaY <= 0 ||
          Math.abs(deltaX) > Math.abs(deltaY) ||
          dragState.scrollTopAtStart > 0 ||
          (dragState.scrollElement?.scrollTop ?? 0) > 0
        ) {
          dragState = null;
          return;
        }

        dragState.dragging = true;
        modal.setAttribute("data-dragging", "true");
        modal.style.transition = "none";
      }

      if (event.cancelable) event.preventDefault();
      scheduleDragOffset(deltaY);
    };

    const handleTouchEnd = (event: TouchEvent) => {
      if (!dragState?.dragging) {
        dragState = null;
        return;
      }

      const changedTouch = event.changedTouches[0];
      if (changedTouch) dragState.lastY = changedTouch.clientY;

      const distance = Math.max(0, dragState.lastY - dragState.startY);
      const duration = Math.max(event.timeStamp - dragState.startTime, 1);
      const velocity = distance / duration;
      const modalHeight = modal.getBoundingClientRect().height;
      const visibleHeight =
        modalHeight > 0
          ? Math.min(modalHeight, window.innerHeight)
          : window.innerHeight;
      const passedDistanceThreshold =
        distance >= visibleHeight * DRAG_CLOSE_THRESHOLD;
      const passedVelocityThreshold =
        distance >= DRAG_FLICK_MIN_DISTANCE_PX &&
        velocity > DRAG_VELOCITY_THRESHOLD;

      finishDrag(passedDistanceThreshold || passedVelocityThreshold);
    };

    const handleTouchCancel = () => finishDrag(false);

    modal.addEventListener("touchstart", handleTouchStart, { passive: true });
    modal.addEventListener("touchmove", handleTouchMove, { passive: false });
    modal.addEventListener("touchend", handleTouchEnd, { passive: true });
    modal.addEventListener("touchcancel", handleTouchCancel, { passive: true });

    return () => {
      cancelDragFrame();
      modal.removeAttribute("data-dragging");
      modal.removeEventListener("touchstart", handleTouchStart);
      modal.removeEventListener("touchmove", handleTouchMove);
      modal.removeEventListener("touchend", handleTouchEnd);
      modal.removeEventListener("touchcancel", handleTouchCancel);
    };
  }, [props.isOpen, screenReaderEnabled, dismissible, impact]);

  // Handle Android back button
  useBackButtonHandler(
    "slide-modal",
    () => {
      if (props.isOpen) {
        if (dismissible) props.close();
        return true; // Consume the event
      }
      return false; // Let other handlers process it
    },
    100, // High priority
    props.isOpen, // Only active when modal is open
  );

  // Register before paint so a blocking modal can reject later sheets without a visible or focusable flash.
  useLayoutEffect(() => {
    if (requestedOpen) {
      const accepted = modalManager.closeAllExcept(modalId);
      if (!accepted) {
        requestClose();
        return;
      }

      modalManager.registerModal(modalId, requestClose, {
        blocking: !dismissible,
      });

      return () => {
        modalManager.unregisterModal(modalId);
      };
    }

    modalManager.unregisterModal(modalId);
  }, [requestedOpen, requestClose, modalId, modalManager, dismissible]);

  const safeInsets = useStatusStore((state) => state.safeInsets) ?? {
    top: "0px",
    bottom: "0px",
  };

  return (
    <>
      {/* Overlay - click to dismiss, hidden from screen readers */}
      <div
        data-testid="modal-overlay"
        data-focus-trap-exempt
        className="fixed inset-0 z-40 bg-black/50 transition-opacity duration-200 ease-in-out"
        style={{
          opacity: props.isOpen ? 1 : 0,
          pointerEvents: props.isOpen ? "auto" : "none",
        }}
        onClick={dismissible ? props.close : undefined}
        aria-hidden="true"
      />

      {/* Modal */}
      <div
        ref={modalRef}
        role="dialog"
        aria-modal={props.isOpen || undefined}
        aria-hidden={!props.isOpen}
        aria-labelledby={`${modalId}-title`}
        inert={!props.isOpen}
        tabIndex={-1}
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
          "bg-[rgb(17,25,40)]",
          "px-3",
          "pt-3",
          "mix-blend-normal",
          props.className,
        )}
        style={{
          bottom: 0,
          transform: props.isOpen ? OPEN_TRANSFORM : CLOSED_TRANSFORM,
          transition: DRAG_TRANSITION,
          willChange: props.isOpen ? "transform" : "auto",
          pointerEvents: props.isOpen ? "auto" : "none",
          paddingBottom: `calc(${safeInsets.bottom} + 0.75rem)`,
          maxHeight: `min(80vh, calc(100vh - ${safeInsets.top} - 75px))`,
          ...(props.fixedHeight ? { height: props.fixedHeight } : {}),
        }}
      >
        {/* Swipeable handle and title area */}
        <div style={{ touchAction: "pan-x pinch-zoom" }}>
          {/* Mobile drag handle */}
          {dismissible && (
            <div className="-mt-3 sm:hidden">
              <button
                type="button"
                onClick={props.close}
                aria-label={t("nav.close")}
                data-slide-modal-drag-handle
                className="flex h-[29px] w-full items-center justify-center bg-transparent focus-visible:ring-2 focus-visible:ring-white/50 focus-visible:outline-none"
              >
                <span
                  aria-hidden="true"
                  className="h-[5px] w-[80px] rounded-full bg-[#00E0FF]"
                />
              </button>
            </div>
          )}
          {/* Shared visible title and desktop close action */}
          <div className="relative pb-2">
            <h2
              ref={titleRef}
              id={`${modalId}-title`}
              tabIndex={-1}
              className="text-center text-lg outline-none"
            >
              {props.title}
            </h2>
            {dismissible && (
              <button
                type="button"
                onClick={props.close}
                className="absolute top-[-5px] right-0 hidden h-8 w-8 items-center justify-center rounded-md opacity-70 transition-opacity hover:bg-white/10 hover:opacity-100 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:outline-none sm:flex"
                aria-label={t("nav.close")}
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            )}
          </div>
        </div>
        {props.footer && props.footerSkipLabel && (
          <SkipLink targetId={footerId} label={props.footerSkipLabel} />
        )}
        {/* eslint-disable react-hooks/refs -- False positives: scrollRef is passed as ref prop, children/footer are ReactNode props */}
        <div ref={props.scrollRef} className="flex-1 overflow-y-auto">
          {props.children}
        </div>
        {props.footer && (
          <div
            id={footerId}
            tabIndex={props.footerSkipLabel ? -1 : undefined}
            className="max-h-[33dvh] flex-shrink-0 overflow-y-auto overscroll-contain border-t border-solid border-[rgba(255,255,255,0.13)] pt-3"
          >
            {props.footer}
          </div>
        )}
        {/* eslint-enable react-hooks/refs */}
      </div>
    </>
  );
}
