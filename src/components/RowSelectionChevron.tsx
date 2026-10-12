import { NextFilledIcon, NextIcon } from "@/lib/images";

/**
 * Trailing chevron of a row that opens details. The selected row swaps the
 * outline chevron for a solid arrow, so selection never rests on colour alone;
 * `.library-browse-row[aria-current]` adds the colour.
 */
export function RowSelectionChevron({
  selected,
  className = "",
}: {
  selected: boolean;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={`library-browse-row-chevron shrink-0 ${className}`}
    >
      {selected ? <NextFilledIcon size="20" /> : <NextIcon size="20" />}
    </span>
  );
}
