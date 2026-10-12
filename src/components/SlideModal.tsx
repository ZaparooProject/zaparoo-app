import {
  ReactNode,
  RefObject,
  useCallback,
  useSyncExternalStore,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
} from "react";
import classNames from "classnames";
import { XIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useStatusStore } from "@/lib/store.ts";
import { useBackButtonHandler } from "@/hooks/useBackButtonHandler";
import { useSlideModalManager } from "@/hooks/useSlideModalManager";
import { useFocusTrap } from "@/hooks/useFocusTrap";
import { useHaptics } from "@/hooks/useHaptics";
import { useScreenReaderEnabled } from "@/hooks/useScreenReaderEnabled";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { SkipLink } from "@/components/SkipLink";

const OPEN_TRANSFORM = "translate3d(0, 0, 0)";
const CLOSED_TRANSFORM = "translate3d(0, 100%, 0)";

// Individual CSS translate is unavailable in Core's legacy browser targets.
function modalTransform(open: boolean, wide: boolean): string {
  if (!wide) return open ? OPEN_TRANSFORM : CLOSED_TRANSFORM;
  return "translate3d(-50%, -50%, 0)";
}

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
  /** Complex search/chooser workspaces can use more width; forms stay bounded. */
  layout?: "default" | "workspace";
  scrollClassName?: string;
  /** Opt-in nonmodal supporting region; feature content stays mounted through resize. */
  presentation?: "modal" | "pane";
  /** Home sections keep their heading outside the material owned by their body. */
  paneLayout?: "card" | "section";
  /** Do not replace another active dialog solely because a pane collapses. */
  suspendWhenCovered?: boolean;
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
  const isPane = props.presentation === "pane";
  const wideDialog = useMediaQuery("(min-width: 760px)");
  const isSection = isPane && props.paneLayout === "section";
  const subscribe = useCallback(
    (listener: () => void) => modalManager.subscribe?.(listener) ?? (() => {}),
    [modalManager],
  );
  const getCovered = useCallback(
    () =>
      Boolean(
        props.suspendWhenCovered && modalManager.hasOpenModalExcept?.(modalId),
      ),
    [props.suspendWhenCovered, modalManager, modalId],
  );
  const covered = useSyncExternalStore(subscribe, getCovered, () => false);
  const surfaceOpen = props.isOpen && (isPane || !covered);
  const modalOpen = surfaceOpen && !isPane;
  // Sheets below 760px dismiss through their drag handle; floating dialogs
  // and docked panes show the close button instead.
  const hasCloseButton = isPane || wideDialog;

  // Registration and Back handling read the latest close callback through a
  // ref, so an inline `close` prop does not re-register an open modal.
  useLayoutEffect(() => {
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
    isActive: modalOpen,
    containerRef: modalRef,
    restoreFocus: !isPane,
    autoFocus: false, // The dialog heading receives initial focus.
    onEscape: dismissible ? props.close : undefined,
  });

  // Focus the title when modal opens (better for screen readers)
  useEffect(() => {
    if (modalOpen && !modalRef.current?.contains(document.activeElement)) {
      titleRef.current?.focus();
    }
  }, [modalOpen]);

  // Install drag handling before paint so a sheet revealed after a covering
  // modal closes cannot briefly appear without responding to touchstart.
  useLayoutEffect(() => {
    const modal = modalRef.current;
    if (!modal) return;

    if (isPane) {
      modal.removeAttribute("data-dragging");
      modal.style.transition = "none";
      modal.style.transform = "none";
      return;
    }

    if (!surfaceOpen || screenReaderEnabled || !dismissible || wideDialog) {
      modal.removeAttribute("data-dragging");
      modal.style.transition = wideDialog ? "none" : DRAG_TRANSITION;
      modal.style.transform = modalTransform(surfaceOpen, wideDialog);
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
  }, [
    surfaceOpen,
    isPane,
    screenReaderEnabled,
    dismissible,
    wideDialog,
    impact,
  ]);

  // Handle Android back button
  useBackButtonHandler(
    "slide-modal",
    () => {
      if (modalOpen) {
        if (dismissible) closeRef.current();
        return true; // Consume the event
      }
      return false; // Let other handlers process it
    },
    100, // High priority
    modalOpen, // Supporting panes never consume modal-priority Back.
  );

  // Register before paint so a blocking modal can reject later sheets without a visible or focusable flash.
  useLayoutEffect(() => {
    if (modalOpen) {
      const accepted = modalManager.closeAllExcept(modalId);
      if (!accepted) {
        closeRef.current();
        return;
      }

      modalManager.registerModal(modalId, () => closeRef.current(), {
        blocking: !dismissible,
        overlay: true,
      });

      return () => {
        modalManager.unregisterModal(modalId);
      };
    }

    modalManager.unregisterModal(modalId);
  }, [modalOpen, modalId, modalManager, dismissible]);

  const safeInsets = useStatusStore((state) => state.safeInsets) ?? {
    top: "0px",
    bottom: "0px",
    left: "0px",
    right: "0px",
  };
  const safeLeft = safeInsets.left ?? "0px";
  const safeRight = safeInsets.right ?? "0px";

  return (
    <>
      {/* Standalone managers retain local backdrop ownership. */}
      {!modalManager.ownsOverlay && (
        <div
          data-testid="modal-overlay"
          data-focus-trap-exempt
          className="fixed inset-0 z-40 bg-black/60 transition-opacity duration-200 ease-in-out"
          style={{
            opacity: modalOpen ? 1 : 0,
            pointerEvents: modalOpen ? "auto" : "none",
          }}
          onClick={dismissible ? props.close : undefined}
          aria-hidden="true"
        />
      )}

      {/* Modal */}
      <div
        ref={modalRef}
        role={isPane ? "region" : "dialog"}
        aria-modal={modalOpen || undefined}
        aria-hidden={!surfaceOpen}
        aria-labelledby={`${modalId}-title`}
        inert={!surfaceOpen || covered}
        tabIndex={-1}
        onKeyDown={(event) => {
          if (
            !isPane ||
            !dismissible ||
            event.defaultPrevented ||
            event.key !== "Escape"
          )
            return;
          const target = event.target;
          if (
            target instanceof Element &&
            target.closest("input, textarea, select, [contenteditable='true']")
          )
            return;
          event.preventDefault();
          event.stopPropagation();
          props.close();
        }}
        className={
          isPane
            ? classNames(
                isSection
                  ? "slide-modal-section flex w-full min-w-0 flex-col"
                  : "library-details-panel wui-card",
                props.className,
              )
            : classNames(
                "fixed",
                "z-50",
                "flex",
                "flex-col",
                "max-w-2xl", // Bounded to 42rem; workspace dialogs widen inline.
                // Sheets center through auto margins, so no transform is needed.
                wideDialog
                  ? "rounded-lg"
                  : "inset-x-0 mx-auto w-full rounded-t-lg border-b-0",
                "shadow-[0_-8px_32px_var(--material-shadow),inset_0_1px_0_var(--material-highlight)]",
                "border",
                "border-solid",
                "border-border",
                "bg-surface-raised",
                "px-4",
                "pt-3",
                "mix-blend-normal",
                props.className,
              )
        }
        style={
          isPane
            ? {
                display: surfaceOpen ? undefined : "none",
                transform: "none",
                transition: "none",
              }
            : {
                bottom: wideDialog ? undefined : 0,
                top: wideDialog
                  ? `calc((100% + ${safeInsets.top} - ${safeInsets.bottom}) / 2)`
                  : undefined,
                left: wideDialog
                  ? `calc((100% + ${safeLeft} - ${safeRight}) / 2)`
                  : undefined,
                width: wideDialog
                  ? `calc(100% - ${safeLeft} - ${safeRight} - 2rem)`
                  : undefined,
                maxWidth:
                  wideDialog && props.layout === "workspace"
                    ? "60rem"
                    : undefined,
                // Closed floating dialogs cannot rely on translating below the viewport.
                visibility: wideDialog && !surfaceOpen ? "hidden" : undefined,
                transform: modalTransform(surfaceOpen, wideDialog),
                transition: wideDialog ? "none" : DRAG_TRANSITION,
                willChange: surfaceOpen && !wideDialog ? "transform" : "auto",
                pointerEvents: surfaceOpen ? "auto" : "none",
                boxShadow: surfaceOpen ? undefined : "none",
                paddingBottom: wideDialog
                  ? "1rem"
                  : `calc(${safeInsets.bottom} + 1rem)`,
                maxHeight: wideDialog
                  ? `min(80vh, calc(100vh - ${safeInsets.top} - ${safeInsets.bottom} - 2rem))`
                  : `min(80vh, calc(100vh - ${safeInsets.top} - 75px))`,
                ...(props.fixedHeight ? { height: props.fixedHeight } : {}),
              }
        }
      >
        {/* Swipeable handle and title area */}
        <div style={{ touchAction: "pan-x pinch-zoom" }}>
          {/* Mobile drag handle */}
          {dismissible && !isPane && !wideDialog && (
            <div className="-mt-3">
              <button
                type="button"
                onClick={props.close}
                aria-label={t("nav.close")}
                data-slide-modal-drag-handle
                className="focus-visible:outline-ring relative flex h-[29px] w-full items-center justify-center bg-transparent after:absolute after:inset-x-0 after:-inset-y-[10px] after:content-[''] focus-visible:outline-2 focus-visible:-outline-offset-2"
              >
                <span
                  aria-hidden="true"
                  className="bg-muted-foreground h-1 w-12 rounded-full"
                />
              </button>
            </div>
          )}
          {/* Shared visible title and desktop close action */}
          <div
            className={classNames("relative", {
              "pb-2": !isSection,
              "min-h-11": !isSection && hasCloseButton,
            })}
          >
            <h2
              ref={titleRef}
              id={`${modalId}-title`}
              tabIndex={-1}
              style={
                !isPane && wideDialog
                  ? {
                      // Align title with the glyph, not the larger close target.
                      paddingLeft: "calc(0.625rem - 7px)",
                      minHeight: "calc(3rem - 14px)",
                      display: "flex",
                      alignItems: "center",
                    }
                  : undefined
              }
              className={
                isSection
                  ? "text-muted-foreground mb-2 font-bold wrap-anywhere capitalize outline-none"
                  : classNames(
                      "text-lg leading-snug font-semibold tracking-tight wrap-anywhere outline-none",
                      hasCloseButton ? "pr-10 text-left" : "text-center",
                    )
              }
            >
              {props.title}
            </h2>
            {dismissible && hasCloseButton && (
              <button
                type="button"
                onClick={props.close}
                className="hover:before:bg-foreground/10 focus-visible:outline-ring absolute top-[-7px] right-0 flex h-12 w-12 items-center justify-center rounded-full opacity-70 transition-opacity before:absolute before:inset-0.5 before:rounded-full before:content-[''] hover:opacity-100 focus-visible:outline-2 focus-visible:outline-offset-1"
                style={
                  !isPane && wideDialog
                    ? {
                        // Shell side padding exceeds top padding by 0.25rem.
                        right: "calc(-0.25rem - 7px)",
                      }
                    : undefined
                }
                aria-label={t("nav.close")}
              >
                <XIcon className="relative h-5 w-5" aria-hidden="true" />
              </button>
            )}
          </div>
        </div>
        {props.footer && props.footerSkipLabel && (
          <SkipLink targetId={footerId} label={props.footerSkipLabel} />
        )}
        {/* eslint-disable react-hooks/refs -- False positives: scrollRef is passed as ref prop, children/footer are ReactNode props */}
        <div
          ref={props.scrollRef}
          className={classNames(
            // The 4px inset (cancelled by the negative side and top margins)
            // keeps focus outlines from being clipped by this scroll container.
            // No bottom margin: it would pull the footer over the content.
            "-mx-1 -mt-1 min-h-0 flex-1 overflow-y-auto p-1",
            props.scrollClassName,
          )}
        >
          {props.children}
        </div>
        {props.footer && (
          <div
            id={footerId}
            tabIndex={props.footerSkipLabel ? -1 : undefined}
            className="border-border flex max-h-[33dvh] flex-shrink-0 flex-col border-t border-solid"
          >
            {/* Paint into the existing shell gutters without moving the actions.
                The inner viewport still scrolls on short or zoomed screens. */}
            <div className="-mx-4 -mb-4 min-h-0 scroll-px-4 scroll-pt-2 scroll-pb-4 overflow-y-auto overscroll-contain px-4 pt-2 pb-4">
              {props.footer}
            </div>
          </div>
        )}
        {/* eslint-enable react-hooks/refs */}
      </div>
    </>
  );
}
