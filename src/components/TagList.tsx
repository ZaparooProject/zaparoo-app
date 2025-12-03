import { TagInfo } from "@/lib/models";
import { TagBadge } from "@/components/TagBadge";

interface TagListProps {
  tags: TagInfo[];
  maxMobile?: number;
  maxDesktop?: number;
}

export function TagList({ tags, maxMobile = 2, maxDesktop = 4 }: TagListProps) {
  if (!tags || tags.length === 0) return null;

  const sortedTags = tags.sort((a, b) => {
    // Prioritize region and lang tags first
    const aPriority = a.type === "region" || a.type === "lang" ? 0 : 1;
    const bPriority = b.type === "region" || b.type === "lang" ? 0 : 1;
    return aPriority - bPriority;
  });

  return (
    <div className="mt-1 flex flex-wrap gap-1.5">
      {sortedTags.slice(0, maxDesktop).map((tag, tagIndex) => (
        <span
          key={tagIndex}
          className={tagIndex >= maxMobile ? "hidden sm:inline-block" : ""}
        >
          <TagBadge type={tag.type} tag={tag.tag} />
        </span>
      ))}
      {tags.length > maxMobile && (
        <span className="inline-block rounded-full border border-white/10 bg-white/10 px-2.5 py-1 text-xs text-white/60 sm:hidden">
          +{tags.length - maxMobile}
        </span>
      )}
      {tags.length > maxDesktop && (
        <span className="hidden rounded-full border border-white/10 bg-white/10 px-2.5 py-1 text-xs text-white/60 sm:inline-block">
          +{tags.length - maxDesktop}
        </span>
      )}
    </div>
  );
}
