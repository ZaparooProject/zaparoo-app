import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { TagInfo } from "@/lib/models";
import { TagBadge } from "@/components/TagBadge";
import { Badge } from "@/components/wui/Badge";

interface TagListProps {
  tags: TagInfo[];
  preserveOrder?: boolean;
  formatTag?: (tag: TagInfo) => string;
}

interface TagMeasurements {
  key: string;
  tagWidths: number[];
  overflowWidths: number[];
}

function fittingTagCount(
  availableWidth: number,
  tagWidths: number[],
  overflowWidths: number[],
  gap: number,
): number {
  const total = tagWidths.length;
  const allTagsWidth =
    tagWidths.reduce((sum, width) => sum + width, 0) +
    Math.max(0, total - 1) * gap;
  if (allTagsWidth <= availableWidth) return total;

  for (let count = total - 1; count >= 1; count -= 1) {
    const tagsWidth =
      tagWidths.slice(0, count).reduce((sum, width) => sum + width, 0) +
      count * gap;
    const remaining = total - count;
    if (tagsWidth + (overflowWidths[remaining] ?? 0) <= availableWidth) {
      return count;
    }
  }

  return 1;
}

export function TagList({
  tags,
  preserveOrder = false,
  formatTag,
}: TagListProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const tagRefs = useRef<Array<HTMLSpanElement | null>>([]);
  const measurementsRef = useRef<TagMeasurements | null>(null);
  const displayTags = useMemo(
    () =>
      preserveOrder
        ? tags
        : [...tags].sort((a, b) => {
            const aPriority = a.type === "region" || a.type === "lang" ? 0 : 1;
            const bPriority = b.type === "region" || b.type === "lang" ? 0 : 1;
            return aPriority - bPriority;
          }),
    [preserveOrder, tags],
  );
  const measurementKey = displayTags
    .map((tag) => `${tag.type}\0${tag.tag}\0${formatTag?.(tag) ?? ""}`)
    .join("\u0001");
  const [layout, setLayout] = useState({ key: "", visibleCount: tags.length });
  const visibleCount =
    layout.key === measurementKey ? layout.visibleCount : displayTags.length;

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container || displayTags.length === 0) return;

    const measureTags = (): TagMeasurements | null => {
      const current = measurementsRef.current;
      if (current?.key === measurementKey) return current;

      const elements = tagRefs.current.slice(0, displayTags.length);
      if (elements.some((element) => !element)) return null;

      const tagWidths = elements.map((element) => element?.offsetWidth ?? 0);
      if (tagWidths.some((width) => width === 0)) return null;

      const badge = elements[0]?.firstElementChild?.cloneNode(true);
      if (!(badge instanceof HTMLElement)) return null;
      badge.removeAttribute("aria-label");
      badge.style.position = "absolute";
      badge.style.visibility = "hidden";
      badge.style.width = "max-content";
      container.appendChild(badge);

      const overflowWidths = Array(displayTags.length + 1).fill(0) as number[];
      for (let remaining = 1; remaining <= displayTags.length; remaining += 1) {
        badge.textContent = `+${remaining}`;
        overflowWidths[remaining] = badge.offsetWidth;
      }
      badge.remove();

      const measured = { key: measurementKey, tagWidths, overflowWidths };
      measurementsRef.current = measured;
      return measured;
    };

    const update = () => {
      const measured = measureTags();
      if (!measured || container.clientWidth === 0) return;

      const parsedGap = Number.parseFloat(
        getComputedStyle(container).columnGap,
      );
      const gap = Number.isFinite(parsedGap) ? parsedGap : 0;
      const nextCount = fittingTagCount(
        container.clientWidth,
        measured.tagWidths,
        measured.overflowWidths,
        gap,
      );
      setLayout((current) =>
        current.key === measurementKey && current.visibleCount === nextCount
          ? current
          : { key: measurementKey, visibleCount: nextCount },
      );
    };

    update();
    const observer =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update);
    observer?.observe(container);
    return () => observer?.disconnect();
  }, [displayTags.length, measurementKey]);

  if (displayTags.length === 0) return null;

  const accessibleTags = displayTags
    .map((tag) => `${tag.type} ${tag.label || tag.tag}`)
    .join(", ");

  return (
    <>
      <span className="sr-only">{accessibleTags}</span>
      <div
        ref={containerRef}
        aria-hidden="true"
        className="mt-1 flex min-w-0 flex-nowrap items-center gap-1.5 overflow-hidden whitespace-nowrap"
      >
        {displayTags.slice(0, visibleCount).map((tag, tagIndex) => (
          <span
            key={`${tag.type}:${tag.tag}:${tagIndex}`}
            ref={(element) => {
              tagRefs.current[tagIndex] = element;
            }}
            className="shrink-0"
          >
            <TagBadge
              type={tag.type}
              tag={tag.tag}
              displayTag={formatTag?.(tag)}
            />
          </span>
        ))}
        {visibleCount < displayTags.length && (
          <Badge>+{displayTags.length - visibleCount}</Badge>
        )}
      </div>
    </>
  );
}
