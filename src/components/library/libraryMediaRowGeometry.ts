/** Row and artwork sizes shared by every list of Library media rows. */
const ROW_HEIGHT = 88;
const ROW_HEIGHT_WITH_SYSTEM = 96;
const ARTWORK_SIZE = 64;

/**
 * Minimum heights for a list of Library media rows. Heights scale with text
 * zoom, and the first row gives up its leading inset so the list starts at the
 * page's own content inset.
 */
export function libraryMediaRowGeometry(
  showSystemName: boolean,
  textZoomLevel: number,
) {
  const baseRowHeight = showSystemName ? ROW_HEIGHT_WITH_SYSTEM : ROW_HEIGHT;
  const rowHeight = Math.ceil(baseRowHeight * Math.max(1, textZoomLevel));
  const leadingInset = Math.max(0, (rowHeight - ARTWORK_SIZE) / 2);
  return {
    textZoomed: textZoomLevel > 1,
    rowHeight,
    leadingInset,
    rowMinHeight: (index: number) =>
      index === 0 ? rowHeight - leadingInset : rowHeight,
  };
}

/**
 * Rows centre their artwork within a minimum height. The first row gives up
 * that leading inset so the list starts at the page's own content inset.
 */
export function libraryMediaRowBoxStyle(
  minHeight: number,
  leadingInset: number | undefined,
) {
  return leadingInset === undefined
    ? { minHeight: `${minHeight}px` }
    : {
        minHeight: `${minHeight - leadingInset}px`,
        paddingTop: 0,
        paddingBottom: `${leadingInset}px`,
      };
}
