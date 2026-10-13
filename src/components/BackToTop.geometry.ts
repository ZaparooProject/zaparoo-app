/** Distance to the page's client viewport, excluding its scrollbar/border. */
export function measurePageRightGap(
  container: HTMLElement,
  viewportWidth: number,
): number {
  const bounds = container.getBoundingClientRect();
  const contentRight =
    container.clientWidth > 0
      ? bounds.left + container.clientLeft + container.clientWidth
      : bounds.right;
  return bounds.width > 0 ? Math.max(0, viewportWidth - contentRight) : 0;
}

/**
 * Width a dialog's scroll area gives up to a classic scrollbar. The button
 * moves in by this much so it stays on the content's right edge instead of
 * covering the scrollbar. Overlay scrollbars take no room, so touch layouts
 * report 0 and keep the plain edge margin.
 */
export function measureDialogScrollbar(container: HTMLElement): number {
  return Math.max(
    0,
    container.offsetWidth - container.clientLeft * 2 - container.clientWidth,
  );
}
