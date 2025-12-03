interface TagBadgeProps {
  type: string;
  tag: string;
}

export function TagBadge({ type, tag }: TagBadgeProps) {
  return (
    <span
      className="inline-block rounded-full border border-white/10 bg-white/20 px-2.5 py-1 text-xs text-white"
      aria-label={`${type} ${tag}`}
    >
      <span aria-hidden="true">
        {type}:{tag}
      </span>
    </span>
  );
}
