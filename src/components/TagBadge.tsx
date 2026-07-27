import { Badge } from "@/components/wui/Badge";

interface TagBadgeProps {
  type: string;
  tag: string;
}

export function TagBadge({ type, tag }: TagBadgeProps) {
  return (
    <Badge aria-label={`${type} ${tag}`}>
      <span aria-hidden="true">
        {type}:{tag}
      </span>
    </Badge>
  );
}
