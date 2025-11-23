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
    const aPriority = (a.type === 'region' || a.type === 'lang') ? 0 : 1;
    const bPriority = (b.type === 'region' || b.type === 'lang') ? 0 : 1;
    return aPriority - bPriority;
  });

  return (
    <div className="flex flex-wrap gap-1.5 mt-1">
      {sortedTags
        .slice(0, maxDesktop)
        .map((tag, tagIndex) => (
          <span key={tagIndex} className={tagIndex >= maxMobile ? "hidden sm:inline-block" : ""}>
            <TagBadge type={tag.type} tag={tag.tag} />
          </span>
        ))}
      {tags.length > maxMobile && (
        <span className="inline-block sm:hidden px-2.5 py-1 text-xs rounded-full bg-white/10 text-white/60 border border-white/10">
          +{tags.length - maxMobile}
        </span>
      )}
      {tags.length > maxDesktop && (
        <span className="hidden sm:inline-block px-2.5 py-1 text-xs rounded-full bg-white/10 text-white/60 border border-white/10">
          +{tags.length - maxDesktop}
        </span>
      )}
    </div>
  );
}
