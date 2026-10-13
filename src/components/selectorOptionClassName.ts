import classNames from "classnames";

/** Row geometry and state colors shared by the system and tag selectors. */
export function selectorOptionClassName(
  selected: boolean,
  options: { twoLine?: boolean; fillHeight?: boolean } = {},
) {
  return classNames(
    "flex w-full items-center gap-3 rounded-md px-2 py-2 text-left transition-colors",
    options.twoLine ? "min-h-16" : "min-h-12",
    "focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none focus-visible:ring-inset",
    "hover:bg-surface-highlight focus-visible:bg-surface-highlight",
    { "bg-surface-highlight": selected, "h-full": options.fillHeight },
  );
}
