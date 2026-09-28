import { type ComponentProps, type ReactElement } from "react";
import {
  Link,
  type AnyRouter,
  type LinkComponentProps,
  type RegisteredRouter,
} from "@tanstack/react-router";
import classNames from "classnames";
import { useHapticPress } from "@/hooks/useHapticPress";

interface LinkButtonExtras {
  label: string;
  icon?: ReactElement;
  variant?: "fill" | "secondary" | "outline";
}

/**
 * A navigation link that wears the wui Button face. It keeps link semantics
 * (href, middle-click, "link" role) while the shared button materials come
 * from the same data attributes the Button primitive sets.
 */
export function LibraryLinkButton<
  TRouter extends AnyRouter = RegisteredRouter,
  TFrom extends string = string,
  TTo extends string | undefined = ".",
  TMaskFrom extends string = TFrom,
  TMaskTo extends string = ".",
>({
  label,
  icon,
  variant = "secondary",
  className,
  onPointerUp,
  ...linkProps
}: Omit<
  LinkComponentProps<"a", TRouter, TFrom, TTo, TMaskFrom, TMaskTo>,
  "children"
> &
  LinkButtonExtras) {
  const handleHapticPress = useHapticPress();
  return (
    <Link
      {...(linkProps as unknown as ComponentProps<typeof Link>)}
      data-variant={variant}
      data-intent="default"
      data-size="default"
      data-icon-only={false}
      data-shape="round"
      className={classNames(
        "wui-button flex min-h-12 min-w-12 shrink-0 cursor-pointer touch-manipulation flex-row items-center justify-center gap-2 border border-solid border-transparent px-5 py-3 text-sm font-bold tracking-wider uppercase",
        className as string | undefined,
      )}
      onPointerUp={(event) => {
        handleHapticPress(event);
        (onPointerUp as ((e: typeof event) => void) | undefined)?.(event);
      }}
    >
      {icon && (
        <span
          className="wui-button-icon flex shrink-0 items-center"
          aria-hidden="true"
        >
          {icon}
        </span>
      )}
      {label}
    </Link>
  );
}
