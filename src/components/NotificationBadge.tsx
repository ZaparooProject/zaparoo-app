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
        "absolute flex h-4 min-w-4 items-center justify-center rounded-full bg-red-700 px-1 text-[10px] leading-none font-bold text-white ring-2 ring-[#111928]",
        props.className,
      )}
    >
      {props.count > 99 ? "99+" : props.count}
    </span>
  );
}
