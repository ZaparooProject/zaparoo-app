interface TagBadgeProps {
  type: string;
  tag: string;
}

export function TagBadge({ type, tag }: TagBadgeProps) {
  return (
    <span className="inline-block px-2.5 py-1 text-xs rounded-full bg-white/20 text-white border border-white/10">
      {type}:{tag}
    </span>
  );
}
