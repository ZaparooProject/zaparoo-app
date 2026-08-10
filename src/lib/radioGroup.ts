import type { KeyboardEvent } from "react";

const RADIO_SELECTOR =
  '[role="radio"]:not([disabled]):not([aria-disabled="true"])';

/**
 * Adds APG roving-focus keyboard behavior to a custom radio group.
 * Radio buttons retain ownership of checked state and click handling.
 */
export function handleRadioGroupKeyDown(event: KeyboardEvent<HTMLElement>) {
  const radios = Array.from(
    event.currentTarget.querySelectorAll<HTMLElement>(RADIO_SELECTOR),
  );
  const target =
    event.target instanceof Element
      ? event.target.closest<HTMLElement>(RADIO_SELECTOR)
      : null;
  const currentIndex = target ? radios.indexOf(target) : -1;
  if (currentIndex < 0 || radios.length === 0) return;

  let nextIndex: number | undefined;
  switch (event.key) {
    case "ArrowRight":
    case "ArrowDown":
      nextIndex = (currentIndex + 1) % radios.length;
      break;
    case "ArrowLeft":
    case "ArrowUp":
      nextIndex = (currentIndex - 1 + radios.length) % radios.length;
      break;
    case "Home":
      nextIndex = 0;
      break;
    case "End":
      nextIndex = radios.length - 1;
      break;
  }

  if (nextIndex === undefined) return;
  const nextRadio = radios[nextIndex];
  if (!nextRadio) return;

  event.preventDefault();
  nextRadio.focus();
  nextRadio.click();
}
