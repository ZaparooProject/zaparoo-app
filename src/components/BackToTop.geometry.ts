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
