import { forwardRef, type SelectHTMLAttributes } from "react";
import classNames from "classnames";
import { ChevronDown } from "lucide-react";

/**
 * Native select with a drawn chevron. Browsers and WebViews each place their
 * own arrow differently, so it is hidden and replaced to keep the right inset
 * identical on every screen.
 */
export const Select = forwardRef<
  HTMLSelectElement,
  SelectHTMLAttributes<HTMLSelectElement>
>(function Select({ className, children, ...props }, ref) {
  return (
    <div className="relative w-full">
      <select
        ref={ref}
        className={classNames(
          "wui-input border-input text-foreground min-h-12 w-full appearance-none rounded-md border border-solid py-2 pr-11 pl-3 disabled:cursor-not-allowed disabled:opacity-60",
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        aria-hidden="true"
        size={20}
        className="text-muted-foreground pointer-events-none absolute top-1/2 right-3 -translate-y-1/2"
      />
    </div>
  );
});
