import { Link, type LinkProps } from "@tanstack/react-router";

export function PageParentLink({
  to,
  label,
  params,
  onNavigate,
}: {
  to: LinkProps["to"];
  label: string;
  params?: LinkProps["params"];
  onNavigate?: () => void;
}) {
  return (
    <Link
      to={to}
      params={params}
      resetScroll={false}
      activeOptions={{ exact: true }}
      className="page-parent-link"
      onClick={(event) => {
        if (
          !event.defaultPrevented &&
          event.button === 0 &&
          !event.metaKey &&
          !event.ctrlKey &&
          !event.shiftKey &&
          !event.altKey
        ) {
          onNavigate?.();
        }
      }}
    >
      {label}
    </Link>
  );
}
