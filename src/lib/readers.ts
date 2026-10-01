import type { ReaderInfo } from "@/lib/models";

const nameOrder = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: "base",
});

/** API order is not stable; names and reader identities are, regardless of state. */
export function sortReaders(readers: readonly ReaderInfo[]): ReaderInfo[] {
  return [...readers].sort((left, right) => {
    const nameComparison = nameOrder.compare(
      left.info || left.id,
      right.info || right.id,
    );
    if (nameComparison !== 0) return nameComparison;
    const leftId = left.readerId ?? left.id;
    const rightId = right.readerId ?? right.id;
    return leftId < rightId ? -1 : leftId > rightId ? 1 : 0;
  });
}
