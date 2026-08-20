import { useEffect, useRef, RefObject } from "react";

const FOCUSABLE_SELECTORS = [
  "a[href]",
  "button:not([disabled])",
  "textarea:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  '[contenteditable="true"]',
  '[tabindex]:not([tabindex="-1"])',
].join(", ");

interface InertState {
  count: number;
  originallyInert: boolean;
}

const inertStates = new WeakMap<HTMLElement, InertState>();
const activeFocusTraps: object[] = [];

function registerFocusTrap(token: object): () => void {
  activeFocusTraps.push(token);
  return () => {
    const index = activeFocusTraps.lastIndexOf(token);
    if (index >= 0) activeFocusTraps.splice(index, 1);
  };
}

function setInert(element: HTMLElement): () => void {
  const current = inertStates.get(element);
  if (current) {
    current.count += 1;
  } else {
    inertStates.set(element, {
      count: 1,
      originallyInert: element.inert,
    });
    element.inert = true;
  }

  return () => {
    const state = inertStates.get(element);
    if (!state) return;

    state.count -= 1;
    if (state.count === 0) {
      // React may have removed inert while this trap was deactivating. Do not
      // overwrite that newer owner state with the value captured on activation.
      if (element.inert) element.inert = state.originallyInert;
      inertStates.delete(element);
    }
  };
}

function isolateContainer(container: HTMLElement): () => void {
  const restoreFunctions: Array<() => void> = [];
  let current: HTMLElement = container;

  while (current.parentElement) {
    const parent = current.parentElement;
    for (const sibling of Array.from(parent.children)) {
      if (
        sibling instanceof HTMLElement &&
        sibling !== current &&
        !sibling.hasAttribute("data-focus-trap-exempt")
      ) {
        restoreFunctions.push(setInert(sibling));
      }
    }

    if (parent === document.body) break;
    current = parent;
  }

  return () => {
    for (const restore of restoreFunctions.reverse()) restore();
  };
}

function canRestoreFocus(element: HTMLElement): boolean {
  if (!element.isConnected) return false;
  if (element.closest('[aria-hidden="true"], [inert], [hidden]')) return false;
  if (element instanceof HTMLButtonElement && element.disabled) return false;
  if (element instanceof HTMLInputElement && element.disabled) return false;
  if (element instanceof HTMLSelectElement && element.disabled) return false;
  if (element instanceof HTMLTextAreaElement && element.disabled) return false;
  return true;
}

interface UseFocusTrapOptions {
  /** Whether the focus trap is active */
  isActive: boolean;
  /** Ref to the container element that should trap focus */
  containerRef: RefObject<HTMLElement | null>;
  /** Whether to restore focus to the previously focused element on deactivation */
  restoreFocus?: boolean;
  /** Whether to focus the first focusable element when activated */
  autoFocus?: boolean;
  /** Called when Escape is pressed while the trap is active */
  onEscape?: () => void;
  /** Whether content outside the container should be made inert */
  inertBackground?: boolean;
}

/**
 * Hook that traps keyboard focus within a container element.
 * Useful for modals, dialogs, and other overlay components.
 */
export function useFocusTrap({
  isActive,
  containerRef,
  restoreFocus = true,
  autoFocus = true,
  onEscape,
  inertBackground = true,
}: UseFocusTrapOptions): void {
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);
  const onEscapeRef = useRef(onEscape);

  useEffect(() => {
    onEscapeRef.current = onEscape;
  }, [onEscape]);

  useEffect(() => {
    if (!isActive) return;

    const container = containerRef.current;
    if (!container) return;

    const trapToken = {};
    const unregisterFocusTrap = registerFocusTrap(trapToken);

    // Store focus before isolating the modal from the surrounding page.
    if (restoreFocus && document.activeElement instanceof HTMLElement) {
      previouslyFocusedRef.current = document.activeElement;
    }

    const restoreIsolation = inertBackground
      ? isolateContainer(container)
      : undefined;

    // Get all focusable elements within the container
    const getFocusableElements = (): HTMLElement[] => {
      return Array.from(
        container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTORS),
      ).filter((el) => {
        // Filter out elements that are hidden or not visible
        return el.offsetParent !== null;
      });
    };

    // Focus the first focusable element
    if (autoFocus) {
      const focusableElements = getFocusableElements();
      const firstFocusable = focusableElements[0];
      if (firstFocusable) {
        // Small delay to ensure the modal is fully rendered
        requestAnimationFrame(() => {
          firstFocusable.focus();
        });
      }
    }

    // Handle keyboard navigation and dismissal while the trap is active.
    const handleKeyDown = (event: KeyboardEvent) => {
      if (activeFocusTraps.at(-1) !== trapToken) return;

      if (event.key === "Escape" && onEscapeRef.current) {
        event.preventDefault();
        onEscapeRef.current();
        return;
      }

      if (event.key !== "Tab") return;

      const focusableElements = getFocusableElements();
      if (focusableElements.length === 0) {
        event.preventDefault();
        container.focus();
        return;
      }

      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];
      if (!firstElement || !lastElement) return;

      if (!container.contains(document.activeElement)) {
        event.preventDefault();
        (event.shiftKey ? lastElement : firstElement).focus();
      } else if (event.shiftKey && document.activeElement === firstElement) {
        event.preventDefault();
        lastElement.focus();
      } else if (!event.shiftKey && document.activeElement === lastElement) {
        event.preventDefault();
        firstElement.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      unregisterFocusTrap();
      restoreIsolation?.();

      const previouslyFocused = previouslyFocusedRef.current;
      previouslyFocusedRef.current = null;
      if (!restoreFocus) return;
      if (previouslyFocused && canRestoreFocus(previouslyFocused)) {
        previouslyFocused.focus();
        return;
      }

      const anotherDialog = Array.from(
        document.querySelectorAll<HTMLElement>(
          '[role="dialog"][aria-modal="true"]',
        ),
      ).some((dialog) => dialog !== container);
      if (!anotherDialog) {
        const pageHeading =
          document.querySelector<HTMLElement>("#main-content h1");
        pageHeading?.focus({ preventScroll: true });
      }
    };
  }, [isActive, containerRef, restoreFocus, autoFocus, inertBackground]);
}
