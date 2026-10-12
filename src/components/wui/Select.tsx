import {
  forwardRef,
  useId,
  type ReactNode,
  type SelectHTMLAttributes,
} from "react";
import classNames from "classnames";
import { ChevronDownIcon } from "lucide-react";

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  /** Visible label rendered above the field and associated with it. */
  label?: string;
  /** Help control rendered beside the label, outside the label element. */
  help?: ReactNode;
}

/**
 * Native select with a drawn chevron. Browsers and WebViews each place their
 * own arrow differently, so it is hidden and replaced to keep the right inset
 * identical on every screen.
 */
export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  function Select({ className, children, label, help, id, ...props }, ref) {
    const generatedId = useId();
    const selectId = id ?? generatedId;

    const field = (
      <div className="relative w-full">
        <select
          ref={ref}
          id={label ? selectId : id}
          className={classNames(
            "wui-input text-foreground min-h-12 w-full appearance-none border border-solid py-2 pr-11 pl-3",
            className,
          )}
          {...props}
        >
          {children}
        </select>
        <ChevronDownIcon
          aria-hidden="true"
          size={20}
          className="text-muted-foreground pointer-events-none absolute top-1/2 right-3 -translate-y-1/2"
        />
      </div>
    );

    if (!label) return field;

    return (
      <div className="w-full">
        <div className="mb-2 flex items-center gap-1">
          <label htmlFor={selectId} className="block text-sm font-medium">
            {label}
          </label>
          {help}
        </div>
        {field}
      </div>
    );
  },
);
