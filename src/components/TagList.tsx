import { TagInfo } from "@/lib/models";
import { TagBadge } from "@/components/TagBadge";
import { Badge } from "@/components/wui/Badge";

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
        <Badge className="sm:hidden">+{tags.length - maxMobile}</Badge>
      )}
      {tags.length > maxDesktop && (
        <Badge className="hidden sm:inline-flex">
          +{tags.length - maxDesktop}
        </Badge>
      )}
    </div>
  );
}
