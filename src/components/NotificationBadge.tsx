import classNames from "classnames";

export function NotificationBadge(props: {
  count: number;
  className?: string;
}) {
  if (props.count <= 0) return null;

  return (
    <span
      aria-hidden="true"
      className={classNames(
        "ring-background bg-error text-background absolute flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] leading-none font-bold ring-2",
        props.className,
      )}
    >
      {props.count > 99 ? "99+" : props.count}
    </span>
  );
}
