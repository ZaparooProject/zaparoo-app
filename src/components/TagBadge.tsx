import { Badge } from "@/components/wui/Badge";

interface TagBadgeProps {
  type: string;
  tag: string;
  displayTag?: string;
}

export function TagBadge({ type, tag, displayTag }: TagBadgeProps) {
  return (
    <Badge aria-label={`${type} ${tag}`}>
      <span aria-hidden="true">{displayTag ?? `${type}:${tag}`}</span>
    </Badge>
  );
}
